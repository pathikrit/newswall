const test = require('supertest')
const app = require('./app')
const {StatusCodes} = require('http-status-codes')

describe('server', () => {
	check = (msg, path, code = StatusCodes.OK) => it(`should ${code === StatusCodes.OK ? '' : 'not '}serve ${msg}`, () => test(app).get(path).expect(code))

	check('homepage', '/')
	check('latest', '/latest')
	check('NYT', '/latest?papers=NYT')
	check('any paper', '/latest?papers=-1')
	check('a device', '/latest/2a002800-0c47-3133-3633-333400000000')
	check('a missing device', '/latest/-1')
	check('bad route', '/foo', StatusCodes.NOT_FOUND)
})
