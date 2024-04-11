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
}
interface Route extends RouteMeta {
    handle: Function
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
        this.#loadRoutes(`${Deno.cwd()}/${apiDirectory}`)
    }

    async #loadRoutes(path: string) {
        const tasks = []
        for await (const entry of Deno.readDir(path)) {
            const { name, isDirectory, isFile } = entry
            const fullPath = `${path}/${name}`

            if (isDirectory) {
                tasks.push(this.#loadRoutes(fullPath))
                continue
            }

            if (!/.(js)|(ts)$/.test(name)) continue

            const parseTask = import(fullPath).then((module: Record<string, Function>) => {
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
        this.#httpServer = Deno.serve(options, this.#handleRequest.bind(this))
        return this.#httpServer.finished
    }

    async shutdown() {
        if (!this.#httpServer) throw new Error("Server is not running")

        await this.#httpServer.shutdown()
        this.#httpServer = undefined
    }

    async #handleRequest(request: Request): Promise<Response> {
        const url = new URL(request.url)
        const { pathname } = url

        // path filter
        let list = this.routeList.filter(({ path }) => {
            const regexp = new RegExp(`^${path}(\/)?$`)
            return regexp.test(pathname)
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

        const { handle } = matched
        const context = {
            request,
            params: {},
            search,
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
            path[route.method?.toLowerCase() || 'get'] = route.doc ?? {}
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
    addRoute(meta: RouteMeta, handle: Function): void
    addRoute(route: Route, handle?: Function) {
        if (handle) {
            route.handle = handle
        }

        if(!route.path.startsWith('/')) throw new Error('Path must start with /')

        this.routeList.push(route)
    }

    addRouter() {}
}

export class Router {

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
