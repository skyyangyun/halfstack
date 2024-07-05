import {getCookies} from "https://deno.land/std@0.221.0/http/cookie.ts";

export async function InOutLogMiddleware(context: any, next: (context: any) => Promise<Response>): Promise<Response> {
    const time = new Date().toISOString()
    console.time(time)
    const { request } = context
    const { url, method } = request as Request
    const response = await next(context)
    const body = await response.clone().text()
    console.timeEnd(time)
    console.log(`[${time}]`, response.status, method, url, body.replaceAll(/[\r\n]+/g, ''))
    return response
}

export async function CookiesTokenMiddleware(context: any, next: (context: any) => Promise<Response>): Promise<Response> {
    const request: Request = context.request
    const cookies = getCookies(request.headers)
    request.headers.getSetCookie()
}
