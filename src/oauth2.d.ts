export interface PostResponse {
  status: string;
  data: any;
}

export function makeURL(apiURL: string, path: string, query: {[_:string]: string}): string;
// export function post<T>(host: string, path: string, query: string, data: string, headers?: {[_:string]: string}): T;
export function get<T>(host: string, path: string, query: {[_:string]: string}, headers: {[_:string]: string}): T;
export function post(host: string, path: string, query: {[_:string]: string}, data: string, headers?:{ [_: string]: string }): Promise<PostResponse>;