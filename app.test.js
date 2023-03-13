const puppeteer   = require('puppeteer' )
const portfinder  = require('portfinder')
const {OK, NotFound} = require('http-status-codes').StatusCodes

jest.setTimeout(60*1000) // Initial download might be slow

let port = null, server = null, browser = null

beforeAll(async () => {
  port = await portfinder.getPortPromise()
  server = await require('./app').then(app => app.listen(port))
  browser = await puppeteer.launch()
})

afterAll(async () => {
  await browser.close()
  await server.close()
})

displayingPaper = paper => html => html.includes(`<img id="${paper || ''}`) ? Promise.resolve(html) : Promise.reject(`Did not find ${paper} in ${html}`)

test.each([
  //['/', StatusCodes.OK],
  [OK, '/latest', displayingPaper()],
])('%i: %s', async (statusCode, path, bodyCheck) => {
    const page = await browser.newPage()
    const res = await page.goto(`http://localhost:${port}${[path]}`)
    await page.waitForNetworkIdle()
    expect(res.status()).toBe(statusCode)
    return page.content().then(bodyCheck)
  }
)

/*
describe('server', () => {
  /*
  shouldNotServe = path => it(`should not serve ${path}`, () => appPromise.then(app => test(app).get(path).expect(StatusCodes.NOT_FOUND)))
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
  shouldServe('/latest?deviceId=2a002800-0c47-3133-3633-333400000000', displayingPaper())
  shouldServe('/latest?deviceId=2a002800-0c47-3133-3633-333400000000&prev=WSJ', !displayingPaper('WSJ'))
  shouldNotServe('/latest/INVALID')
  shouldNotServe('/INVALID')
})
*/