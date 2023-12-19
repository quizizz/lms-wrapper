/**
 * @class GCL
 */
declare class GCL {
    constructor(name: any, emitter: any, opts: any, urls?: {}, fxs?: {});
    name: any;
    emitter: any;
    apiURL: any;
    authURL: any;
    tokenURL: any;
    getUserToken: any;
    setUserToken: any;
    authClient: any;
    requestClient({ refresh_token, access_token, lastRefresh }: {
        refresh_token: any;
        access_token: any;
        lastRefresh: any;
    }): any;
    makeRequest(userId: any, api: any, params: any): any;
    requestWithToken(tokens: any, api: any, params: any): any;
    getAuthorizationURL(extras: any): any;
    /**
     * Get token from code
     * @param  {String} c
     * @return {Object} token
     * @return {String} token.access_token
     */
    getTokens(code: any): any;
    refreshToken(tokens: any): any;
    tokenInfo(userId: any): any;
    headersWithToken(tokens: any): {
        Authorization: string;
    };
    getProfile(tokens: any): any;
    getCourses(userId: any): any;
    createAssignment(userId: any, data: any): any;
    getAssignment(userId: any, { courseId, courseWorkId }: {
        courseId: any;
        courseWorkId: any;
    }): any;
    restartAssignment(userId: any, data: any): Promise<any>;
    announce(userId: any, data: any): any;
    createIndividualAssignments(userId: any, data: any): any;
    _getCourseStudents(userId: any, { courseId, pageToken }: {
        courseId: any;
        pageToken: any;
    }): Promise<any>;
    getCourseStudents(userId: any, { courseId }: {
        courseId: any;
    }): Promise<any[]>;
    getStudentSubmission(userId: any, { courseId, courseWorkId }: {
        courseId: any;
        courseWorkId: any;
    }): any;
    reclaimSubmission(userId: any, { courseId, courseWorkId, subId }: {
        courseId: any;
        courseWorkId: any;
        subId: any;
    }): any;
    addLinkToSubmission(userId: any, { courseId, courseWorkId, subId, url }: {
        courseId: any;
        courseWorkId: any;
        subId: any;
        url: any;
    }): any;
    submitStudentAssignment(userId: any, { courseId, courseWorkId, subId }: {
        courseId: any;
        courseWorkId: any;
        subId: any;
    }): any;
    _getAllSubmissions(userId: any, { courseId, courseWorkId, pageToken }: {
        courseId: any;
        courseWorkId: any;
        pageToken: any;
    }): any;
    getAllSubmissions(userId: any, { courseId, courseWorkId }: {
        courseId: any;
        courseWorkId: any;
    }): Promise<any[]>;
    gradeAssignment(userId: any, { courseId, courseWorkId, subId, newSub }: {
        courseId: any;
        courseWorkId: any;
        subId: any;
        newSub: any;
    }): any;
    returnAssignment(userId: any, { courseId, courseWorkId, subId }: {
        courseId: any;
        courseWorkId: any;
        subId: any;
    }): any;
}

export default GCL;