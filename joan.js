// API client to interact with my Visonect display via the Joan API: https://portal.getjoan.com/api/docs/
// So that I can display battery level overlay on the newspaper :)
// Feel free to delete this file if you use some other e-ink display

class JoanApi {
	static apiHost = 'https://portal.getjoan.com/api'
	static apiVersion = '1.0'

	constructor(client_id = process.env.joan_client_id, client_secret = process.env.joan_client_secret) {
		this.client_id = client_id
		this.client_secret = client_secret
		this.accessToken = false
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
			console.log(`Bearer ${this.accessToken.token.access_token}`)
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