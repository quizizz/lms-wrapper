/// <reference path='./canvas.d.ts' />

const axios = require('axios');
const _ = require('lodash');
const OAuth = require('./oauth2');
const LMSError = require('./error');
const { paginatedCollect } = require('./helpers/utils');

/**
 * @class Canvas
 */
class Canvas {
  constructor({
    orgName,
    hostedUrl,
    redirectUri,
    accessToken,
    refreshToken,
    clientId,
    clientSecret,
    fxs = {},
    userId
  }) {
    this.orgName = orgName;
    this.hostedUrl = hostedUrl;
    this.redirectUri = redirectUri;
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.getUserToken = fxs.getToken || (() => {});
    this.setUserToken = fxs.setToken || (() => {});
    this.userId = userId;
  }

  /**
   * Returns a URL used to initiate the authorization process with Canvas and fetch
   * the authorization code
   */
  getAuthorizationURL(options = {}) {
    const { redirect_uri, state, scopes = [] } = options;

    return OAuth.makeURL(this.hostedUrl, '/login/oauth2/auth', {
      client_id: this.clientId,
      response_type: 'code',
      state,
      redirect_uri,
      scope: scopes.join(' '),
    });
  }

  /**
   * Fetches the access and refresh tokens for a valid authorization code
   */
  async getTokensFromCode({ code }) {
    const url = OAuth.makeURL(this.hostedUrl, '/login/oauth2/token');
    try {
      const resp = await axios({
        url,
        method: 'POST',
        data: JSON.stringify({
          client_id: this.clientId,
          client_secret: this.client_secret,
          grant_type: 'authorization_code',
          code,
          redirect_uri: this.redirectUri,
        }),
        headers: {
          'Content-Type': 'application/json',
        }
      });

      this.accessToken = resp.data.access_token;
      this.refreshToken = resp.data.refresh_token;
      console.log(resp);
      return resp.data;
    } catch (err) {
      this.handleError(err, code);
    }
  }

  async getTokensFromUser() {
    try {
      const lmsData = await this.getUserToken(this.userId);
      console.log(lmsData);
      this.accessToken = lmsData.access_token;
      this.refreshToken = lmsData.refresh_token;
    } catch (err) {
      throw new LMSError('Unable to fetch tokens from user', 'canvas.TOKEN_FETCH_ERROR', {
        userId: this.userId
      });
    }
  }

  /**
   * Handles some canvas API errors
   */
  handleError(err, code) {
    if (err.response) {
      switch (err.response.status) {
        case 400:
          if (err.error === 'invalid_grant') {
            throw new LMSError('Invalid authorization code', 'canvas.INVALID_AUTH_CODE', {
              message: err.message,
              code,
            });
          }
          break;
        default:
          throw new LMSError('An error occured', 'canvas.UKW', {
            message: err.message,
            stack: err.stack,
          });
      }
    } else {
      throw new LMSError('An error occured', 'canvas.UKW', {
        message: err.message,
      });
    }
  }

  isTokenExpired(err) {
    // check condition for token expiration, canvas sends a `WWW-Authenticate` header if 401 is for token expiry
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
      const tokens = await axios({
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
      this.accessToken = tokens.access_token;
      this.refreshToken = tokens.refresh_token;
      await this.setUserToken(this.userId, tokens);
    } catch (err) {
      console.log(err);
      throw new LMSError('Unable to refresh user token', 'canvas.REFRESH_TOKEN_ERROR', {
        userId: this.userId,
        message: err.message,
      });
    }
  }


  /**
   * Makes a request, defined by the requestConfig, to the canvas API
   * Attempts to refresh the access_token if canvas throws a "token expired" error and
   * then re-attempts the request
   */
  async makeRequest(requestConfig, retries = 0) {
    try {
      if (!this.refreshToken || !this.accessToken) {
        await this.getTokensFromUser();
      }
      const url = OAuth.makeURL(this.hostedUrl, requestConfig.url, requestConfig.query);
      const response = await axios({
          ...requestConfig,
          url,
          headers: { Authorization: `Bearer ${this.accessToken}` },
      });
      const { data, status } = response;
      return { data, status };
    } catch (err) {
      const status = _.get(err, 'response.status', 500);
      console.log('status - ', err.response.headers);
      switch (status) {
        case 401:
          if (this.isTokenExpired(err)) {
            if (retries >= 2) {
              throw new LMSError('Tried to refresh token 2 times and failed', 'canvas.TOO_MANY_RETRIES', {
                userId: this.userId,
              });
            }
            await this.refreshUserToken(this.refreshToken);
            const resp = await this.makeRequest(requestConfig, retries + 1);
            return resp;
          }
          break;
      }
    }
  }

  async listCourses() {
    const courses = await paginatedCollect(this, {
      url: '/api/v1/courses',
      method: 'GET',
    });
    return courses;
  }

  async announce({ courseId, pinned = false, title, message }) {
    return this.makeRequest({
      url: `/api/v1/courses/${courseId}/discussion_topics`,
      method: 'POST',
      data: {
        is_announcement: true,
        pinned,
        published: true,
        title,
        message,
      },
    });
  }

  async listStudents({ courseId }) {
    const students = await paginatedCollect(this, {
      url: `/api/v1/courses/${courseId}/users`,
      method: 'GET',
      data: { 'enrollment_type': ['student'] },
    });
    return students;
  }

  async createAssignment({ courseId, assignmentName, assignmentDescription, dueAt, unlockAt }) {
    const assignment = await this.makeRequest({
      url: `/api/v1/courses/${courseId}/assignments`,
      method: 'POST',
      data: {
        assignment: {
          name: assignmentName,
          submission_types: ['online_url'],
          grading_type: 'points',
          description: assignmentDescription,
          due_at: dueAt,
          unlock_at: unlockAt,
          published: true,
        },
      },
    });
    return assignment;
  }

  async submitAssignment({ courseId, assignmentId, submission }) {
    const submission = await this.makeRequest({
      url: `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions`,
      method: 'POST',
      data: {
        submission: {
          submission_type: 'online_url',
          url: submission,
        }
      }
    });
    return submission;
  }

  async gradeSubmission({ courseId, assignmentId, userId, grade, comment }) {
    const grade = await this.makeRequest({
      url: `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions/${userId}`,
      method: 'PUT',
      data: {
        submission: {
          posted_grade: `${grade}`,
        },
        comment: {
          text_comment: comment,
        },
      },
    });
    return grade;
  }

  async getSubmission({ courseId, assignmentId, userId }) {
    const submission = await this.makeRequest({
      url: `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions/${userId}`,
      method: 'GET',
    });
    return submission;
  }

  async listSubmissions({ courseId, assignmentId}) {
    const submissions = await paginatedCollect(this, {
      url: `api/v1/courses/${courseId}/assignments/${assignmentId}/submissions`
    });
    return submissions;
  }

  async gradeMultipleSubmissions({ courseId, assignmentId, userGradesAndComments }) {
    const data = Object.keys(userGradesAndComments).reduce((acc, userId) => {
      const { grade, comment } = userGradesAndComments[userId];
      acc[userId] = { posted_grade: grade, text_comment: comment };
      return acc;
    }, {});
    const grades = await this.makeRequest({
      url: `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions/update_grades`,
      method: 'POST',
      data: { grade_data: data }
    });
    return grades;
  }
}

module.exports = Canvas;
