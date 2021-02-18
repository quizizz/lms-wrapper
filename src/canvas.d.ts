import { AxiosResponse } from 'axios';
import {RequestConfig} from './types';
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
  makeRequest(userId: string, requestConfig: RequestConfig, retries: number): Promise<AxiosResponse>;
  refreshToken(userId: string, refresh_token: string): Promise<void>;

  listCourses(): Promise<Course[]>;
  announce(args: { courseId: string; pinned?: boolean; title: string; message: string }): Promise<void>;
  listStudents(args: { courseId: string }): Promise<Student[]>;
  createAssignment(args: { courseId: string; assignmentName: string; assignmentDescription?: string; dueAt?: Date; unlockAt?: Date; }): Promise<Assignment>;
  submitAssignment(args: { courseId: string; assignmentId: string; submission: string }): Promise<Submission>;
  getSubmission(args: { courseId: string; assignmentId: string; userId: string }): Promise<Submission>;
  listSubmissions(args: {courseId: string; assignmentId: string}): Promise<Submission[]>;
  gradeSubmission(args: { courseId: string; assignmentId: string; userId: string; grade: number | string; comment?: string }): Promise<GradeSubmissionResponse>;
  gradeMultipleSubmissions(args: { courseId: string; assignmentId: string; userGradesAndComments: {[userId: string]: {grade: number | string, comment?: string } } }): Promise<{id: number; url: string}>;
}

interface GradeSubmissionResponse extends Submission {
  all_submissions: Submission[];
}
interface Course {
  id: number;
  name: string;
}

interface Student {
  id: number;
  name: string;
  email: string;
}

interface Assignment {
  id: number;
  description: string;
  due_at?: Date;
  unlock_at?: Date;
  published: boolean;
}

interface Submission {
  id: number;
  url: string;
  body?: string;
  grade: string;
  score: number; // float
  user_id: string;
  assignment_id: number;
  submission_type: 'online_url';
  graded_at: Date;
  attempt: number;
  workflow_state: 'submitted' | 'graded' | 'unsubmitted';
}
