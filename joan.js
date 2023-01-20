const oauth2Lib = require('simple-oauth2');
const axios = require('axios');

const config = require('./config')

var accessToken = false
function newAccessToken() {
	const oauth2 = oauth2Lib.create(config.joan.oauth)
	return oauth2.clientCredentials
		.getToken({scope: 'read write'})
		.then(result => oauth2.accessToken.create(result))
}

async function call(api, data) {
	if (!accessToken || accessToken.expired()) {
		accessToken = await newAccessToken()
		console.log(`Bearer ${accessToken.token.access_token}`)
	}
	const res = await axios({
		method: data ? 'POST' : 'GET',
		url: config.joan.apiUrl + api + '/',
		headers: {'Authorization': 'Bearer ' + accessToken.token.access_token},
		data: data
	})
	return res.data
}

module.exports = {
	status: () => call('devices')[0]
}
