/* eslint camelcase: 0 */

const moment = require('moment');
const { google } = require('googleapis');
const LMSError = require('./error');
const oauth2 = require('./oauth2');
const { addSeconds } = require('./helpers/utils');

const { OAuth2 } = google.auth;
const classroom = google.classroom('v1');
const tokenClient = google.oauth2('v2');
const admin = google.admin('directory_v1');

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
  getAuthorizationURL(extras) {
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
  getTokens(code) {
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
    const headers = this.headersWithToken(tokens);
    return oauth2.get(url, 'userinfo/v2/me', {}, headers).then(res => res.data);
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
    const links = Array.isArray(data.link) ? data.link : [data.link];

    const request = {
      courseId: data.courseId,
      resource: {
        title: data.title,
        description: data.description,
        materials: links.map(link => ({
          link,
        })),
        state: 'PUBLISHED',
        dueDate: getGCLDate(dueTS),
        dueTime: getGCLTime(dueTS),
        workType: 'ASSIGNMENT',
      },
    };

    if (data.startDate) {
      Object.assign(request.resource, {
        scheduledTime: data.startDate,
        state: 'DRAFT',
      });
    }

    const { grading = {} } = data;
    if (grading.isGraded) {
      request.resource.maxPoints = grading.maxPoints || 100;
    } else {
      request.resource.maxPoints = 0;
    }

    return this.makeRequest(userId, classroom.courses.courseWork.create, request);
  }

  getAssignment(userId, { courseId, courseWorkId }) {
    const request = {
      courseId,
      id: courseWorkId,
    };
    return this.makeRequest(userId, classroom.courses.courseWork.get, request);
  }

  async restartAssignment(userId, data) {
    const current = await this.getAssignment(userId, data);
    const dueTS = addSeconds(data.game.createdAt, data.game.expiry);

    current.dueDate = getGCLDate(dueTS);
    current.dueTime = getGCLTime(dueTS);

    const request = {
      courseId: data.courseId,
      id: data.courseWorkId,
      updateMask: 'dueDate,dueTime',
      resource: current,
    };

    return this.makeRequest(userId, classroom.courses.courseWork.patch, request);
  }

  announce(userId, data) {
    const params = {
      courseId: data.courseId,
      resource: {
        text: data.text,
        materials: data.links.map(link => ({
          link,
        })),
        state: 'PUBLISHED',
      },
    };
    return this.makeRequest(userId, classroom.courses.announcements.create, params);
  }


  createIndividualAssignments(userId, data) {
    const dueTS = addSeconds(data.game.createdAt, data.game.expiry);
    const links = Array.isArray(data.link) ? data.link : [data.link];

    const request = {
      courseId: data.courseId,
      resource: {
        assigneeMode: 'INDIVIDUAL_STUDENTS',
        title: data.title,
        description: data.description,
        materials: links.map(link => ({
          link,
        })),
        state: 'PUBLISHED',
        dueDate: getGCLDate(dueTS),
        dueTime: getGCLTime(dueTS),
        workType: 'ASSIGNMENT',
        individualStudentsOptions: {
          studentIds: data.studentIds,
        },
      },
    };

    if (data.startDate) {
      Object.assign(request.resource, {
        scheduledTime: data.startDate,
        state: 'DRAFT',
      });
    }

    const { grading = {} } = data;
    if (grading.isGraded) {
      request.resource.maxPoints = grading.maxPoints || 100;
    } else {
      request.resource.maxPoints = 0;
    }

    return this.makeRequest(userId, classroom.courses.courseWork.create, request);
  }

  async _getCourseStudents(userId, { courseId, pageToken }) {
    const api = classroom.courses.students.list;
    const request = { courseId, pageToken, pageSize: 20 };
    return this.makeRequest(userId, api, request);
  };

  async getCourseStudents(userId, { courseId }) {
    const students = [];
    let nextPageToken;
    let count = 0;
    do {
      count += 1;
      const response = await this._getCourseStudents(userId, { courseId, pageToken: nextPageToken });
      nextPageToken = response.nextPageToken,
      students.push(...(response.students || []));
    } while (nextPageToken && count < 10);

    return students;
  }

  getStudentSubmission(userId, { courseId, courseWorkId }) {
    const info = { userId, courseId, courseWorkId };
    const api = classroom.courses.courseWork.studentSubmissions.list;
    return this.makeRequest(userId, api, {
      courseId,
      courseWorkId,
      userId: 'me',
    }).then(response => {
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

  _getAllSubmissions(userId, { courseId, courseWorkId, pageToken }) {
    const info = { userId, courseId, courseWorkId };
    const api = classroom.courses.courseWork.studentSubmissions.list;
    return this.makeRequest(userId, api, {
      courseId,
      courseWorkId,
      pageToken,
      pageSize: 20,
    }).then(response => {
      return response;
    });
  }

  async getAllSubmissions(userId, { courseId, courseWorkId }) {
    const submissions = [];
    let count = 0;
    let nextPageToken;
    do {
      const response = await this._getAllSubmissions(userId, {
        courseId,
        courseWorkId,
        pageToken: nextPageToken,
      });
      nextPageToken = response.nextPageToken;
      submissions.push(...(response.studentSubmissions || []));
      count += 1;
    } while (nextPageToken && count < 50);
    return submissions;
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

  async _getCourses(userId, { pageToken }) {
    const api = classroom.courses.list;
    const request = { courseStates: 'ACTIVE', teacherId: 'me', pageToken, pageSize: 20 };
    return this.makeRequest(userId, api, request);
  };

  async getPaginatedCourses(userId) {
    const courses = [];
    let nextPageToken;
    let count = 0;
    do {
      count += 1;
      const response = await this._getCourses(userId, { pageToken: nextPageToken });
      nextPageToken = response.nextPageToken,
      courses.push(...(response.courses || []));
    } while (nextPageToken);

    return courses;
  }

  async _getCourseTeachers(userId, { courseId, pageToken }) {
    const api = classroom.courses.teachers.list;
    const request = { courseId, pageToken, pageSize: 20 };
    return this.makeRequest(userId, api, request);
  };

  async getPaginatedCourseTeachers(userId, { courseId }) {
    const teachers = [];
    let nextPageToken;
    let count = 0;
    do {
      count += 1;
      const response = await this._getCourseTeachers(userId, { courseId, pageToken: nextPageToken });
      nextPageToken = response.nextPageToken,
      teachers.push(...(response.teachers || []));
    } while (nextPageToken);

    return teachers;
  }

  async getOrgUnits(userId) {
    const api = admin.orgunits.list;
    const request = { customerId: 'my_customer' };
    return this.makeRequest(userId, api, request);
  }

  async _getDomainUsers(userId, query) {
    const api = admin.users.list;
    const request = { ...query, pageSize: 20 };
    return this.makeRequest(userId, api, request);
  };

  async getPaginatedDomainUsers(userId, query) {
    const users = [];
    let nextPageToken;
    let count = 0;
    do {
      count += 1;
      const response = await this._getDomainUsers(userId, { ...query, pageToken: nextPageToken });
      nextPageToken = response.nextPageToken,
      users.push(...(response.users || []));
    } while (nextPageToken);

    return users;
  }
}

module.exports = GCL;
