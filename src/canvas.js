// / <reference path='./canvas.d.ts' />

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
    userId, // mongoId
    canvasUserId,
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
    this.canvasUserId = canvasUserId;
  }

  async build() {
    if (!this.accessToken && !this.refreshToken) {
      await this.getTokensFromUser();
    }
    return this;
  }

  /**
   * Returns a URL used to initiate the authorization process with Canvas and fetch
   * the authorization code
   */
  getAuthorizationURL(options = {}) {
    const { state, scopes = [] } = options;
    return OAuth.makeURL(this.hostedUrl, '/login/oauth2/auth', {
      client_id: this.clientId,
      response_type: 'code',
      state,
      redirect_uri: this.redirectUri,
      scope: scopes.join(' '),
    });
  }

  /**
   * Fetches the access and refresh tokens for a valid authorization code
   */
  async getTokensFromCode(code) {
    const url = OAuth.makeURL(this.hostedUrl, '/login/oauth2/token');
    try {
      const resp = await axios({
        url,
        method: 'POST',
        data: JSON.stringify({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'authorization_code',
          code,
          redirect_uri: this.redirectUri,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      this.accessToken = resp.data.access_token;
      this.refreshToken = resp.data.refresh_token;
      return { accessToken: this.accessToken, refreshToken: this.refreshToken };
    } catch (err) {
      this.handleError(err, code);
    }
  }

  async getProfile() {
    try {
      const resp = await this.makeRequest({
        url: '/api/v1/users/self/profile',
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      this.canvasUserId = resp.data.id;
      return resp.data;
    } catch (err) {
      throw new LMSError('Unable to fetch user profile', 'canvas.USER_PROFILE_ERROR', {
        userId: this.userId,
        err,
      });
    }
  }

  async getTokensFromUser() {
    try {
      const { accessToken, refreshToken, info } = await this.getUserToken(this.userId);
      this.accessToken = accessToken;
      this.refreshToken = refreshToken;
      this.canvasUserId = info.id;
    } catch (err) {
      throw new LMSError('Unable to fetch tokens from user', 'canvas.TOKEN_FETCH_ERROR', {
        userId: this.userId,
        message: err.message,
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
    const headers = _.get(err, 'response.headers', {});
    if (headers['www-authenticate']) {
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
        },
      });
      this.accessToken = resp.data.access_token;
      this.canvasUserId = resp.data.user.id;

      await this.setUserToken(this.userId, {
        access_token: this.accessToken,
        expires_in: resp.data.expires_in,
        token_type: resp.data.token_type,
        lastRefresh: new Date(),
        ...resp.data,
      });
    } catch (err) {
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
              throw new LMSError('Tried to refresh token 2 times and failed', 'canvas.TOO_MANY_RETRIES', {
                userId: this.userId,
              });
            }
            try {
              await this.refreshUserToken(this.refreshToken);
            } catch (err1) {
              console.error(err1);
            }

            const resp = await this.makeRequest(requestConfig, retries + 1);
            return resp;
          }
          break;
        default:
          const errorData = _.get(err, 'response.data', {});
          throw new LMSError('Canvas error', 'canvas.UKW', {
            err: errorData ? errorData : err,
          });
      }
    }
  }

  async getCourses() {
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

  // TODO: Rename listStudents instead of using this
  getCourseStudents(args) {
    return this.listStudents(args);
  }

  async createAssignment({ courseId, assignmentName, assignmentDescription, dueAt, unlockAt, studentIds = [], options = {} }) {
    const payload = {
      name: assignmentName,
      submission_types: ['online_url'],
      description: assignmentDescription,
      published: true,
    };

    if (dueAt) {
      payload.due_at = dueAt;
    }

    if (unlockAt) {
      payload.unlock_at = unlockAt;
    }

    if (_.isArray(studentIds) && studentIds.length > 0) {
      payload.only_visible_to_overrides = true;
      payload.assignment_overrides = [
        {
          'student_ids': studentIds,
        },
      ];
    }

    const { grading = {} } = options;
    if (grading.isGraded) {
      payload.grading_type = 'points';
      payload.points_possible = grading.maxPoints || 100;
    } else {
      payload.grading_type = 'not_graded';
    }

    const { data: assignment } = await this.makeRequest({
      url: `/api/v1/courses/${courseId}/assignments`,
      method: 'POST',
      data: { assignment: payload },
    });

    return assignment;
  }

  async submitAssignment({ courseId, assignmentId, submissionUrl }) {
    const { data: submission } = await this.makeRequest({
      url: `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions`,
      method: 'POST',
      data: {
        submission: {
          submission_type: 'online_url',
          url: submissionUrl,
        },
      },
    });
    return submission;
  }

  async gradeSubmission({ courseId, assignmentId, studentCanvasId, grade, comment }) {
    const { data: graded } = await this.makeRequest({
      url: `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions/${studentCanvasId}`,
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
    return graded;
  }

  async getSubmission({ courseId, assignmentId, studentCanvasId }) {
    const { data: submission } = await this.makeRequest({
      url: `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions/${studentCanvasId}`,
      method: 'GET',
    });
    return submission;
  }

  async listSubmissions({ courseId, assignmentId }) {
    const submissions = await paginatedCollect(this, {
      url: `api/v1/courses/${courseId}/assignments/${assignmentId}/submissions`,
    });
    return submissions;
  }

  async gradeMultipleSubmissions({ courseId, assignmentId, userGradesAndComments }) {
    const gradeData = Object.keys(userGradesAndComments).reduce((acc, studentCanvasId) => {
      const { grade, comment } = userGradesAndComments[studentCanvasId];
      acc[studentCanvasId] = { posted_grade: grade, text_comment: comment };
      return acc;
    }, {});
    const { data: grades } = await this.makeRequest({
      url: `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions/update_grades`,
      method: 'POST',
      data: { grade_data: gradeData },
    });
    return grades;
  }

  async getAccounts() {
    const accounts = await paginatedCollect(this, {
      url: '/api/v1/manageable_accounts',
      method: 'GET',
    });
    return accounts;
  }

  /**
   * Mainly added to fetch Teacher and ta, use enrollment_type in data
   */
  async getAccountUsers(id, data = { enrollment_type: ['teacher', 'ta'] }) {
    const users = await paginatedCollect(this, {
      url: `/api/v1/accounts/${id}/users`,
      method: 'GET',
      data,
    });
    return users;
  }

  async getUserProfile(id) {
    try {
      const resp = await this.makeRequest({
        url: `/api/v1/users/${id}/profile`,
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      this.canvasUserId = resp.data.id;
      return resp.data;
    } catch (err) {
      throw new LMSError('Unable to fetch user profile', 'canvas.USER_PROFILE_ERROR', {
        userId: this.userId,
        id,
        err,
      });
    }
  }
}

Canvas.SUBMISSION_STATE = {
  SUBMITTED: 'submitted',
  GRADED: 'graded',
  UNSUBMITTED: 'unsubmitted',
};

module.exports = Canvas;
