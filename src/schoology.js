const axios = require('axios');
const _ = require('lodash');
const is = require('is_js');

const OAuth = require('./oauth');
const LMSError = require('./error');
const { isEmpty } = require('lodash');

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
        errorObj: {
          cause: 'Unable to fetch user profile',
          type: 'schoology.USER_PROFILE_ERROR',
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
      method: 'GET',
      errorObj: {
        cause: 'Unable to fetch user courses',
        type: 'schoology.USER_FETCH_COURSES_ERROR',
      },
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
      errorObj: {
        cause: `Unable to fetch courses`,
        type: 'schoology.FETCH_COURSES_ERROR',
      },
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
      errorObj: {
        cause: `Unable to submit the announcement`,
        type: 'schoology.POST_ANNOUNCEMENT_ERROR',
      },
    });
  }

  async listStudents({ sectionId }) {
    const students = await this.paginatedCollect({
      url: `/v1/sections/${sectionId}/enrollments`,
      method: 'GET',
      query: { 'type': ['member'] },
      errorObj: {
        cause: `Unable to fetch the student for the course`,
        type: 'schoology.FETCH_COURSE_STUDENT_ERROR',
      },
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
      errorObj: {
        cause: `Unable to fetch the user`,
        type: 'schoology.FETCH_TOKEN_ERROR',
      },
    });
    this.schoologyProfileId = response.data.api_uid;

    return this.schoologyProfileId;
  }

  async getUserProfile() {
    const userProfileId = await this.getUserIdFromTokens();

    const response = await this.makeRequest({
      url: `v1/users/${userProfileId}`,
      method: 'GET',
      errorObj: {
        cause: `Unable to fetch the user profile`,
        type: 'schoology.FETCH_USER_ERROR',
      },
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
      errorObj: {
        cause: `Unable to create the assignment`,
        type: 'schoology.POST_ASSIGNMENT_ERROR',
      },
    });

    return assignment.data;
  }

  async submitAssignment({ sectionId, assignmentId, submissionUrl }) {
    const submission = await this.makeRequest({
      url: `/v1/sections/${sectionId}/submissions/${assignmentId}/create`,
      method: 'POST',
      data: {
        body: submissionUrl
      },
      errorObj: {
        cause: `Unable to submit the assignment`,
        type: 'schoology.POST_ASSIGNMENT_ERROR',
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
            }
          ]
        }
      },
      errorObj: {
        cause: `Unable to add the grade for assignment submitted`,
        type: 'schoology.POST_ASSIGNMENT_GRADE_ERROR',
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

  async listSubmissions({ sectionId, assignmentId}) {
    const submissions = await this.paginatedCollect({
      url: `/v1/sections/${sectionId}/submissions/${assignmentId}/`,
      errorObj: {
        cause: `Unable to fetch the list of submissions`,
        type: 'schoology.FETCH_SUBMISSIONS_ERROR',
      },
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
      errorObj: {
        cause: `Unable to grade the users submission`,
        type: 'schoology.POST_ASSIGNMENT_GRADE_ERROR',
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
      errorObj: {
        cause: `Unable to fetch the list of grades of course`,
        type: 'schoology.FETCH_COURSE_GRADE_ERROR',
      },
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
      type: 'GET',
      errorObj: {
        cause: `Unable to fetch the list of grading categories`,
        type: 'schoology.FETCH_GRADING_CATEGORY_ERROR',
      },
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
      errorObj: {
        cause: `Unable to create new grading category for course`,
        type: 'schoology.POST_GRADING_CATEGORY_ERROR',
      },
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
  async handleError(error, requestConfig = {}, retry = 0) {
    if (error.response) {
      const isAccessTokenExpired = this.isTokenExpired(error);
      let errorObj = {
        cause: 'An error occured',
        type: 'schoology.UKW',
      };
      if ( isAccessTokenExpired ) {
        throw new LMSError('Access token expired', 'schoology.EXPIRED_TOKEN', {
          message: error.message,
          response: error.response,
        });
      }

      if (!isEmpty(requestConfig)) {
        errorObj = requestConfig.errorObj;
      }

      switch (error.response.status) {
        case 401:
        case 403:
          throw new LMSError('Invalid Authorization header sent. Request not allowed', 'schoology.INVALID_OAUTH_HEADER', {
            message: error.message,
            body: error.response.body,
          });
        case 500:
          if (retries >= 2) {
            throw new LMSError('Tried to refresh token 2 times and failed', 'canvas.TOO_MANY_RETRIES', {
              userId: this.userId,
            });
          }
          const resp = await this.makeRequest(requestConfig, retries + 1);
          return resp;
        default:
          throw new LMSError(errorObj.cause, errorObj.type, {
            message: error.message,
            stack: error.stack,
          });
      }
    } else {
      throw new LMSError(errorObj.cause, errorObj.type, {
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
    return this.oAuth.makeRequest(requestConfig, errorHandler || this.handleError);
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
      query,
      errorObj: {
        cause: `Unable to fetch users for school`,
        type: 'schoology.FETCH_USERS_ERROR',
      },
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
      errorObj: {
        cause: `Unable to fetch enrollments for course`,
        type: 'schoology.FETCH_COURSE_ENROLLMENT_ERROR',
      },
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
      errorObj: {
        cause: `Unable to fetch USER`,
        type: 'schoology.FETCH_USER_ERROR',
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
      errorObj: {
        cause: `Unable to fetch building for school`,
        type: 'schoology.FETCH_BUILDING_ERROR',
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
      errorObj: {
        cause: `Unable to fetch school`,
        type: 'schoology.FETCH_SCHOOL_ERROR',
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
