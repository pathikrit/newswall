// This is a standlone util to interact with my Visonect display via the Joan API: https://portal.getjoan.com/api/docs/
// So that I can display battery level overlayed on the newspaper
// Feel free to delete this file if you use some other e-ink display

const config = {
	client_id: 'EIFZqijAtYH6DOkgBJV2pthRFHoSmQOq3niiJfoi',
	client_secret: 'gRlHMs35NchXe5fkfFiYTyVMXD5PXaKLURPNtlIMLgJm3Pp8YzfrygjEuDjvGAukS1UfNTYHiI7cIX6za2sKvB9gu2HMdtzyNATqgstqo0FdDRUrFwxU6OVzhYvans6v',
	apiHost: 'https://portal.getjoan.com',
	apiVersion: '1.0'
}

var accessToken = false
function newAccessToken() {
	const oauth2 = require('simple-oauth2').create({
		client: {id: config.client_id, secret: config.client_secret},
		auth: {tokenHost: config.apiHost, tokenPath: '/api/token/'}
	})
	return oauth2.clientCredentials
		.getToken({scope: 'read write'})
		.then(result => oauth2.accessToken.create(result))
}

async function call(path, data) {
	if (!accessToken || accessToken.expired()) {
		accessToken = await newAccessToken()
		console.log(`Bearer ${accessToken.token.access_token}`)
	}
	const res = await require('axios')({
		method: data ? 'POST' : 'GET',
		url: `${config.apiHost}/api/v${config.apiVersion}/${path}/`,
		headers: {'Authorization': 'Bearer ' + accessToken.token.access_token},
		data: data
	})
	return res.data
}

module.exports = {
	status: () => call('devices').then(data => {
		console.assert(data.count === 1, `Invalid # of devices found = ${data}`)
		return data.results[0]
	})
}


call('devices').then(data => {
	console.log(data)
})