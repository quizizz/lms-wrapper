
type TokenGroup = {
  token: string,
  secret: string,
  expireAt?: Date,
}


type GetUserToken = (userId: string) => Promise<any>;
type SetUserToken = (userId: string, tokens: any) => Promise<void>;

type EnrollmentFilterOptions = {
  type: string[]
}

export = Schoology;
declare class Schoology {
  hostedUrl: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
  userId: string;
  schoologyProfileId: string;
  cacheRequestToken: (any) => any;
  getUserAccessToken: GetUserToken;
  setUserAccessToken: SetUserToken;

  constructor(options: {
    hostedUrl: string,
    redirectUri: string,
    clientId: string,
    clientSecret: string,
    userId: string,
    schoologyProfileId: string,
    requestToken?: TokenGroup,
    accessToken?: TokenGroup,
    fxs: {
      getAccessToken: GetUserToken,
      setAccessToken: SetUserToken,
      cacheRequestToken: (any) => any,
    },
  });

  getAuthorizationURL(): Promise<string>;
  getProfile(): Promise<Schoology.Profile>;
  getUserProfile(): Promise<Schoology.Profile>;
  getSchool(id: string): Promise<Schoology.School>;
  getSchoolBuildings(id: string): Promise<Schoology.Building[]>;
  getBuildingCourses(params: { buildingId: string }): Promise<Schoology.Course[]>;
  getAllSectionsForCourse(courseId: string): Promise<Schoology.Section[]>;
  listUsers(params: { sectionId: string, query: EnrollmentFilterOptions }): Promise<Schoology.Enrollment[]>;
  getUser(uid: string): Promise<Schoology.Profile>;
}


declare namespace Schoology {
  export type School = {
    id: string,
    title: string,
    city: string,
    state: string,
  };
  
  export type Building = {
    id: string
    title: string,
    city: string,
    state: string,
  };
  
  export type Course = {
    id: string,
    building_id: string,
    title: string,
    department: string,
    description: string,
  };
  
  export type Section = {
    id: string,
    title: string,
    grading_periods: number[],
    description: string,
  };
  
  export type Enrollment = {
    id: string,
    uid: string,
    admin: string,
    status: string,
  };
  
  export type Profile = {
    id: string,
    primary_email: string,
    uid: string,
    school_id: string,
    building_id: string,
    school_uid: string,
    name_title: string,
    name_first: string,
    name_middle: string,
    name_last: string,
  };
}