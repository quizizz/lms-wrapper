/// <reference path='./canvas.d.ts' />

const axios = require('axios');
const _ = require('lodash');
const LMSError = require('./error.js')

/*
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
    postRefreshCallback
  }) {
    this.orgName = orgName;
    this.hostedUrl = hostedUrl;
    this.redirectUri = redirectUri;
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.postRefreshCallback = postRefreshCallback;
  }

  url(path) {
    return `${this.hostedUrl}/${_.trim(path, '/')}`
  }

  async refreshToken() {
    const { data } = await axios({
      url: this.url('/login/oauth2/token'),
      method: 'POST',
      data: {
        grant_type: 'refresh_token',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
        refresh_token: this.refreshToken,
      }
    });
    const { access_token: accessToken, refresh_token: refreshToken, user } = data;
    await this.postRefreshCallback({user, accessToken, refreshToken});
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
  }

  async call(axiosRequestConfig, retry = true) {
    try {
      const response = await axios({
          ...axiosRequestConfig,
          url: this.url(axiosRequestConfig.url),
          headers: { Authorization: `Bearer ${this.accessToken}` },
      });
      const { data, status } = response;
      return { data, status };
    } catch (err) {
      const status = _.get(err, 'response.status', 500);
      if (status === 401) {
        if (retry) {
          await this.refreshToken();
          return this.call(params, false);
        } else {
          throw new LMSError('Token expired', 'canvas.EXPIRED', {});
        }
      } else if (status === 403) {
        throw new LMSError('Token expired', 'canvas.FORBIDDEN', {});
      } else {
        throw new LMSError('Unknown error', 'canvas.ERROR', {});
      }
    }
  }
}

module.exports = Canvas;
