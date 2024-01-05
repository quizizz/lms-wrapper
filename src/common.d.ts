export interface Tokens {
  access_token?: string,
  access_token_secret?: string, 
  token_type?: string, 
  expires_in?: Number, 
  refresh_token?: string,
  lastRefresh?: Date,
  info?: any,
}

export type GetAccessToken = (userId: string) => Promise<Tokens>;
export type SetAccessToken = (userId: string, token: Tokens) => Promise<any>;

export declare enum SubmissionStates {
  SUBMITTED = 'submitted',
  GRADED = 'graded',
  UNSUBMITTED = 'unsubmitted',
}