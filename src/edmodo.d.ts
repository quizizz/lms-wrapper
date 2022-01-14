import events from "events";

interface Tokens {
    access_token: string;
    expires_in: string;
    token_type: string;
    refresh_token: string;
}

/**
 * @class  Edmodo
 */
export default class Edmodo {
  constructor(
    name: string,
    emitter: events.EventEmitter,
    opts: Record<string, object>,
    urls?: { [_: string]: string },
    fxs?: {
      getUserToken?: (userId: string) => Promise<any>;
      setUserToken?: (userId: string, refreshedToken: string) => Promise<any>;
    }
  );
  name: string;
  emitter: events.EventEmitter;
  apiURL: string;
  getUserToken: (userId: string) => Promise<string>;
  setUserToken: (userId: string, refreshedToken: string) => Promise<string>;
  /**
   * Using the options passed, create an authorization URL we can
   * redirect users, where they authorize our app
   * @return {String}
   */
  getAuthorizationURL(extras: { [_: string]: string }): string;
  /**

     * Get token by exchangin the code
     * @param  {String} c
     * @return {Object} token
     * @return {String} token.access_token
     */
  getTokens(
    code: string
  ): Promise<Tokens>;
  refreshToken(
    refresh_token: string
  ): Promise<Tokens>;
  makeHeaders(
    userId: string
  ): Promise<{ headers: { Authorization: string }; tokens: Tokens }>;
  headersWithToken(
    tokens: any
  ): { headers: { Authorization: string }; tokens: Tokens };
  checkForRefresh(err: Error, userId: string, tokens: any): any;
  get(
    userId: string,
    url: string,
    path: string,
    query: string,
    hant: { tokens: Tokens, headers: {[_:string]: string}},
    tried?: boolean
  ): any;
  post(
    userId: string,
    url: string,
    path: string,
    query: string,
    data: any,
    hant: { tokens: Tokens, headers: {[_:string]: string}},
    tried?: boolean
  ): any;
  getProfile(tokens: Tokens): any;
  getGroups(userId: string): any;
  createAssignment(userId: any, data: any): any;
  submit(userId: any, data: any): any;
  grade(userId: any, data: any): any;
}
