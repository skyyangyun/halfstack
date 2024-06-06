import {createJSONResponse, JSONResponse} from "./mod.ts";

interface NormalizeResult<T> {
    /** 业务逻辑错误代码， 在没有错误发生的情况下，这个字段通常为0 */
    code: number;
    /** 业务逻辑错误的相关提示信息，通常会作为可读文本向用户展示 */
    message: string;
    /** 响应数据，如果发生错误，这个字段可能为null */
    data: T | null;
}

/**
 * 使用这种封装格式，将所有请求接口返回的错误信息与数据结构统一。
 * 好处是方便请求方统一处理，而且将业务逻辑错误与服务器产生的HTTP错误分离开。
 * 这是一种常见的做法，虽然这并不是HTTP的推荐做法。
 */
export class NormalizeResponse<T> extends JSONResponse<NormalizeResult<T>> {
    static DEFAULT_CODE = 0;
    static DEFAULT_MESSAGE = "success";

    /**
     * @param data 响应数据，如果发生错误，这个字段可能为null
     * @param code 业务逻辑错误代码， 在没有错误发生的情况下，这个字段通常为0
     * @param message 业务逻辑错误的相关提示信息，通常会作为可读文本向用户展示
     */
    constructor(data: T | null = null, code = NormalizeResponse.DEFAULT_CODE, message = NormalizeResponse.DEFAULT_MESSAGE){
        super({
            code,
            message,
            data,
        });
    }
}

export function createNormalizeResponse<T>(data: T | null = null, code = NormalizeResponse.DEFAULT_CODE, message = NormalizeResponse.DEFAULT_MESSAGE): NormalizeResponse<T> {
    return createJSONResponse<NormalizeResult<T>>({data, code, message});
}
