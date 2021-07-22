const axios = require('axios');
const _ = require('lodash');
const is = require('is_js');

const OAuth = require('./oauth');
const LMSError = require('./error');

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
      errorHandler: this.handleError.bind(this)
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
   async getAccessTokens( storeUserAccessTokens = false ) {
    try {
      const result = await this.oAuth.getAccessTokens('/v1/oauth/access_token');
      const tokenData = result.response;

      if ( storeUserAccessTokens ) {
        await this.setUserAccessToken( tokenData );
      }

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

  async getCourses() {
    let schoologyProfileId = this.schoologyProfileId;

    if (_.isEmpty(schoologyProfileId)) {
      schoologyProfileId = await this.getUserIdFromTokens();
    }

    const courses = await this.paginatedCollect({
      url: `v1/users/${schoologyProfileId}/sections`,
      method: 'GET'
    }, 'section');

    return _.map(courses, (course) => ({
      ...course,
      name: `${course.course_title}: ${course.section_title}`
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
        ...args
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
    return this.listStudents({sectionId: courseId});
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
    };

    if (dueAt) {
      payload.due = dueAt;
    }

    if (_.isArray(studentIds) && studentIds.length > 0) {
      payload.assignees = studentIds
    }

    const { grading = {} } = options;
    if (grading.isGraded && gradeCategoryId) {
      payload.grading_category = gradeCategoryId;
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
        body: submissionUrl
      }
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
            }
          ]
        }
      }
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

  async listSubmissions({ sectionId, assignmentId}) {
    const submissions = await this.paginatedCollect({
      url: `/v1/sections/${sectionId}/submissions/${assignmentId}/`
    }, 'revision');

    return submissions;
  }

  async gradeMultipleSubmissions({ sectionId, userGradesAndComments }) {
    const graded = await this.makeRequest({
      url: `/v1/sections/${sectionId}/grades`,
      method: 'PUT',
      data: {
        grades: {
          grade: userGradesAndComments
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
    const errorHandler = (error) => {
      if (!error.response) {
        return;
      }

      if ( error.response.status === 404 ) {
        throw new LMSError('Grade category does not exist', 'schoology.INVALID_GRADE_CATEGORY', {
          sectionId,
          gradeCategoryId: id
        });
      }
    };

    const response = await this.makeRequest({
      url: `/v1/sections/${sectionId}/grading_categories/${id}`,
      type: 'GET'
    }, errorHandler);

    return response.data;
  }

  async getAllGradeCategoriesForSection({ sectionId }) {
    const response = await this.makeRequest({
      url: `/v1/sections/${sectionId}/grading_categories`,
      type: 'GET'
    });

    return _.get(response, 'data.grading_category', []);
  }

  async createGradeCategoriesForSection({ sectionId, categories = [] }) {
    if ( _.isEmpty(categories) ) {
      throw new LMSError('Empty categories sent for creation', 'schoology.CANNOT_CREATE_GRADE_CATEGORIES', {
        sectionId
      });
    }

    const gradingCategories = _.map(categories, (category) => ({
      title: category.title,
      calculation_type: 1,
      default_grading_scale_id: 0
    }));

    const payload = {
      grading_categories: {
        grading_category: gradingCategories
      }
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
        duplicateCategories
      });
    }

    return createdCategories;
  }


  /**
   * Handles some schoology API errors
   */
  handleError(error) {
    if (error.response) {
      const isAccessTokenExpired = this.isTokenExpired(error);

      if ( isAccessTokenExpired ) {
        throw new LMSError('Access token expired', 'schoology.EXPIRED_TOKEN', {
          message: error.message,
          response: error.response,
        });
      }

      switch (error.response.status) {
        case 401:
        case 403:
          throw new LMSError('Invalid Authorization header sent. Request not allowed', 'schoology.INVALID_OAUTH_HEADER', {
            message: error.message,
            body: error.response.body,
          });

        default:
          throw new LMSError('An error occured', 'schoology.UKW', {
            message: error.message,
            stack: error.stack,
          });
      }
    } else {
      throw new LMSError('An error occured', 'schoology.UKW', {
        message: error.message,
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

  makeRequest(requestConfig, errorHandler) {
    return this.oAuth.makeRequest(requestConfig, errorHandler);
  }

  async paginatedCollect (requestConfig, keyWithPaginatedResults) {
		const results = [];
		let pageUrl = requestConfig.url;

		while (true) {
			const result = await this.oAuth.makeRequest({
        ...requestConfig,
        url: pageUrl,
			});

			const listData = _.get(result, `data.${keyWithPaginatedResults}`, []);
			const nextPageUrl = _.get( result, 'data.links.next', '' );
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
      url: `/v1/users`,
      query
    }, 'user');

    return users;
  }

  /**
   * Mainly added to fetch all courses for a school, also we can fetch course for a building by passing building_id
   */
  async getCourses(query) {
    const courses = await this.paginatedCollect({
      url: `/v1/courses`,
      query
    }, 'course');

    return courses;
  }

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
    const {data: user} = await this.makeRequest({
      url: `/v1/users/${id}`,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    return user;
  }
}

Schoology.SUBMISSION_STATE = {
  SUBMITTED: 'submitted',
  GRADED: 'graded',
  UNSUBMITTED: 'unsubmitted',
};

module.exports = Schoology;
