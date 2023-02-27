const test = require('supertest')
const app = require('./app')
const {StatusCodes} = require('http-status-codes')

describe('server', () => {
	shouldServe = path => it(`should serve ${path}`, () => test(app.server).get(path).expect(StatusCodes.OK))
	shouldNotServe = path => it(`should not serve ${path}`, () => test(app.server).get(path).expect(StatusCodes.NOT_FOUND))

	shouldServe('/')
	shouldServe('/latest')
	shouldServe('/latest?papers=NYT')
	shouldServe('/latest?papers=-1')
	shouldServe('/latest/2a002800-0c47-3133-3633-333400000000')
	shouldServe('/latest/-1')
	shouldNotServe('/foo')
})
