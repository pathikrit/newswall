const puppeteer   = require('puppeteer')
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

contains = (expected) => html => expected.some(part => html.includes(part)) ? Promise.resolve(html) : Promise.reject(`Did not find ${expected} in ${html}`)
displayingPaper = (...papers) => contains(papers.map(paper => `<img id="${paper || ''}`))
const any = null

test.each([
  [OK, '/', contains(['emulator'])],
  [OK, '/archive', contains(['archive'])],
  [OK, '/latest', displayingPaper(any)],
  [OK, '/latest', displayingPaper(any)],
  [OK, '/latest?prev=NYT', !displayingPaper('NYT')],
  [OK, '/latest?papers=NYT', displayingPaper('NYT')],
  [OK, '/latest?papers=NYT&prev=NYT', displayingPaper('NYT')],
  [OK, '/latest?papers=NYT&prev=INVALID', displayingPaper('NYT')],
  [OK, '/latest?papers=NYT,WSJ', displayingPaper('NYT', 'WSJ')],
  [OK, '/latest?papers=NYT,WSJ&prev=NYT', displayingPaper('WSJ')],
  [OK, '/latest?papers=NYT,WSJ&prev=WSJ', displayingPaper('NYT')],
  [OK, '/latest?papers=NYT,INVALID', displayingPaper('NYT')],
  //shouldNotServe('/latest?papers=INVALID')
  [OK, '/latest?deviceId=2a002800-0c47-3133-3633-333400000000', displayingPaper(any)],
  [OK, '/latest?deviceId=2a002800-0c47-3133-3633-333400000000&prev=WSJ', !displayingPaper('WSJ')],
  //shouldNotServe('/latest/INVALID')
  //shouldNotServe('/INVALID')
])('%i: %s', async (statusCode, path, bodyCheck) => {
    const page = await browser.newPage()
    const res = await page.goto(`http://localhost:${port}${[path]}`)
    await page.waitForNetworkIdle()
    expect(res.status()).toBe(statusCode)
    return page.content().then(bodyCheck)
  }
)
