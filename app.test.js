const test = require('supertest')
const app = require('./app')
const {StatusCodes} = require('http-status-codes')

sleep = seconds => new Promise(resolve => setTimeout(resolve, seconds * 1000))

// Let the server finish downloading newspapers
let sleepFor = 30
jest.setTimeout(2*sleepFor*1000)
beforeAll(async () => await sleep(sleepFor))

describe('server', () => {
  shouldServe = (path, bodyCheck) => it(`should serve ${path}`, () => test(app).get(path).expect(StatusCodes.OK).then(response => bodyCheck && bodyCheck(response.res.text)))
  shouldNotServe = path => it(`should not serve ${path}`, () => test(app).get(path).expect(StatusCodes.NOT_FOUND))

  displayingPaper = paper => html => html.includes(`alt="Showing ${paper || ''}`)

  shouldServe('/')
  shouldServe('/archive')
  shouldServe('/latest', displayingPaper())
  shouldServe('/latest?prev=NYT', !displayingPaper('NYT'))
  shouldServe('/latest?papers=NYT', displayingPaper('NYT'))
  shouldServe('/latest?papers=NYT&prev=NYT', displayingPaper('NYT'))
  shouldServe('/latest?papers=NYT&prev=INVALID', displayingPaper('NYT'))
  shouldServe('/latest?papers=NYT,WSJ', displayingPaper('NYT') || displayingPaper('WSJ'))
  shouldServe('/latest?papers=NYT,WSJ&prev=NYT', displayingPaper('WSJ'))
  shouldServe('/latest?papers=NYT,WSJ&prev=WSJ', displayingPaper('NYT'))
  shouldServe('/latest?papers=NYT,INVALID', displayingPaper('NYT'))
  shouldNotServe('/latest?papers=INVALID')
  shouldServe('/latest/2a002800-0c47-3133-3633-333400000000', displayingPaper())
  shouldServe('/latest/2a002800-0c47-3133-3633-333400000000?prev=WSJ', !displayingPaper('WSJ'))
  shouldNotServe('/latest/INVALID')
  shouldNotServe('/INVALID')
})
