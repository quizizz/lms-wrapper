const axios = require('axios');
const _ = require('lodash');
const OAuth = require('./oauth2');
const LMSError = require('./error');
const { paginatedCollect } = require('./helpers/utils');

/**
 * @class Schoology
 */
class Schoology {
  constructor({
    hostedUrl,
    redirectUri,
    clientId,
    clientSecret,
    userId, // mongoId
    requestToken = {},
    accessToken = {},
    fxs = {},
  }) {
    this.hostedUrl = hostedUrl;
    this.redirectUri = redirectUri;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.userId = userId;
    this.cacheRequestToken = fxs.cacheRequestToken || (() => {});
    this.getUserAccessToken = fxs.getAccessToken || (() => {});
    this.setUserAccessToken = fxs.setAccessToken || (() => {});

    this.oAuth = new OAuth( {
      consumerKey: this.clientId, 
      consumerSecret: this.clientSecret, 
      apiBase: 'https://api.schoology.com', 
      authRealm: 'Schoology API',
      signatureMethod: 'PLAINTEXT',
      nonceLength: 16,
      requestToken,
      accessToken,
      handleError: this.handleError
    });
  }

  async build() {
    if (!this.accessToken && !this.refreshToken) {
      await this.getTokensFromUser();
    }
    return this;
  }

  /**
   * Returns a URL used to initiate the authorization process with schoology and fetch
   * the authorization code
   */
   async getAuthorizationURL(options = {}) {
    try {
      const result = await this.oAuth.getRequestTokens('/v1/oauth/request_token');
      const tokenData = result.response;

      await this.cacheRequestToken(tokenData);
      
      return OAuth.makeURL( this.hostedUrl, '/oauth/authorize', {
        'oauth_token': tokenData.token,
        'oauth_callback': this.redirectUri,
      } )
    } catch ( error ) {
      this.handleError(error)
    }
  }

  /**
   * Fetches the access and refresh tokens for a valid authorization code
   */
   async getAccessTokens() {
    try {
      const result = await this.oAuth.getAccessTokens('/v1/oauth/access_token');
      const tokenData = result.response;
      
      await this.setUserAccessToken( tokenData );
      
      return tokenData;
    } catch ( error ) {
      this.handleError(error)
    }
  }

  async getProfile() {
    try {
      const resp = await this.makeRequest({
        url: '/v1/users/me',
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      this.schoologyUserId = resp.data.id;
      return resp.data;
    } catch(err) {
      throw new LMSError('Unable to fetch user profile', 'schoology.USER_PROFILE_ERROR', {
        userId: this.userId
      });
    }
  }

  async getTokensFromUser() {
    try {
      const { accessToken, refreshToken, info } = await this.getUserToken(this.userId);
      this.accessToken = accessToken;
      this.refreshToken = refreshToken;
      this.schoologyUserId = info.id;
    } catch (err) {
      throw new LMSError('Unable to fetch tokens from user', 'schoology.TOKEN_FETCH_ERROR', {
        userId: this.userId,
        message: err.message,
      });
    }
  }

  /**
   * Handles some schoology API errors
   */
  handleError(err, code) {
    if (err.response) {
      switch (err.response.status) {
        case 400:
          if (err.error === 'invalid_grant') {
            throw new LMSError('Invalid authorization code', 'schoology.INVALID_AUTH_CODE', {
              message: err.message,
              code,
            });
          }
          break;
        default:
          throw new LMSError('An error occured', 'schoology.UKW', {
            message: err.message,
            stack: err.stack,
          });
      }
    } else {
      throw new LMSError('An error occured', 'schoology.UKW', {
        message: err.message,
      });
    }
  }

  isTokenExpired(err) {
    // check condition for token expiration, schoology sends a `WWW-Authenticate` header if 401 is for token expiry
    const headers = _.get( err, 'response.headers', {} );
    if ( headers['www-authenticate'] ) {
      return true;
    }
    return false;
  }

  /**
   * Refreshes the access_token for the given user
   */
  async refreshUserToken() {
    try {
      const url = OAuth.makeURL(this.hostedUrl, '/login/oauth2/token');
      const resp = await axios({
        url,
        method: 'POST',
        data: JSON.stringify({
          grant_type: 'refresh_token',
          client_id: this.clientId,
          client_secret: this.clientSecret,
          refresh_token: this.refreshToken,
        }),
        headers: {
          'Content-Type': 'application/json',
        }
      });
      this.accessToken = resp.data.access_token;
      this.schoologyUserId = resp.data.user.id;

      await this.setUserToken(this.userId, {
        access_token: this.accessToken,
        expires_in: resp.data.expires_in,
        token_type: resp.data.token_type,
        lastRefresh: new Date(),
        ...resp.data,
      });
    } catch (err) {
      throw new LMSError('Unable to refresh user token', 'schoology.REFRESH_TOKEN_ERROR', {
        userId: this.userId,
        message: err.message,
      });
    }
  }


  /**
   * Makes a request, defined by the requestConfig, to the schoology API
   * Attempts to refresh the access_token if schoology throws a "token expired" error and
   * then re-attempts the request
   */
  async makeRequest(requestConfig, retries = 0) {
    try {
      if (!this.refreshToken || !this.accessToken) {
        await this.getTokensFromUser();
      }
      const url = OAuth.makeURL(this.hostedUrl, requestConfig.url, requestConfig.query || {});
      const response = await axios({
          ...requestConfig,
          url,
          headers: { Authorization: `Bearer ${this.accessToken}` },
      });
      const { data, status } = response;
      return { data, status };
    } catch (err) {
      const status = _.get(err, 'response.status', 500);
      switch (status) {
        case 401:
          if (this.isTokenExpired(err)) {
            if (retries >= 2) {
              throw new LMSError('Tried to refresh token 2 times and failed', 'schoology.TOO_MANY_RETRIES', {
                userId: this.userId,
              });
            }
            try {
              await this.refreshUserToken(this.refreshToken);
            } catch(err) {
              console.error(err);
            }

            const resp = await this.makeRequest(requestConfig, retries + 1);
            return resp;
          }
          break;
        default:
          const errorData = _.get(err, 'response.data', {});
          throw new LMSError('Schoology error', 'schoology.error', {
            err: errorData ? errorData : err,
          });
      }
    }
  }

  // makeRequest(requestConfig) {
  //   return this.oAuth.makeRequest(requestConfig);
  // }

  async getCourses(buildingId) {
    const req = {
      url: '/v1/courses',
      method: 'GET'
    };
    if (buildingId) {
      req.query = {'building_id': buildingId}
    }

    const courses = await paginatedCollect(this, req);
    return courses;
  }

  async getCourseSections(courseId) {
    const sections = await paginatedCollect(this, {
      url: `/v1/courses/${courseId}/sections`,
      method: 'GET',
    });
    return sections;
  }

  async announce({ sectionId, title, body, args = {} }) {
    return this.makeRequest({
      url: `/v1/sections/${sectionId}/discussions`,
      method: 'POST',
      data: {
        published: 1,
        title,
        body,
        ...args
      },
    });
  }

  async listStudents({ sectionId }) {
    const students = await paginatedCollect(this, {
      url: `/v1/sections/${sectionId}/enrollments`,
      method: 'GET',
      query: { 'type': ['member'] },
    });
    return students;
  }

  async createAssignment({ sectionId, assignmentName, assignmentDescription, dueAt, studentIds = [] }) {
    const payload = {
      title: assignmentName,
      type: 'assignment',
      description: assignmentDescription,
      max_points: 100,
      published: 1,
      show_comments: 1,
    };

    if (dueAt) {
      payload.due = dueAt;
    }

    if (_.isArray(studentIds) && studentIds.length > 0) {
      payload.assignees = studentIds
    }

    const assignment = await this.makeRequest({
      url: `/v1/sections/${sectionId}/assignments`,
      method: 'POST',
      data: payload,
    });

    return assignment;
  }

  async submitAssignment({ sectionId, assignmentId, submissionUrl }) {
    const submission = await this.makeRequest({
      url: `/v1/sections/${sectionId}/submissions/${assignmentId}/create`,
      method: 'POST',
      data: {
        body: submissionUrl
      }
    });
    return submission;
  }

  async getGrades({sectionId, assignmentId, enrollmentId, timestamp}) {
    let query = {}
    if (assignmentId) query['assignment_id'] = assignmentId
    if (enrollmentId) query['enrollment_id'] = enrollmentId
    if (timestamp) query['timestamp'] = timestamp
    const grades = await this.makeRequest({
      url: `/v1/sections/${sectionId}/grades`,
      method: 'GET',
      query
    });
    return grades;
  }

  async gradeSubmission({ sectionId, assignmentId, enrollmentId, grade, comment }) {
    const { data: graded } = await this.makeRequest({
      url: `/v1/sections/${sectionId}/grades`,
      method: 'PUT',
      data: {
        "grades": {
          "grade": [
            {
              "type": "assignment",
              "assignment_id": assignmentId,
              "enrollment_id": enrollmentId,
              grade,
              comment
            }
          ]
        }
      }
    });
    return graded;
  }

  async getSubmission({ sectionId, assignmentId, studentSchoologyId }) {
    const submission = await this.makeRequest({
      url: `/v1/sections/${sectionId}/submissions/${assignmentId}/${studentSchoologyId}`,
      method: 'GET',
    });
    return submission;
  }

  async listSubmissions({ sectionId, assignmentId}) {
    const submissions = await paginatedCollect(this, {
      url: `/v1/sections/${sectionId}/submissions/${assignmentId}/`
    });
    return submissions;
  }

  async gradeMultipleSubmissions({ courseId, assignmentId, userGradesAndComments }) {
    const gradeData = Object.keys(userGradesAndComments).reduce((acc, studentschoologyId) => {
      const { grade, comment } = userGradesAndComments[studentschoologyId];
      acc[studentschoologyId] = { posted_grade: grade, text_comment: comment };
      return acc;
    }, {});
    const { data: grades } = await this.makeRequest({
      url: `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions/update_grades`,
      method: 'POST',
      data: { grade_data: gradeData }
    });
    return grades;
  }
}

Schoology.SUBMISSION_STATE = {
  SUBMITTED: 'submitted',
  GRADED: 'graded',
  UNSUBMITTED: 'unsubmitted',
};

module.exports = Schoology;
