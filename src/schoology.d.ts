import { RequestToken, AccessToken } from './oauth';
import { GetUserToken, SetUserToken, SubmissionStates } from './common';

export interface SchoologyOptions {
  schoologyProfileId: string;
  requestToken?: RequestToken;
  accessToken?: AccessToken;
  fxs: {
    cacheRequestToken?: (any) => Promise<any>;
    getAccessToken?: GetUserToken;
    setAccessToken?: SetUserToken;
  };
  hostedUrl: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
  userId: string;
}

export class Schoology {
  constructor(options: SchoologyOptions);

  hostedUrl: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
  userId: string;
  schoologyProfileId: string;
  cacheRequestToken: (any) => Promise<any>;
  getUserToken: GetUserToken; 
  setUserToken: SetUserToken;
  oAuth: OAuth;

  static SUBMISSION_STATE: SubmissionStates;

  build(): Promise<Schoology>;
  getAuthorizationURL(): string;
  getAccessTokens(storeUserAccessTokens?: boolean): Promise<any>;
  getProfile(): Promise<any>;
  getTokensFromUser(): Promise<void>;
  getCourses(): Promise<any[]>;
  getAllSectionsForCourse(courseId: string): Promise<any[]>;
  announce(args: { sectionId: string; title: string; body: any; args: any }): Promise<void>;
  listStudents(args: { sectionId: string }): Promise<any[]>;
  getCourseStudents(args: { courseId: string }): Promise<any[]>;
  getUserIdFromTokens(): Promise<string>;
  getUserProfile(): Promise<any>;
  getSection(args: { sectionId: string }): Promise<any>;
  getGradingPeriod(args: { gradingPeriodId: string }): Promise<any>;
  selectGradingPeriod(args: { sectionId: string }): Promise<void>;
  createAssignment(args: { sectionId: string; assignmentName: string; assignmentDescription?: string; dueAt?: Date; studentIds: string[]; gradeCategoryId:string; options: any }): Promise<any>;
  submitAssignment(args: { sectionId: string; assignmentId: string; submissionUrl: string }): Promise<any>;
  gradeSubmission(args: { sectionId: string; assignmentId: string; enrollmentId: string; grade: number | string; comment?: string }): Promise<any>;
  getSubmission(args: { courseId: string; assignmentId: string; studentSchoologyId: string }): Promise<any>;
  listSubmissions(args: {sectionId: string; assignmentId: string}): Promise<any[]>;
  gradeMultipleSubmissions(args: { sectionId: string; userGradesAndComments: any; }): Promise<any>;
  getGrades(args: { sectionId: string; assignmentId?: string, enrollment?: string, timestamp?: string }): Promise<any>;
  getGradeCategoryForSection(args: {sectionId: string; id: string }): Promise<any>;
  getAllGradeCategoriesForSection(args: {sectionId: string}): Promise<any[]>;
  createGradeCategoriesForSection(args: {sectionId: string; categories: any[]}): Promise<any>;
  handleError(err: Error, request: any = {}, meta: any = {}): void;
  isTokenExpired(err: Error): boolean;
  makeRequest(request: any, meta: any = {}): Promise<any>;
  paginatedCollect(requestConfig: any, keyWithPaginatedResults: string): Promise<any>;
  getUsers(query: any): Promise<any>;
  getBuildingCourses(args: {buildingId: string}): Promise<any>;
  listUsers(args: {sectionId: string; query: any = {'type' : ['admin']}}): Promise<any>;
  getUser(id: string): Promise<any>
  getBuilding(id: string): Promise<any>
  getSchool(id: string): Promise<any>
  getInfo(data: any): Promise<any>
}
