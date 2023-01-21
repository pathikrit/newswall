/**
 * API client to interact with Visonect display via the Joan API: https://portal.getjoan.com/api/docs/
 * e.g. I can display battery level overlayed on the newspaper :)
 */
class JoanApi {
	static apiHost = 'https://portal.getjoan.com/api'
	static apiVersion = '1.0'

	constructor(client_id, client_secret) {
		this.client_id = client_id
		this.client_secret = client_secret
		this.accessToken = null
	}

	newAccessToken() {
		const oauth2 = require('simple-oauth2').create({
			client: {id: this.client_id, secret: this.client_secret},
			auth: {tokenHost: JoanApi.apiHost, tokenPath: '/token/'}
		})
		return oauth2.clientCredentials
			.getToken({scope: 'read write'})
			.then(result => oauth2.accessToken.create(result))
	}

	async call(path, data) {
		if (!this.accessToken || this.accessToken.expired()) {
			this.accessToken = await this.newAccessToken()
			console.debug(`Bearer ${this.accessToken.token.access_token}`)
		}
		return require('axios')({
			method: data ? 'POST' : 'GET',
			url: `${JoanApi.apiHost}/v${JoanApi.apiVersion}/${path}/`,
			headers: {'Authorization': `Bearer ${this.accessToken.token.access_token}`},
			data: data
		}).then(res => res.data)
	}
}

module.exports = { JoanApi }