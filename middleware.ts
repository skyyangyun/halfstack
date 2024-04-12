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
