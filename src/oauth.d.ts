export interface RequestToken {
  token: string;
  secret: string;
  expiresAt: Date;
}

export interface AccessToken {
  token: string;
  secret: string;
  expiresAt: Date;
}

export interface OAuthConfig {
  consumerKey: string;
  consumerSecret: string;
  apiBase: string;
  authRealm: string;
  signatureMethod: string;
  nonceLength: number;
  requestToken: RequestToken;
  accessToken: AccessToken;
}

export class OAuth {
  constructor(config: OAuthConfig);

  static getTimeStamp(): number;
  static getNonce(nonceLength: number): string;
  static makeURL(apiURL: string, path: string, query: any): string;
  static appendQuery(currentUrl: string, query: any): string;
  static post(
    host: string,
    path: string,
    query: any,
    data: any,
    headers?: any
  ): Promise<any>;
  static get(
    host: string,
    path: string,
    query: any,
    headers?: any
  ): Promise<any>;
  static jsonifyResponseString(responseString: string): any;

  getRequestTokens(apiPath: string): Promise<{
    success: boolean;
    response: RequestToken;
  }>;

  getAccessTokens(apiPath: string): Promise<{
    success: boolean;
    response: AccessToken;
  }>;

  makeRequest(requestConfig: any): Promise<{
    data: any;
    status: number;
  }>;

  getOAuthDetails(attachAccessToken?: boolean): any;
  getOAuthHeader(): any;
}

