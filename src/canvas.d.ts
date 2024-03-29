import { AxiosResponse } from 'axios';
import { RequestConfig } from './types';
import { Tokens, SubmissionStates, GetAccessToken, SetAccessToken } from './common';

export interface AuthURLOptions {
  state: string;
  scopes: string[];
}

export interface CanvasProfile {
  id: string;
  name: string;
  short_name: string;
  sortable_name: string;
  title?: string;
  bio?: string;
  primary_email: string;
  login_id: string;
  sis_user_id: string;
  lti_user_id?: string;
  avatar_url: string;
  calendar?: string;
  time_zone?: string;
  locale?: string;
  k5_user: boolean;
  use_classic_font_in_k5: boolean;
  // our own addition not in api
  email?: string;
}

export interface CanvasOptions {
  orgName?: string;
  hostedUrl: string;
  redirectUri: string;
  accessToken?: string;
  refreshToken?: string;
  clientId: string;
  clientSecret: string;
  fxs: { getToken: GetAccessToken, setToken: SetAccessToken };
  userId: string;
  canvasUserId?: string;
}

export class Canvas {
  constructor(options: CanvasOptions);

  orgName?: string;
  hostedUrl: string;
  redirectUri: string;
  accessToken?: string;
  refreshToken?: string;
  clientId: string;
  clientSecret: string;
  getUserToken: GetAccessToken;
  setUserToken: SetAccessToken;
  userId: string;
  canvasUserId: string;

  static SUBMISSION_STATE: SubmissionStates;

  build(): Promise<Canvas>;
  getAuthorizationURL(options: AuthURLOptions): string;
  getTokensFromCode(code: string): Promise<{ accessToken: string; refreshToken: string }>;
  handleError(err: Error, code: string, redirectUrl: string): void;
  isTokenExpired(err: Error): boolean;
  makeRequest(requestConfig: RequestConfig, retries?: number): Promise<AxiosResponse>;
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
