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
        for await (const entry of Deno.readDir(path)) {
            const { name, isDirectory, isFile } = entry
            const fullPath = `${path}/${name}`
            if (isDirectory) {
                this.#loadRoutes(fullPath)
                continue
            }

            if (!isFile || /.(js)|(ts)$/.test(name)) continue

            import(fullPath).then((module: Record<string, Function>) => {
                for(const handle of Object.values(module)) {
                    if(!('route' in handle)) continue
                    this.addRoute(handle.route as RouteMeta, handle)
                }
            })
        }
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

        let matched: Route
        for(const route of this.routeList) {
            const { path} = route
            const regexp = new RegExp(`^${path}(\/)?$`)
            if(!regexp.test(pathname)) continue

            const { contentType } = route
            if(contentType && !accepts(request, contentType)) continue

            if(matched && contentType !== accepts(request)[0]) continue
            matched = route
        }

        if (!matched) return new Response(null,{status: STATUS_CODE.NotFound})

        const { contentType } = matched
        const { handle } = matched
        const result = await handle(request)
        if (result instanceof Response) return result
        if (!contentType || contentType === 'application/json') return new JSONResponse(result)
        if (contentType === 'text/plain') return new TextResponse(result)
        if (contentType === 'text/html') return new HTMLResponse(result)
        throw new Error('没有转换器')
    }

    #handleAPIDocs() {
        return fetch(import.meta.resolve('./swagger.html'))
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

        if(!route.path.startsWith('/')) throw new Error('Path must start with a /')

        this.routeList.push(route)
    }

    addRouter() {}
}

export class Router {

}

export class TextResponse extends Response {
    constructor(text: BodyInit) {
        super(text);
    }
}

export class JSONResponse extends Response {
    constructor(data: any) {
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
