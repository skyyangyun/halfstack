import {
    STATUS_CODE,
} from "https://deno.land/std/http/status.ts";
import { accepts } from "https://deno.land/std/http/mod.ts";

import HttpServer = Deno.HttpServer;

interface RouteMeta {
    path: string
    method?: string
    contentType?: string
    doc?: any
    parameters?: any[]
}
interface Route extends RouteMeta {
    handle: Handler
}

interface HalfstackConfig {
    docPath?: string
    apiDirectory?: string
}

let docPageBlob: Blob
export default class Halfstack {
    #httpServer?: HttpServer
    routeList: Route[] = []
    config: Record<string, any>

    constructor(config: HalfstackConfig = {}) {
        this.config = config = {
            docPath: '/',
            apiDirectory: 'api',
            ...config
        }

        const { docPath, apiDirectory } = config

        // add docs routes
        if (typeof docPath !== 'string')
            throw new Error('docPath must be a string')
        this.addRoute({ path: docPath, contentType: 'text/html', }, this.#handleAPIDocs.bind(this))
        this.addRoute({ path: docPath, contentType: 'application/json', }, this.#handleOpenAPI.bind(this))

        // load api routes
        if (typeof apiDirectory !=='string') throw new Error('apiDirectory must be a string')
        if (apiDirectory.startsWith('/')) throw new Error('apiDirectory can not start with / . It can not start root directory, must start from current directory')
        this.#loadRoutes(`${Deno.cwd()}/${apiDirectory}`)
    }

    async #loadRoutes(path: string) {
        const tasks = []
        for await (const entry of Deno.readDir(path)) {
            const { name, isDirectory } = entry
            const fullPath = `${path}/${name}`

            if (isDirectory) {
                tasks.push(this.#loadRoutes(fullPath))
                continue
            }

            if (!/.(js)|(ts)$/.test(name)) continue

            const parseTask = import(fullPath).then((module: Record<string, LooseHandler>) => {
                for(const handle of Object.values(module)) {
                    if(!('route' in handle)) continue
                    this.addRoute(handle.route as RouteMeta, handle)
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
        const inner: Handler = (context: any) => this.#handleRequest(context.request)
        const outer = this.#middlewareList.reduce(
            (next: Handler, middleware) =>
                (context) => middleware(context, next),
            inner)
        return outer({request})
    }

    async #handleRequest(request: Request): Promise<Response> {
        const url = new URL(request.url)
        const { pathname } = url

        let params: Record<string, any> | undefined = undefined
        // path filter
        let list = this.routeList.filter(({ path }) => {
            // if(path === '/hello/{name}') debugger
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
                            params[name] = convertType(params[name], type)
                        }
                        break;
                    case 'query':
                        search[name] = convertType(search[name], type)
                }
            }
        }

        const { handle } = matched
        const context = {
            request,
            params,
            search,
            query: search,
            data,
            body: null,
        }

        const result = await handle(context)
        if (result instanceof Response) return result
        if (!contentType || contentType === 'application/json') return new JSONResponse(result)
        if (contentType === 'text/plain') return new TextResponse(result)
        if (contentType === 'text/html') return new HTMLResponse(result)
        throw new Error('没有转换器')
    }

    async #handleAPIDocs() {
        docPageBlob ??= await fetch(import.meta.resolve('./swagger.html')).then(response => response.blob())
        return new Response(docPageBlob)
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
    addRoute(meta: RouteMeta, handle: LooseHandler): void
    addRoute(route: Route, handle?: LooseHandler) {
        if (handle) {
            route.handle = handle
        }

        if(!route.path.startsWith('/')) throw new Error('Path must start with /')

        route.parameters ??= []
        this.routeList.push(route)
    }

    #middlewareList: Middleware[] = []
    middleware(fn: Middleware) {
        this.#middlewareList.push(fn)
    }

    addRouter() {}
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

export class Router {
    constructor(prefix = '') {
    }
}

export type Async<T> = Promise<T> | T

interface LooseHandler  {
    (context: any): Async<any>
}
interface Handler extends LooseHandler{
    (context: any): Async<Response>
}
export interface Middleware {
    (context: any, next: Handler): Async<Response>
}
export class TextResponse extends Response {
    constructor(text: BodyInit) {
        super(text, {
            headers: {
                "Content-Type": "text/plain"
            }
        });
    }
}

export class JSONResponse<T> extends Response {
    constructor(data: T) {
        super(JSON.stringify(data), {
            headers: {
                "Content-Type": "application/json"
            }
        });
    }
}

export class HTMLResponse extends Response {
    constructor(html: BodyInit) {
        super(html, {
            headers: {
                "Content-Type": "text/html"
            }
        });
    }
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
