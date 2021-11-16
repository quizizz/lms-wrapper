const _ = require('lodash');
const is = require('is_js');

const OAuth = require('./oauth');
const LMSError = require('./error');
const debug = require('debug')('q:lms:schoology');


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
    schoologyProfileId,
    requestToken = {},
    accessToken = {},
    fxs = {},
  }) {
    this.hostedUrl = hostedUrl;
    this.redirectUri = redirectUri;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.userId = userId;
    this.schoologyProfileId = schoologyProfileId;
    this.cacheRequestToken = fxs.cacheRequestToken || (() => {});
    this.getUserAccessToken = fxs.getAccessToken || (() => {});
    this.setUserAccessToken = fxs.setAccessToken || (() => {});

    this.oAuth = new OAuth({
      consumerKey: this.clientId,
      consumerSecret: this.clientSecret,
      apiBase: 'https://api.schoology.com',
      authRealm: 'Schoology API',
      signatureMethod: 'PLAINTEXT',
      nonceLength: 16,
      requestToken,
      accessToken,
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
  async getAuthorizationURL() {
    try {
      const result = await this.oAuth.getRequestTokens('/v1/oauth/request_token');
      const tokenData = result.response;

      await this.cacheRequestToken(tokenData);

      return OAuth.makeURL(this.hostedUrl, '/oauth/authorize', {
        'oauth_token': tokenData.token,
        'oauth_callback': this.redirectUri,
      });
    } catch (error) {
      this.handleError(error, {
        url: '/v1/oauth/request_token',
        action: 'getAuthorizationURL',
      });
    }
  }

  /**
   * Fetches the access and refresh tokens for a valid authorization code
   */
  async getAccessTokens(storeUserAccessTokens = false) {
    const apiPath = '/v1/oauth/access_token';
    try {
      const result = await this.oAuth.getAccessTokens(apiPath);
      const tokenData = result.response;

      if (storeUserAccessTokens) {
        await this.setUserAccessToken(tokenData);
      }

      return tokenData;
    } catch (error) {
      this.handleError(error, {
        url: apiPath,
        method: 'GET',
      });
    }
  }

  async getProfile() {
    const resp = await this.makeRequest({
      url: '/v1/users/me',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    this.schoologyUserId = resp.data.id;
    return resp.data;
  }

  async getTokensFromUser() {
    const { accessToken, refreshToken, info } = await this.getUserToken(this.userId);
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.schoologyUserId = info.id;
  }

  async getCourses() {
    let schoologyProfileId = this.schoologyProfileId;

    if (_.isEmpty(schoologyProfileId)) {
      schoologyProfileId = await this.getUserIdFromTokens();
    }

    const courses = await this.paginatedCollect({
      url: `v1/users/${schoologyProfileId}/sections`,
      method: 'GET',
    }, 'section');

    return _.map(courses, (course) => ({
      ...course,
      name: `${course.course_title}: ${course.section_title}`,
    }));
  }

  async getAllSectionsForCourse(courseId) {
    const sections = await this.paginatedCollect({
      url: `/v1/courses/${courseId}/sections`,
      method: 'GET',
    }, 'section');

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
        ...args,
      },
    });
  }

  async listStudents({ sectionId }) {
    const students = await this.paginatedCollect({
      url: `/v1/sections/${sectionId}/enrollments`,
      method: 'GET',
      query: { 'type': ['member'] },
    }, 'enrollment');

    return students;
  }

  // TODO: Rename listStudents instead of using this
  getCourseStudents({ courseId }) {
    return this.listStudents({ sectionId: courseId });
  }

  async getUserIdFromTokens() {
    const response = await this.makeRequest({
      url: 'v1/app-user-info',
      method: 'GET',
    });
    this.schoologyProfileId = response.data.api_uid;

    return this.schoologyProfileId;
  }

  async getUserProfile() {
    const userProfileId = await this.getUserIdFromTokens();

    const response = await this.makeRequest({
      url: `v1/users/${userProfileId}`,
      method: 'GET',
    });

    return response.data;
  }

  async createAssignment({ sectionId, assignmentName, assignmentDescription, dueAt, studentIds = [], gradeCategoryId, options }) {
    const payload = {
      title: assignmentName,
      type: 'assignment',
      description: assignmentDescription,
      published: 1,
      show_comments: 1,
      grading_period: '0',
    };

    if (dueAt) {
      payload.due = dueAt;
    }

    if (_.isArray(studentIds) && studentIds.length > 0) {
      payload.assignees = studentIds;
    }

    const { grading = {} } = options;
    if (grading.isGraded && gradeCategoryId) {
      payload.grading_category = '0';
    }
    payload.max_points = grading.maxPoints || 100;

    const assignment = await this.makeRequest({
      url: `/v1/sections/${sectionId}/assignments`,
      method: 'POST',
      data: payload,
    });

    return assignment.data;
  }

  async submitAssignment({ sectionId, assignmentId, submissionUrl }) {
    const submission = await this.makeRequest({
      url: `/v1/sections/${sectionId}/submissions/${assignmentId}/create`,
      method: 'POST',
      data: {
        body: submissionUrl,
      },
    });
    return submission;
  }

  async gradeSubmission({ sectionId, assignmentId, enrollmentId, grade, comment }) {
    const { data: graded } = await this.makeRequest({
      url: `/v1/sections/${sectionId}/grades`,
      method: 'PUT',
      data: {
        grades: {
          grade: [
            {
              grade,
              comment,
              type: 'assignment',
              assignment_id: assignmentId,
              enrollment_id: enrollmentId,
            },
          ],
        },
      },
    });

    return graded;
  }

  async getSubmission({ courseId, assignmentId, studentSchoologyId }) {
    const submission = await this.makeRequest({
      url: `/v1/sections/${courseId}/submissions/${assignmentId}/${studentSchoologyId}`,
      method: 'GET',
    });
    return submission;
  }

  async listSubmissions({ sectionId, assignmentId }) {
    const submissions = await this.paginatedCollect({
      url: `/v1/sections/${sectionId}/submissions/${assignmentId}/`,
    }, 'revision');

    return submissions;
  }

  async gradeMultipleSubmissions({ sectionId, userGradesAndComments }) {
    const graded = await this.makeRequest({
      url: `/v1/sections/${sectionId}/grades`,
      method: 'PUT',
      data: {
        grades: {
          grade: userGradesAndComments,
        },
      },
    });

    return graded;
  }

  async getGrades({ sectionId, assignmentId, enrollmentId, timestamp }) {
    let query = {};
    if (assignmentId) {
      query.assignment_id = assignmentId;
    }
    if (enrollmentId) {
      query.enrollment_id = enrollmentId;
    }
    if (timestamp) {
      query.timestamp = timestamp;
    }

    const response = await this.makeRequest({
      url: `/v1/sections/${sectionId}/grades`,
      method: 'GET',
      query,
    });

    return response.data;
  }

  async getGradeCategoryForSection({ sectionId, id }) {
    try {
      const response = await this.makeRequest({
        url: `/v1/sections/${sectionId}/grading_categories/${id}`,
        type: 'GET',
      });
      return response.data;
    } catch (ex) {
      if (ex.name === 'LMSError' && ex.cause.response && ex.cause.response.status === 404) {
        throw new LMSError('Grade category does not exist', 'schoology.INVALID_GRADE_CATEGORY', {
          sectionId,
          gradeCategoryId: id,
        });
      }

      throw ex;
    }
  }

  async getAllGradeCategoriesForSection({ sectionId }) {
    const response = await this.makeRequest({
      url: `/v1/sections/${sectionId}/grading_categories`,
      type: 'GET',
    });

    return _.get(response, 'data.grading_category', []);
  }

  async createGradeCategoriesForSection({ sectionId, categories = [] }) {
    if (_.isEmpty(categories)) {
      throw new LMSError('Empty categories sent for creation', 'schoology.CANNOT_CREATE_GRADE_CATEGORIES', {
        sectionId,
      });
    }

    const gradingCategories = _.map(categories, (category) => ({
      title: category.title,
      calculation_type: 1,
      default_grading_scale_id: 0,
    }));

    const payload = {
      grading_categories: {
        grading_category: gradingCategories,
      },
    };

    const response = await this.makeRequest({
      url: `/v1/sections/${sectionId}/grading_categories`,
      method: 'POST',
      data: payload,
    });

    const createdCategories = response.data.grading_category;
    const duplicateCategories = _.map(_.filter(createdCategories, (c) => c.response_code === 400), 'title');

    if (!_.isEmpty(duplicateCategories)) {
      throw new LMSError('Grade categories already exists', 'schoology.DUPLICATE_GRADE_CATEGORIES', {
        sectionId,
        createdCategories,
        duplicateCategories,
      });
    }

    return createdCategories;
  }


  /**
   * Handles some schoology API errors
   */
  async handleError(error, request = {}, meta = {}) {
    const { retries = 0 } = meta;

    if (error.response) {
      const isAccessTokenExpired = this.isTokenExpired(error);
      if (isAccessTokenExpired) {
        throw new LMSError('Access token expired', 'schoology.EXPIRED_TOKEN', {
          request: request,
          message: error.message,
          response: error.response,
        });
      }

      switch (error.response.status) {
        case 401:
        case 403: {
          const { status, body, data } = error.response;
          throw new LMSError('Invalid Authorization header sent. Request not allowed', 'schoology.INVALID_OAUTH_HEADER', {
            message: error.message,
            request,
            response: {
              status, body, data,
            },
          });
        }
        case 500:
          if (retries >= 2) {
            throw new LMSError('Tried to refresh token 2 times and failed', 'canvas.TOO_MANY_RETRIES', {
              userId: this.userId,
            });
          }
          const resp = await this.makeRequest(request, { retries: retries + 1 });
          return resp;
        default: {
          const { status, body, data } = error.response;
          throw new LMSError(`Schoology api call failed with status ${status}`, 'schoology.API_RESPONSE_FAILED', {
            message: error.message,
            stack: error.stack,
            request,
            response: { status, body, data },
          });
        }
      }
    } else if (error.request) {
      throw new LMSError('Schoology api failed to call', 'schoology.API_CALL_FAILED', {
        message: error.message,
        stack: error.stack,
        request,
      });
    } else {
      throw new LMSError('Unknown Schoology error', 'schoology.UKW', { error, request });
    }
  }

  isTokenExpired(err) {
    // check condition for token expiration, schoology sends a `WWW-Authenticate` header if 401 is for token expiry
    const headers = _.get(err, 'response.headers', {});

    if (headers['www-authenticate']) {
      return true;
    }

    return false;
  }

  async makeRequest(request, meta = {}) {
    try {
      const result = await this.oAuth.makeRequest(request);
      return result;
    } catch (ex) {
      await this.handleError(ex, request, meta);
    }
  }

  async paginatedCollect(requestConfig, keyWithPaginatedResults) {
    const results = [];
    let pageUrl = requestConfig.url;
    let pages = 0;

    while (pages < 1000) {
      const result = await this.oAuth.makeRequest({
        ...requestConfig,
        url: pageUrl,
      });
      pages += 1;

      const listData = _.get(result, `data.${keyWithPaginatedResults}`, []);
      const nextPageUrl = _.get(result, 'data.links.next', '');
      const isThereANextPage = is.url(nextPageUrl);
      const isResponseEmpty = (!result || _.isEmpty(result) || (result.data && _.isEmpty(result.data))) || _.isEmpty(listData);

      if (isResponseEmpty) {
        break;
      }

      pageUrl = nextPageUrl;

      if (Array.isArray(listData)) {
        results.push(...listData);
      } else {
        results.push(listData);
      }

      if (!isThereANextPage) {
        break;
      }
    }

    return results;
  }

  /**
   * Mainly added to fetch user using building_id and school_uids
   */
  async getUsers(query) {
    const users = await this.paginatedCollect({
      url: '/v1/users',
      query,
    }, 'user');

    return users;
  }

  /**
   * Mainly added to fetch all courses for a school, also we can fetch course for a building by passing building_id
   */
  // async getCourses(query) {
  //   const courses = await this.paginatedCollect({
  //     url: `/v1/courses`,
  //     query
  //   }, 'course');

  //   return courses;
  // }

  /**
   * Mainly added to fetch all teacher for each sections
   */
  async listUsers({ sectionId, query = { 'type': ['admin'] } }) {
    const users = await this.paginatedCollect({
      url: `/v1/sections/${sectionId}/enrollments`,
      method: 'GET',
      query,
    }, 'enrollment');

    return users;
  }

  async getUser(id) {
    const { data: user } = await this.makeRequest({
      url: `/v1/users/${id}`,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    return user;
  }

  async getBuilding(id) {
    const { data: { building } } = await this.makeRequest({
      url: `v1/schools/${id}/buildings`,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    return building;
  }

  async getSchool(id) {
    const { data: school } = await this.makeRequest({
      url: `v1/schools/${id}`,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    return school;
  }

  async getInfo(data) {
    const response = await this.makeRequest(data);
    return response;
  }
}

Schoology.SUBMISSION_STATE = {
  SUBMITTED: 'submitted',
  GRADED: 'graded',
  UNSUBMITTED: 'unsubmitted',
};

module.exports = Schoology;
