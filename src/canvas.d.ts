import { AxiosRequestConfig } from "axios";

interface PostRefreshCallbackArgs {
  accessToken: string;
  refreshToken: string;
  user: { id: string; name: string; };
}
declare class Canvas {
  orgName: string;
  hostedUrl: string;
  redirectUri: string;
  accessToken: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  postRefreshCallback: (args: PostRefreshCallbackArgs) => Promise<void>;

  constructor(props: {
    orgName: string;
    hostedUrl: string;
    redirectUri: string;
    accessToken: string;
    refreshToken: string;
    clientId: string;
    clientSecret: string;
    postRefreshCallback: (args: PostRefreshCallbackArgs) => Promise<void>;
  });
  url(path: string): string;
  refreshToken(): Promise<string>;
  call<T>(conf: AxiosRequestConfig, retry?: boolean): Promise<T>;
}

export = Canvas;