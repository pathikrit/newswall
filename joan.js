const oauth2lib = require('simple-oauth2')
const axios = require('axios')

/**
 * API client to interact with Visonect display via the Joan API: https://portal.getjoan.com/api/docs/
 * e.g. I can display battery level overlayed on the newspaper :)
 */
class JoanApi {
	static apiHost = 'https://portal.getjoan.com/api'
	static apiVersion = '1.0'
	static call(token, path, data) {
		return axios({
			method: data ? 'POST' : 'GET',
			url: `${JoanApi.apiHost}/v${JoanApi.apiVersion}/${path}/`,
			headers: {'Authorization': `Bearer ${token}`},
			data: data
		})
	}

	constructor(client_id, client_secret) {
		this.oauth2 = oauth2lib.create({
			client: {id: client_id, secret: client_secret},
			auth: {tokenHost: JoanApi.apiHost, tokenPath: '/token/'}
		})
		this.accessToken = null
	}

	getAccessToken() {
		if (this.accessToken && !this.accessToken.expired()) {
			return Promise.resolve(this.accessToken.token.access_token)
		}
		return this.oauth2.clientCredentials.getToken()
			.then(result => {
				this.accessToken = this.oauth2.accessToken.create(result)
				console.debug(`Bearer ${this.accessToken.token.access_token}`)
				return this.accessToken.token.access_token
			})
	}

	call(path, data) {
		return this.getAccessToken().then(token => JoanApi.call(token, path, data)).then(res => res.data)
	}
}

module.exports = { JoanApi }