export interface Tokens {
  accessToken: string;
  refreshToken: string;
  canvasUserId: string;
}

export type GetUserToken = (userId: string) => Promise<Tokens>;
export type SetUserToken = (userId: string, tokens: Tokens) => Promise<void>;

export declare enum SubmissionStates {
  SUBMITTED = 'submitted',
  GRADED = 'graded',
  UNSUBMITTED = 'unsubmitted',
}