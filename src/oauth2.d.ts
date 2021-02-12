export function makeURL(apiURL: string, path: string, query: string): string;
export function post<T>(host: string, path: string, query: string, data: string, headers?: {[_:string]: string}): T;
export function get<T>(host: string, path: string, query: string, headers: {[_:string]: string}): T;
