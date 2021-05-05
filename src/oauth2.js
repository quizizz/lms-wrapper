/// <reference path='./oauth2.d.ts' />

const axios = require('axios');
const { URL, URLSearchParams } = require('url');

const LMSError = require('./error.js');

function handleError(err) {
  if (err.response) {
    if (err.response.status === 401 && err.response.data.error_message === 'The access token expired') {
      throw new LMSError('Token expired', 'edmodo.EXPIRED', err.response.data);
    }

    if (err.response.status === 403 && err.response.data.error === 'Forbidden') {
      throw new LMSError('Unauthorized', 'edmodo.FORBIDDEN', err.response.data);
    }
    throw new LMSError('Some other api error', 'edmodo.ERROR', err.response.data);
  } else if (err.request) {
    throw new LMSError('Something wrong with request', 'edmodo.ERROR', {
      message: err.message,
      config: err.config,
    });
  } else {
    // Something happened in setting up the request that triggered an Error
    throw new LMSError('Something completely different', 'lms.ERROR', {
      message: err.message,
      config: err.config,
    });
  }
}

exports.makeURL = function makeURL(apiURL, path, query) {
  const url = new URL(apiURL);

  if (path) {
    url.pathname = path;
  }

  url.search = new URLSearchParams(query);
  return url.toString();
};

exports.post = function post(host, path, query, data, headers = {}) {
  return axios.post(exports.makeURL(host, path, query), data, {
    headers,
    responseType: 'json',
  }).then(response => {
    return {
      status: response.status,
      data: response.data,
    };
  });
};

exports.get = function get(host, path, query, headers) {
  return axios.get(exports.makeURL(host, path, query), {
    headers,
  }).then(response => {
    return {
      status: response.status,
      data: response.data,
    };
  }).catch(err => {
    return handleError(err);
  });
};
