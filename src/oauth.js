// / <reference path='./oauth.d.ts' />

const { URL, URLSearchParams } = require('url');

const _ = require('lodash');
const axios = require('axios').default;
const { v4: uuidV4 } = require('uuid');
const is = require('is_js');

class OAuth {
	constructor( { 
		consumerKey = '', 
		consumerSecret = '', 
		apiBase = '', 
		authRealm = '',
		signatureMethod = 'PLAINTEXT',
		nonceLength = 16,
		requestToken,
		accessToken,
		errorHandler = (() => {})
	} ) {
		this.consumerKey = consumerKey;
		this.consumerSecret = consumerSecret;
		this.apiBase = apiBase;
		this.authRealm = authRealm;
		this.signatureMethod = signatureMethod;
		this.nonceLength = nonceLength;
		this.requestToken = { 
			token: requestToken.token || '', 
			secret: requestToken.secret || '', 
			expiresAt: requestToken.expiresAt || new Date()
		};
		this.accessToken = {
			token: accessToken.token || '', 
			secret: accessToken.secret || '', 
			expiresAt: accessToken.expiresAt || new Date()
		};
		this.errorHandler = errorHandler;
	}

	static getTimeStamp () {
		return parseInt(new Date().getTime()/1000, 10);
	}

	static getNonce( nonceLength ) {
		return uuidV4().replace(/-/g, '').slice(-1 * nonceLength);
	}

	static makeURL( apiURL, path, query ) {
		const url = new URL(apiURL);

		if (path) {
			url.pathname = path;
		}

		url.search = new URLSearchParams(query);
		return url.toString();
	}

	static post(host, path, query, data, headers = {}) {
		const url = OAuth.makeURL(host, path, query);

		return axios.post(url, data, {
			headers,
			responseType: 'json',
		});
	}

	static get(host, path, query, headers) {
		const url = OAuth.makeURL(host, path, query);

		return axios.get(url, {
			headers,
			responseType: 'json',
		});
	}

	static jsonifyResponseString(responseString) {
		const strSplits = responseString.split( '&' );

		return _.reduce( strSplits, ( result, keyValPair ) => {
			const splits = keyValPair.split( '=' );
			
			result[ splits[0] ] = splits[1];
			return result;
		}, {} );
	}


	async getRequestTokens( apiPath ) {
		const oAuthDetails = this.getOAuthDetails(false);
		const requestedAt = Date.now();

		try {
			const response = await OAuth.get(this.apiBase, apiPath, oAuthDetails);
			const jsonified = OAuth.jsonifyResponseString(response.data);
			const ttl = parseInt( jsonified[ 'xoauth_token_ttl' ] ) || 3600;

			return {
				success: true,
				response: {
					token: jsonified[ 'oauth_token' ],
					secret: jsonified[ 'oauth_token_secret' ],
					expiresAt: new Date( requestedAt + ( ttl * 1000 ) )
				}
			}
		} catch ( error ) {
			this.errorHandler(error);
		}
	}

	async getAccessTokens( apiPath ) {
		const oAuthDetails = this.getOAuthDetails();

		try {
			const response = await OAuth.get(this.apiBase, apiPath, oAuthDetails);
			const jsonified = OAuth.jsonifyResponseString(response.data);

      		this.accessToken = {
				token: jsonified[ 'oauth_token' ],
				secret: jsonified[ 'oauth_token_secret' ],
			};

			return {
				success: true,
				response: this.accessToken
			}
		} catch (error) {
			this.errorHandler(error);
		}
	}

	/**
	 * Makes a request, defined by the requestConfig, to the server
	 * Attempts to refresh the accessToken if server throws a "token expired" error and
	 * then re-attempts the request
	 */
	async makeRequest(requestConfig, errorHandler = _.noop) {
		try {
			if (_.isEmpty(this.accessToken)) {
				// this.errorHandler( {} )
				return;
			}

			const url = is.url(requestConfig.url) ? requestConfig.url : OAuth.makeURL(this.apiBase, requestConfig.url, requestConfig.query || {});
			const oAuthHeader = this.getOAuthHeader();
			
			const response = await axios({
				...requestConfig,
				url,
				headers: { 
					...oAuthHeader, 
					...requestConfig.headers 
				},
			});
			
			const { data, status } = response;
			
			return { data, status };
		} catch (error) {
			errorHandler(error, requestConfig);

			this.errorHandler(error);
		}
	}

	getOAuthDetails( attachAccessToken = true ) {
		const timestamp = OAuth.getTimeStamp();
		const nonce = OAuth.getNonce( this.nonceLength );
		const token = this.accessToken.token || this.requestToken.token || '';
		const secret = this.accessToken.secret || this.requestToken.secret || '';
		const oAuthConfig = {
			'oauth_version': '1.0',
			'oauth_nonce': nonce,
			'oauth_timestamp': timestamp,
			'oauth_signature_method': 'PLAINTEXT'
		};

		if ( !_.isEmpty( this.consumerKey ) ) {
			oAuthConfig[ 'oauth_consumer_key' ] = this.consumerKey;
		}

		if ( attachAccessToken && !_.isEmpty( token ) ) {
			oAuthConfig[ 'oauth_token' ] = token;
		}
		
		if ( !_.isEmpty( this.consumerSecret ) || !_.isEmpty(secret) ) {
			const secretToUse = attachAccessToken ? secret : '';
			oAuthConfig[ 'oauth_signature' ] = `${this.consumerSecret}&${secretToUse}`;
		}
		
		return oAuthConfig;
	}

	getOAuthHeader() {
		const oAuthDetails = this.getOAuthDetails();
		const headerParts = _.map(oAuthDetails, (value, key) => `${key}=${value}`);
		
		return { Authorization: `OAuth realm="${this.authRealm}", ${headerParts.join(', ')}` };
	}
}

module.exports = OAuth;
