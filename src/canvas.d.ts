import { AxiosRequestConfig, AxiosResponse } from 'axios';
import { EventEmitter } from 'events';
import OAuth from './oauth2';

export = Canvas;

interface CanvasOptions {
  name: string;
  emitter: EventEmitter;
}

interface TokenFunctions {
  getToken(userId: string): Promise<TokenResult>;
  setToken(userId: string, tokens: string[]): Promise<void>;
}

interface TokenResult {
  access_token: string;
  refresh_token: string;
}

interface CanvasOptions {
  orgName: string;
  hostedUrl: string;
  redirectUri: string;
  accessToken: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  fxs: TokenFunctions
};

interface AuthURLOptions {
  redirect_uri: string;
  state: string;
  scopes: string[];
};

interface GetTokensOptions {
  code: string;
  userId: string;
  redirectUrl: string;
};

declare class Canvas {
  constructor(options: CanvasOptions);

  orgName: string;
  hostedUrl: string;
  redirectUri: string;
  accessToken: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;

  getUserToken(userId: string): Promise<TokenResult>;
  getAuthorizationURL(options: AuthURLOptions): string;
  setUserToken(userId: string, tokens: string[]): Promise<void>;
  getTokens(options: GetTokensOptions): Promise<OAuth.PostResponse>;
  handleError(err: Error, code: string, redirectUrl: string): void;
  isTokenExpired(err: Error): boolean;
  makeRequest(userId: string, requestConfig: AxiosRequestConfig, retries: number): Promise<AxiosResponse>;
  refreshToken(userId: string, refresh_token: string): Promise<void>;
}
