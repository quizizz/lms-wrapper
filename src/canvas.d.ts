import { AxiosRequestConfig, AxiosResponse } from 'axios';
import { EventEmitter } from 'events';
import OAuth from './oauth2';

export = Canvas;

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
  userId: string;
};

interface AuthURLOptions {
  redirect_uri: string;
  state: string;
  scopes: string[];
};

interface CanvasProfile {
  id: string;
  name: string;
  primary_email: string;
  locale: string;
}

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
  getTokensFromCode(code: string): Promise<OAuth.PostResponse>;
  handleError(err: Error, code: string, redirectUrl: string): void;
  isTokenExpired(err: Error): boolean;
  makeRequest(requestConfig: AxiosRequestConfig, retries: number): Promise<AxiosResponse>;
  refreshToken(): Promise<void>;
  getProfile(): Promise<CanvasProfile>;
  getTokensFromUser(): Promise<void>;

}
