/* eslint camelcase: 0 */

const moment = require('moment');
const { google } = require('googleapis');
const LMSError = require('./error');
const oauth2 = require('./oauth2');
const { addSeconds } = require('./helpers/utils');

const { OAuth2 } = google.auth;
const classroom = google.classroom('v1');
const tokenClient = google.oauth2('v2');

function assign(obj, upd = {}) {
  return Object.assign({}, obj, upd);
}

function getGCLDate(time) {
  const mtime = moment(time);
  return {
    year: mtime.year(),
    month: mtime.month() + 1, // retuns from 0 (JAN is 0)
    day: mtime.date(),
  };
}

function getGCLTime(time) {
  const mtime = moment(time);
  return {
    hours: mtime.hour(),
    minutes: mtime.minute(),
    seconds: mtime.seconds(),
    nanos: 0,
  };
}

function promiseMe(fx) {
  return (...args) => new Promise((resolve, reject) => fx(...args, (err, res) => {
    if (err) {
      reject(err);
    } else {
      resolve(res);
    }
  }));
}

function checkSubmissions(submissions, info) {
  if (!submissions || submissions.length === 0) {
    throw new LMSError('No submissions found', 'gcl.NO_SUBMISSIONS', info);
  }
}

/**
 * @class GCL
 */
class GCL {
  constructor(name, emitter, opts, urls = {}, fxs = {}) {
    this.name = name;
    this.emitter = emitter;

    const options = Object.assign({}, opts);
    Object.assign(this, options);

    const { apiURL, authURL, tokenURL } = urls;
    this.apiURL = apiURL || 'https://classroom.googleapis.com';
    this.authURL = authURL || 'https://accounts.google.com/o/oauth2/v2/auth';
    this.tokenURL = tokenURL || 'https://www.googleapis.com/oauth2/v4/token';

    this.getUserToken = fxs.getToken || (() => {});
    this.setUserToken = fxs.setToken || (() => {});

    this.authClient = new OAuth2(this.client_id, this.client_secret, this.redirect_uri);
  }

  requestClient({ refresh_token, access_token, lastRefresh }) {
    const client = new OAuth2(this.client_id, this.client_secret);
    const expiryDate = lastRefresh ? moment(lastRefresh).add('55', 'm').valueOf() : moment().valueOf();

    client.setCredentials({
      access_token,
      refresh_token,
      expiry_date: lastRefresh ? expiryDate : true,
    });
    return client;
  }

  makeRequest(userId, api, params) {
    let auth;
    let tokens = null;
    return this.getUserToken(userId).then(t => {
      tokens = t;
      auth = this.requestClient(tokens);
      const completeParams = Object.assign({}, params, {
        auth,
      });
      return promiseMe(api)(completeParams);
    }).then(response => {
      const newToken = auth.credentials;
      if (newToken.access_token !== tokens.access_token) {
        return this.setUserToken(userId, newToken).then(() => {
          return response.data ? response.data : response;
        });
      }
      return response.data ? response.data : response;
    }).catch(ex => {
      if (ex.message === 'invalid_grant') {
        throw new LMSError('Unauthorized', 'gcl.FORBIDDEN', {
          userId,
        });
      }

      if (ex.message.indexOf('@ClassroomDisabled') !== -1) {
        throw new LMSError('Classroom is disabled', 'gcl.DISABLED', {
          userId,
        });
      }

      if (ex.message.indexOf('Request had invalid authentication credentials') !== -1) {
        throw new LMSError('Unauthorized', 'gcl.FORBIDDEN', {
          userId,
        });
      }

      throw ex;
    });
  }

  requestWithToken(tokens, api, params) {
    const auth = this.requestClient(tokens);
    const completeParams = Object.assign({}, params, {
      auth,
    });
    return promiseMe(api)(completeParams);
  }

  // include state in extras
  getAutorizationURL(extras) {
    return this.authClient.generateAuthUrl(assign({
      access_type: 'offline',
      scope: this.scope,
      include_granted_scopes: true,
    }, extras));
  }

  /**
   * Get token from code
   * @param  {String} c
   * @return {Object} token
   * @return {String} token.access_token
   */
  getToken(code) {
    return promiseMe(this.authClient.getToken.bind(this.authClient))(code).then(tokens => {
      return {
        access_token: tokens.access_token,
        expires_in: 3600,
        token_type: tokens.token_type,
        refresh_token: tokens.refresh_token,
      };
    });
  }

  refreshToken(tokens) {
    const auth = this.requestClient(tokens);
    return promiseMe(auth.refreshAccessToken.bind(auth))().then(t => {
      return {
        access_token: t.access_token,
        expires_in: 3600,
        token_type: t.token_type,
        refresh_token: t.refresh_token,
      };
    });
  }

  tokenInfo(userId) {
    return this.getUserToken(userId).then(tokens => {
      return promiseMe(tokenClient.tokeninfo)({
        access_token: tokens.access_token,
      });
    });
  }

  headersWithToken(tokens) { // eslint-disable-line
    const accessToken = tokens.access_token;
    return {
      Authorization: `Bearer ${accessToken}`,
    };
  }

  getProfile(tokens) {
    const url = 'https://www.googleapis.com';
    return this.headersWithToken(tokens).then(headers => {
      return oauth2.get(url, 'userinfo/v2/me', {}, headers);
    });
  }

  getCourses(userId) {
    const request = {
      courseStates: 'ACTIVE',
      teacherId: 'me',
    };
    return this.makeRequest(userId, classroom.courses.list, request).then(response => {
      return response.courses || [];
    });
  }

  createAssignment(userId, data) {
    const dueTS = addSeconds(data.game.createdAt, data.game.expiry);

    const request = {
      courseId: data.courseId,
      resource: {
        title: data.title,
        description: data.description,
        materials: [
          {
            link: data.link,
          },
        ],
        state: 'PUBLISHED',
        dueDate: getGCLDate(dueTS),
        dueTime: getGCLTime(dueTS),
        workType: 'ASSIGNMENT',
        maxPoints: data.maxPoints,
      },
    };

    if (data.startDate) {
      Object.assign(request.resource, {
        scheduledTime: data.startDate,
        state: 'DRAFT',
      });
    }

    return this.makeRequest(userId, classroom.courses.courseWork.create, request);
  }

  getStudentSubmission(userId, { courseId, courseWorkId }) {
    const info = { userId, courseId, courseWorkId };
    const api = classroom.courses.courseWork.studentSubmissions.list;
    return this.makeRequest(userId, api, {
      courseId,
      courseWorkId,
      userId: 'me',
    }).then(response => {
      checkSubmissions(response.studentSubmissions, info);
      const submission = response.studentSubmissions[0];
      return submission;
    });
  }

  reclaimSubmission(userId, { courseId, courseWorkId, subId }) {
    const api = classroom.courses.courseWork.studentSubmissions.reclaim;
    return this.makeRequest(userId, api, {
      courseId,
      courseWorkId,
      id: subId,
    });
  }

  addLinkToSubmission(userId, { courseId, courseWorkId, subId, url }) {
    const api = classroom.courses.courseWork.studentSubmissions.modifyAttachments;
    return this.makeRequest(userId, api, {
      courseId,
      courseWorkId,
      id: subId,
      resource: {
        addAttachments: [{ link: { url } }],
      },
    });
  }

  submitStudentAssignment(userId, { courseId, courseWorkId, subId }) {
    const api = classroom.courses.courseWork.studentSubmissions.turnIn;
    return this.makeRequest(userId, api, {
      courseId,
      courseWorkId,
      id: subId,
    });
  }

  getAllSubmissions(userId, { courseId, courseWorkId }) {
    const info = { userId, courseId, courseWorkId };
    const api = classroom.courses.courseWork.studentSubmissions.list;
    return this.makeRequest(userId, api, {
      courseId,
      courseWorkId,
    }).then(response => {
      checkSubmissions(response.studentSubmissions, info);
      return response.studentSubmissions;
    });
  }

  gradeAssignment(userId, { courseId, courseWorkId, subId, newSub }) {
    const api = classroom.courses.courseWork.studentSubmissions.patch;
    return this.makeRequest(userId, api, {
      courseId,
      courseWorkId,
      id: subId,
      updateMask: 'assignedGrade,draftGrade',
      resource: newSub,
    });
  }

  returnAssignment(userId, { courseId, courseWorkId, subId }) {
    const api = classroom.courses.courseWork.studentSubmissions.return;
    return this.makeRequest(userId, api, {
      courseId,
      courseWorkId,
      id: subId,
    });
  }
}

module.exports = GCL;
