import { AxiosRequestConfig } from "axios";

declare class Canvas {
  constructor(props: {
    orgName: string;
    hostedUrl: string;
    redirectUri: string;
    accessToken: string;
    refreshToken: string;
    clientId: string;
    clientSecret: string;
    postRefreshCallback: (args: { accessToken: string; refreshToken: string; user: { id: string; name: string; }}) => Promise<void>;
  });
  url(path: string): string;
  refreshToken(): Promise<string>;
  call<T>(conf: AxiosRequestConfig, retry?: boolean): Promise<T>;
}
