import { AxiosResponse } from 'axios';
import {RequestConfig} from './types';
import OAuth from './oauth2';

interface Tokens {
  accessToken: string;
  refreshToken: string;
  canvasUserId: string;
}

type GetUserToken = (userId: string) => Promise<Tokens>;
type SetUserToken = (userId: string, tokens: Tokens) => Promise<void>;

interface AuthURLOptions {
  redirect_uri: string;
  state: string;
  scopes: string[];
}

export interface CanvasProfile {
  id: string;
  name: string;
  primary_email: string;
  locale: string;
}

declare enum SubmissionStates {
  SUBMITTED = 'submitted',
  GRADED = 'graded',
  UNSUBMITTED = 'unsubmitted',
}

export = Canvas;
declare class Canvas {
  constructor(options: {
    hostedUrl: string;
    redirectUri: string;
    accessToken: string;
    refreshToken: string;
    clientId: string;
    clientSecret: string;
    fxs: { getToken: GetUserToken, setToken: SetUserToken };
    userId: string;
    canvasUserId?: string;
  });
  hostedUrl: string;
  redirectUri: string;
  accessToken: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  getUserToken: GetUserToken;
  setUserToken: SetUserToken;
  userId: string;
  canvasUserId: string;

  static SUBMISSION_STATE: SubmissionStates;

  build(): Promise<Canvas>;
  getAuthorizationURL(options: AuthURLOptions): string;
  getTokensFromCode(code: string): Promise<OAuth.PostResponse>;
  handleError(err: Error, code: string, redirectUrl: string): void;
  isTokenExpired(err: Error): boolean;
  makeRequest(requestConfig: RequestConfig, retries: number): Promise<AxiosResponse>;
  getProfile(): Promise<CanvasProfile>;
  getUserProfile(id: number): Promise<CanvasProfile>;
  getTokensFromUser(): Promise<void>;

  getAccounts(): Promise<Account[]>;
  getAccountUsers(id: number, data?: { enrollment_type: string[] }): Promise<User[]>;

  getCourses(): Promise<Course[]>;
  announce(args: { courseId: string; pinned?: boolean; title: string; message: string }): Promise<void>;
  listStudents(args: { courseId: string }): Promise<Student[]>;
  createAssignment(args: { courseId: string; assignmentName: string; assignmentDescription?: string; dueAt?: Date; unlockAt?: Date; }): Promise<Assignment>;
  submitAssignment(args: { courseId: string; assignmentId: string; submissionUrl: string }): Promise<Submission>;
  getSubmission(args: { courseId: string; assignmentId: string; studentCanvasId: string }): Promise<Submission>;
  listSubmissions(args: {courseId: string; assignmentId: string}): Promise<Submission[]>;
  gradeSubmission(args: { courseId: string; assignmentId: string; studentCanvasId: string; grade: number | string; comment?: string }): Promise<GradeSubmissionResponse>;
  gradeMultipleSubmissions(args: { courseId: string; assignmentId: string; userGradesAndComments: {[studentCanvasId: string]: {grade: number | string, comment?: string } } }): Promise<{id: number; url: string}>;
}

interface GradeSubmissionResponse extends Submission {
  all_submissions: Submission[];
}
interface Course {
  id: number;
  name: string;
}

export interface Account {
  id: number,
  name: string,
  uuid: string,
};

export interface User {
  id: number,
  name: string,
  first_name: string,
  last_name: string,
  login_id: string,
  email?: string,
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
