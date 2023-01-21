const oauth2lib = require('simple-oauth2')
const axios = require('axios')

/**
 * API client to interact with Visonect display via the Joan API: https://portal.getjoan.com/api/docs/
 * e.g. I can display battery level overlayed on the newspaper :)
 */
class JoanApiClient {
	static apiHost = 'https://portal.getjoan.com/api'
	static apiVersion = '1.0'

	static call = (accessToken, path, data, method) => axios({
		method: method || (data ? 'POST' : 'GET'),
		url: `${JoanApiClient.apiHost}/v${JoanApiClient.apiVersion}/${path}/`,
		headers: {'Authorization': `Bearer ${accessToken}`},
		data: data
	}).then(res => res.data)

	constructor(client_id, client_secret) {
		this.oauth2 = oauth2lib.create({
			client: {id: client_id, secret: client_secret},
			auth: {tokenHost: JoanApiClient.apiHost, tokenPath: '/token/'}
		})
		this.accessToken = null
	}

	newAccessToken = () => this.oauth2.clientCredentials.getToken().then(result => {return (this.accessToken = this.oauth2.accessToken.create(result))})

	call(path, data, method) {
		const accessToken = this.accessToken && !this.accessToken.expired() ? Promise.resolve(this.accessToken) : this.newAccessToken()
		return accessToken.then(access => JoanApiClient.call(access.token.access_token, path, data, method))
	}

	me = () => this.call('me')
	users = () => this.call('users')
	devices = () => this.call('devices')
	rooms = {
		get: (id) => this.call(id ? `rooms/${id}` : 'rooms'),
		post: (data) => this.call('rooms', data),
		put: (id, data) => this.call(`rooms/${id}`, data, 'PUT'),
		patch: (id, data) => this.call(`rooms/${id}`, data, 'PATCH'),
		delete: (id, data) => this.call(`rooms/${id}`, data, 'DELETE'),
		book: (data) => this.call(`get_room`, data) // See /api/v1.0/get_room/
	}
	events = {
		cancel: (data) => this.call('events/cancel', data),
		checkin: (data) => this.call('events/checkin', data),
		extend: (data) => this.call('events/extend', data),
		move: (data) => this.call('events/move', data),
		book: (data) => this.call('events/book', data),
		invite: (data) => this.call('events/invite', data),
		confirm: (id) => this.call(`events/invite/${id}`),
		reject: (id) => this.call(`events/reject/${id}`)
	}
}

module.exports = { JoanApiClient }
