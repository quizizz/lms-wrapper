/* eslint camelcase: 0 */

const misc = require('@akshendra/misc');
const Service = require('@akshendra/service');
const { validate, joi } = require('@akshendra/validator');

const QError = require('./error');
const oauth2 = require('./oauth2');


function makeName(title, first, last) {
  return [title, first, last].filter(a => a).join(' ');
}

/**
 * @class  Edmodo
 */
class Edmodo extends Service {
  constructor(name, emitter, opts, urls = {}, fxs = {}) {
    super(name, emitter, opts);
    const options = validate(opts, joi.object().keys({
      client_id: joi.string().required(),
      client_secret: joi.string().required(),
      redirect_uri: joi.string().required(),
      scope: joi.array().required(), // with stringify if required, space delimted
    }));

    Object.assign(this, options);

    this.apiURL = urls.apiURL || 'https://api.edmodo.com';

    this.getUserToken = fxs.getToken || (() => {});
    this.setUserToken = fxs.setToken || (() => {});
  }

  /**
   * Using the options passed, create an authorization URL we can
   * redirect users, where they authorize our app
   * @return {String}
   */
  getAutorizationURL(extras) {
    const path = 'oauth/authorize';
    return oauth2.makeURL(this.apiURL, path, misc.assign({
      client_id: this.client_id,
      redirect_uri: this.redirect_uri,
      scope: this.scope,
      response_type: 'code',
    }, extras));
  }

  /**

   * Get token by exchangin the code
   * @param  {String} c
   * @return {Object} token
   * @return {String} token.access_token
   */
  getToken(c) {
    const code = validate(c, joi.string().required());
    const path = 'oauth/token';

    const request = {
      client_id: this.client_id,
      client_secret: this.client_secret,
      redirect_uri: this.redirect_uri,
      code,
      grant_type: 'authorization_code',
    };

    return oauth2.post(this.apiURL, path, {}, request).then(response => {
      const { data } = response;
      return {
        access_token: data.access_token,
        expires_in: data.expires_in,
        token_type: data.token_type,
        refresh_token: data.refresh_token,
      };
    });
  }

  refreshToken(token) {
    const refresh_token = validate(token, joi.string().required());
    const path = 'oauth/token';

    const request = {
      refresh_token,
      client_id: this.client_id,
      client_secret: this.client_secret,
      redirect_uri: this.redirect_uri,
      grant_type: 'refresh_token',
    };

    return oauth2.post(this.apiURL, path, {}, request).then(response => {
      const { data } = response;
      return {
        access_token: data.access_token,
        expires_in: data.expires_in,
        token_type: data.token_type,
        refresh_token: data.refresh_token,
      };
    });
  }

  makeHeaders(userId) { // eslint-disable-line
    return this.getUserToken(userId).then(tokens => {
      const accessToken = validate(tokens.access_token, joi.string().required());
      return {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        tokens,
      };
    });
  }

  headersWithToken(tokens) { // eslint-disable-line
    const accessToken = validate(tokens.access_token, joi.string().required());
    return {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      tokens,
    };
  }

  checkForRefresh(err, userId, tokens) {
    if (err instanceof QError && err.type === 'edmodo.EXPIRED') {
      return this.refreshToken(tokens.refresh_token).then(refreshed => {
        if (userId) {
          return this.setUserToken(userId, refreshed).then(() => {
            return refreshed;
          });
        }
        return refreshed;
      });
    }

    return Promise.resolve(false);
  }

  get(userId, url, path, query, hant, tried = false) {
    const { tokens, headers } = hant;
    return oauth2.get(url, path, query, headers).catch((err) => {
      return this.checkForRefresh(err, userId, tokens).then(refreshed => {
        if (tried === true || !userId) {
          throw err;
        }

        if (refreshed) {
          return this.get(userId, url, path, query, this.headersWithToken(refreshed), true);
        }

        throw err;
      });
    });
  }

  post(userId, url, path, query, data, hant, tried = false) {
    const { tokens, headers } = hant;
    return oauth2.post(url, path, query, data, headers).catch((err) => {
      return this.checkForRefresh(err, userId, tokens).then(refreshed => {
        if (tried === true || !userId) {
          throw err;
        }

        if (refreshed) {
          return this.post(userId, url, path, query, this.headersWithToken(refreshed), true);
        }

        throw err;
      });
    });
  }

  getProfile(tokens) {
    const path = 'users/me';
    return this.headersWithToken(tokens).then(hant => {
      return this.get(null, this.apiURL, path, {}, hant);
    }).then(response => {
      const { data } = response;
      return {
        url: data.url, // "http://localhost:3000/users/10",
        id: data.id, // 10
        type: data.type, // "teacher",
        username: data.username, // "edna",
        user_title: data.user_title, // "Ms",
        first_name: data.first_name, // "Edna",
        last_name: data.last_name, // "Krabappel",
        name: makeName(data.user_title, data.first_name, data.last_name) || data.email,
        locale: data.locale, // "en-GB",
        timezone: data.timezone, // "America/New_York",
        email: data.email || `${data.username}@edmodotemp.com`, // "edna@springfield.net",
        avatars: {
          small: data.avatars.small, // "https://u.ph.edim.co/default-avatars/10_t.jpg",
          large: data.avatars.large, // "https://u.ph.edim.co/default-avatars/10.jpg"
        },
        // schoolId: data.school.id, // { url: "https://api.edmodo.com/schools/14", id: 14 },
        // districtId: data.districtId, // { url: "https://api.edmodo.com/districts/12", id: 12 },
        // school_admin_rights: {
        //     institution: "school/1001",
        //     can_grant_rights: true,
        //     can_allocate_funds: true
        // },
        // district_admin_rights: {
        //     institution: "district/90",
        //     can_grant_rights: false,
        //     can_allocate_funds: false
        // }
      };
    });
  }

  getGroups(userId) {
    const path = 'groups';
    return this.makeHeaders(userId).then(hant => {
      return this.get(userId, this.apiURL, path, {}, hant);
    }).then(response => {
      const { data } = response;
      return data || [];
    });
  }

  createAssignment(userId, data) {
    const path = 'assignments';
    validate(data, {
      courseId: joi.number().required(),
      title: joi.string().required(),
      description: joi.string().default(''),
      link: joi.object().keys({
        url: joi.string().uri().required(),
        title: joi.string().required(),
        thumbnailUrl: joi.string()
      }),
      game: joi.object().keys({
        name: joi.string().required(),
        expiry: joi.number().required(),
        createdAt: joi.date().required()
      }),
    });

    const request = {
      title: data.title,
      description: data.description, // optional
      due_at: new Date(misc.addSeconds(data.game.createdAt, data.game.expiry)),
      recipients: {
        groups: [{ id: data.courseId }]
      }, // recipeints object
      lock_after_due: false, // false, here for cleanup cases
      attachments: {
        links: [{
          title: data.link.title,
          link_url: data.link.url,
        }],
      },
    };

    return this.makeHeaders(userId).then(hant => {
      return this.post(userId, this.apiURL, path, {}, request, hant);
    }).then(response => {
      return response.data;
    });
  }


  submit(userId, data) {
    const path = 'assignment_submissions';
    validate(data, {
      assignmentId: joi.string().required(),
      content: joi.string().required(),
      link: joi.object().keys({
        url: joi.string().uri().required(),
        title: joi.string().required(),
        thumbnailUrl: joi.string()
      }),
    });

    const request = {
      assignment_id: data.assignmentId,
      content: data.content,
      attachments: {
        links: [{
          title: data.link.title,
          link_url: data.link.url,
        }],
      },
    };

    return this.makeHeaders(userId).then(hant => {
      return this.post(userId, this.apiURL, path, {}, request, hant);
    }).then(response => {
      return response.data;
    });
  }

  grade(userId, data) {
    const path = 'grades';

    validate(data, {
      submitterId: joi.number().required(),
      assignmentId: joi.number().required(),
      score: joi.number().required(),
    });

    const request = {
      submitter_id: data.submitterId, // student id
      entity_type: 'assignment',
      entity_id: data.assignmentId,
      grade_score: String(data.score),
      grade_total: '100',
    };

    return this.makeHeaders(userId).then(hant => {
      return this.post(userId, this.apiURL, path, {}, request, hant);
    }).then(response => {
      return response.data;
    });
  }
}

module.exports = Edmodo;
