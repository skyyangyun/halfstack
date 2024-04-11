import {JSONResponse} from "./mod.ts";

export class NormalizeJSONResponse<T> extends JSONResponse<{
    code: number;
    message: string;
    data: T | null;
}> {
    static DEFAULT_CODE = 200;
    static DEFAULT_MESSAGE = "success";
    constructor(data: T | null = null, code = NormalizeJSONResponse.DEFAULT_CODE, message = NormalizeJSONResponse.DEFAULT_MESSAGE){
        super({
            code,
            message,
            data,
        });
    }
}

