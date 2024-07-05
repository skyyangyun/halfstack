import {
    STATUS_CODE,
} from "https://deno.land/std/http/status.ts";
import { accepts } from "https://deno.land/std/http/mod.ts";

interface RouteMeta {
    path: string
    method?: string
    contentType?: string
    doc?: any
    parameters?: any[]
}
interface Route extends RouteMeta {
    handler: Handler
}

export interface HalfstackPlugin {
    name: string,
    version?: string,
    onCreated?: (halfstack: Halfstack) => void
}

interface HalfstackConfig {
    docPath?: string
    apiDir?: string | { dir: string, prefix: string}
    plugins?: any[]
}

interface HalfContext {
    request: Request
}


let docPage: string
export default class Halfstack {
    #httpServer?: Deno.HttpServer
    routerList: Router[] = []
    routeList: Array<Route | Router> = []
    config: Required<HalfstackConfig>

    constructor(config: HalfstackConfig) {
        this.config = config = {
            docPath: '/',
            apiDir: 'api',
            plugins: [],
            ...config
        }

        if(typeof config.apiDir === 'string') {
            config.apiDir = {dir: 'api', prefix: ''}
        }

        const { docPath, apiDir } = config

        // add docs routes
        if (typeof docPath !== 'string')
            throw new Error('docPath must be a string')
        this.addRoute({ path: docPath, contentType: 'text/html', }, this.#handleAPIDocs.bind(this))
        this.addRoute({ path: docPath, contentType: 'application/json', }, this.#handleOpenAPI.bind(this))

        // load api routes
        ;[apiDir!].forEach(({dir, prefix}) => {
            this.loadRoutes(`${Deno.cwd()}/${dir}`, prefix)
        })
        const { plugins } = config
        if (!Array.isArray(plugins)) throw new TypeError('plugins must be an array')
        plugins.forEach(plugin => plugin.onCreated?.(this))
    }

    async loadRoutes(path: string, prefix = '') {
        const tasks = []
        for await (const entry of Deno.readDir(path)) {
            const { name, isDirectory } = entry
            const fullPath = `${path}/${name}`

            if (isDirectory) {
                tasks.push(this.loadRoutes(fullPath))
                continue
            }

            if (!/.(js)|(ts)$/.test(name)) continue

            const parseTask = import(`file://${fullPath}`).then((module: Record<string, Handler & {route?: RouteMeta}>) => {
                for(const handler of Object.values(module)) {
                    const { route } = handler
                    if(!route) continue
                    route.path = prefix + route.path
                    this.addRoute(handler.route as RouteMeta, handler)
                }
            })
            tasks.push(parseTask)
        }
        await Promise.all(tasks)
    }

    listen(options = {}) {
        this.#httpServer = Deno.serve(options, this.#handleMiddleware.bind(this))
        return this.#httpServer.finished
    }

    async shutdown() {
        if (!this.#httpServer) throw new Error("Server is not running")

        await this.#httpServer.shutdown()
        this.#httpServer = undefined
    }

    #handleMiddleware(request: Request) {
        const inner: TightHandler = (context: HalfContext) => this.#handleRequest(context.request)
        const reducer = (next: TightHandler, middleware: Middleware) => (context: HalfContext) => middleware(context, next)
        const outer = this.#middlewareList.reduce(reducer, inner)
        return outer({request})
    }

    async #handleRequest(request: Request): Promise<Response> {
        const url = new URL(request.url)
        const { pathname } = url

        let list: Route[]
        let params: Record<string, string> | undefined = undefined

        // router filter
        const router = this.routerList.find(
            ({ config: { prefix, exclude }}) => !exclude.includes(pathname) && pathname.startsWith(prefix)
        )
        if (router) {
            list = router.routeList
        }

        // path filter
        list ??= this.routeList.filter(({ path }) => {
            const regexp = new RegExp(`^${path.replaceAll(/\{(\w+)}/g, '(?<$1>[^/]+)')}(?:\/)?$`);
            const match = pathname.match(regexp);
            if(!match) return false
            params = match.groups
            return true
        })

        if (!list.length) return new Response(null,{status: STATUS_CODE.NotFound})

        // method filter
        list = list.filter(({ method }) => {
            if(!method) return true
            return method === request.method
        })
        if (!list.length) return new Response(null,{status: STATUS_CODE.MethodNotAllowed})

        // content type filter

        const matched = acceptMatch(list, request)

        if (!matched) return new Response(null,{status: STATUS_CODE.NotAcceptable})

        const { contentType } = matched

        const search: Record<string, string> = {}
        for(const [key, value] of url.searchParams) {
            search[key] = value
        }

        const data = request.headers.get("content-type") === 'application/json' ? await request.json() : null

        const parametersRule = matched.parameters
        if(parametersRule) {
            for(const {name, in: _in, type} of parametersRule) {
                switch (_in) {
                    case 'path':
                        if(params) {
                            (params[name] as any) = convertType(params[name], type)
                        }
                        break;
                    case 'query':
                        (search[name] as any) = convertType(search[name], type)
                }
            }
        }

        const { handler } = matched
        const context = {
            pathname,
            request,
            params: params as Record<string, any> | undefined,
            search: search as Record<string, any>,
            query: search as Record<string, any>,
            data,
            body: null,
        }

        const result = await handler(context)
        if (result instanceof Response) return result
        if (!contentType || contentType === 'application/json') return new JSONResponse(result)
        if (contentType === 'text/plain') return new TextResponse(result as BodyInit)
        if (contentType === 'text/html') return new HTMLResponse(result as BodyInit)
        throw new Error('没有转换器')
    }

    async #handleAPIDocs() {
        docPage ??=
            (await fetch(import.meta.resolve('./swagger.html'))
                .then(response => response.text()))
                .replace('{{DOC_PATH}}', this.config.docPath)
        return new HTMLResponse(docPage)
    }

    async #handleOpenAPI() {
        const paths: Record<string, any> = {}
        for(const route of this.routeList) {
            if (route.path === this.config.docPath) continue

            const path = paths[route.path] ??= {}
            const doc = path[route.method?.toLowerCase() || 'get'] = route.doc ?? {}
            doc.parameters = [...doc.parameters || [], ...route.parameters!]
        }
        return {
            "openapi": "3.1.0",
            "info": {
                "title": "API列表 —— 半栈",
                "version": "1.0.0"
            },
            paths,
        }
    }

    addRoute(route: Route ): void
    addRoute(meta: RouteMeta, handler: Handler): void
    addRoute(route: Route, handler?: Handler) {
        if (handler) {
            route.handler = handler
        }

        if(!route.path.startsWith('/')) throw new Error('Path must start with /')

        route.parameters ??= []
        this.routeList.push(route)
    }

    #middlewareList: Middleware[] = []
    middleware(fn: Middleware) {
        this.#middlewareList.push(fn)
    }

    addRouter(router: Router) {
        this.routerList.push(router)
    }

    static defaultRoute() {
        return new Response(null,{status: STATUS_CODE.NotFound})
    }
    defaultRoute = Halfstack.defaultRoute
}

function convertType(input: string, targetType: string) {
    switch (targetType) {
        case 'string':
            return String(input);
        case 'number':
            return Number(input);
        case 'boolean':
            // 将字符串转换为布尔值，非空字符串都会被转换为 true，空字符串为 false
            return input.toLowerCase() === 'true';
        default:
            // 如果指定了未知的目标类型，则返回原始输入
            return input;
    }
}

interface RouterConfig {
    prefix: string
    exclude?: string[]
    handler?: Handler
}
export class Router {
    config: Required<RouterConfig>
    routeList: Route[] = []

    constructor(config: RouterConfig)
    constructor(prefix: string, config?: Omit<RouterConfig, 'prefix'>)
    constructor(prefix: string | RouterConfig, config?: Omit<RouterConfig, 'prefix'>) {
        if(config) {
            (config as RouterConfig).prefix = prefix as string
        } else {
            config = typeof prefix === 'object' ? prefix as RouterConfig : { prefix }
        }
        prefix = (config as RouterConfig).prefix as string

        if(!prefix?.startsWith('/')) throw new Error('prefix must start with /')

        config.exclude ??= []

        this.config = config as Required<RouterConfig>
        if (config.handler) {
            this.addRoute({
                path: '/',
                handler: config.handler,
            })
        }
    }

    addRoute(route: Route) {
        route.path = this.config.prefix + route.path
        this.routeList.push(route)
    }
}

export type Async<T> = Promise<T> | T

interface Handler  {
    (context: HalfContext): Async<unknown>
}
interface TightHandler extends Handler {
    (context: HalfContext): Async<Response>
}
export interface Middleware extends TightHandler {
    (context: HalfContext, next: TightHandler): Async<Response>
}
export class TextResponse extends Response {
    constructor(text?: BodyInit, options?: ResponseInit) {
        super(text, options);
        this.headers.set("Content-Type", "text/plain")
    }
}

export class JSONResponse<T> extends Response {
    constructor(data?: T, options?: ResponseInit) {
        super(JSON.stringify(data), options);
        this.headers.set("Content-Type", "application/json")
    }
}

export class HTMLResponse extends Response {
    constructor(html?: BodyInit, options?: ResponseInit) {
        super(html, options);
        this.headers.set("Content-Type", "text/html")
    }
}

export function createTextResponse(text?: BodyInit, options?: ResponseInit) {
    const response = new Response(text, options)
    response.headers.set("Content-Type", "text/plain")
    return response
}

export function createJSONResponse<T>(data?: T, options?: ResponseInit) {
    const response = new Response(JSON.stringify(data), options)
    response.headers.set("Content-Type", "application/json")
    return response
}

export function createHTMLResponse(html?: BodyInit, options?: ResponseInit) {
    const response = new Response(html, options)
    response.headers.set("Content-Type", "text/html")
    return response
}


function acceptMatch(list: Route[], request: Request): Route | undefined {
    if(list.length < 2) return list[0]
    const typeList: string[] = []
    for(const { contentType } of list) {
        if (contentType) {
            typeList.push(contentType)
        }
    }
    const type = accepts(request, ...typeList)
    return list.find(route => route.contentType === type)
}
