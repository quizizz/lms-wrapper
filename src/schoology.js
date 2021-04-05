

const _ = require('lodash');

const OAuth = require('./oauth');
const LMSError = require('./error');
const { paginatedCollect } = require('./helpers/utils');

/**
 * @class Canvas
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
    } );
  }

  /**
   * Returns a URL used to initiate the authorization process with Canvas and fetch
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

  makeRequest(requestConfig) {
    return this.oAuth.makeRequest(requestConfig);
  }

  /**
   * Handles some schoology API errors
   */
  handleError(error) {
    console.error('\n [Schoology] Error -', error)

    if (error.response) {
      switch (error.response.status) {
        default:
          throw new LMSError(`An error occured`, 'schoology.UKW', {
            message: error.message,
            stack: error.stack,
          });
      }

      return;
    }

    if ( error.type ) {

    }

    throw new LMSError(`An error occured`, 'schoology.UKW', {
      message: error.message,
    });
  }
}

module.exports = Schoology;
