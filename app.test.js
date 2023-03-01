const test = require('supertest')
const app = require('./app')
const {StatusCodes} = require('http-status-codes')

function sleep(seconds) {
  jest.setTimeout(2*seconds*1000)
  return new Promise((resolve) => {
    setTimeout(resolve, seconds * 1000)
  })
}

beforeAll(async () => await sleep(4))

describe('server', () => {
  shouldServe = path => it(`should serve ${path}`, () => test(app).get(path).expect(StatusCodes.OK))
  shouldNotServe = path => it(`should not serve ${path}`, () => test(app).get(path).expect(StatusCodes.NOT_FOUND))

  shouldServe('/')
  shouldServe('/latest')
  shouldServe('/archive')
  shouldServe('/latest?papers=NYT')
  shouldServe('/latest?papers=NYT,WSJ')
  shouldServe('/latest?papers=NYT,INVALID')
  shouldNotServe('/latest?papers=INVALID')
  shouldServe('/latest/2a002800-0c47-3133-3633-333400000000')
  shouldNotServe('/latest/INVALID')
  shouldNotServe('/INVALID')
})
