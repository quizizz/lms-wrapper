import { AxiosResponse } from 'axios';
import { RequestConfig } from './types';
import { Tokens, GetUserToken, SetUserToken, SubmissionStates } from './common';

export interface AuthURLOptions {
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

export interface CanvasOptions {
  orgName: string;
  hostedUrl: string;
  redirectUri: string;
  accessToken?: string;
  refreshToken?: string;
  clientId: string;
  clientSecret: string;
  fxs: { getUserToken: GetUserToken, setUserToken: SetUserToken };
  userId: string;
  canvasUserId?: string;
}

declare class Canvas {
  constructor(options: CanvasOptions);

  orgName: string;
  hostedUrl: string;
  redirectUri: string;
  accessToken?: string;
  refreshToken?: string;
  clientId: string;
  clientSecret: string;
  getUserToken: GetUserToken;
  setUserToken: SetUserToken;
  userId: string;
  canvasUserId: string;

  static SUBMISSION_STATE: SubmissionStates;

  build(): Promise<Canvas>;
  getAuthorizationURL(options: AuthURLOptions): string;
  getTokensFromCode(code: string): Promise<Tokens>;
  handleError(err: Error, code: string, redirectUrl: string): void;
  isTokenExpired(err: Error): boolean;
  makeRequest(requestConfig: RequestConfig, retries: number): Promise<AxiosResponse>;
  getProfile(): Promise<CanvasProfile>;
  getTokensFromUser(): Promise<void>;

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

export interface GradeSubmissionResponse extends Submission {
  all_submissions: Submission[];
}
export interface Course {
  id: number;
  name: string;
}

export interface Student {
  id: number;
  name: string;
  email: string;
}

export interface Assignment {
  id: number;
  description: string;
  due_at?: Date;
  unlock_at?: Date;
  published: boolean;
}

export interface Submission {
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

export default Canvas;