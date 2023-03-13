require('jest-matcher-one-of')
const puppeteer   = require('puppeteer')
const portfinder  = require('portfinder')
const {OK, NOT_FOUND} = require('http-status-codes').StatusCodes

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

contains = str => page => expect(page.content()).resolves.toContain(str)

actualPaperOn = page => expect(page.$eval('img', el => el.id))

displayingPaper = (...papers) => page => papers.length > 0 ? actualPaperOn(page).resolves.toBeOneOf(papers) : actualPaperOn(page).resolves.not.toBeNull()

notDisplayingPaper = paper => page => paper ? actualPaperOn(page).resolves.not.toBe(paper) : actualPaperOn(page).rejects.toThrow()

test.each([
  [OK, '/', contains('emulator')],
  [OK, '/archive', contains('archive')],
  [OK, '/latest', displayingPaper()],
  [OK, '/latest?prev=NYT', notDisplayingPaper('NYT')],
  [OK, '/latest?papers=NYT', displayingPaper('NYT')],
  [OK, '/latest?papers=NYT&prev=NYT', displayingPaper('NYT')],
  [OK, '/latest?papers=NYT&prev=INVALID', displayingPaper('NYT')],
  [OK, '/latest?papers=NYT,WSJ', displayingPaper('NYT', 'WSJ')],
  [OK, '/latest?papers=NYT,WSJ&prev=NYT', displayingPaper('WSJ')],
  [OK, '/latest?papers=NYT,WSJ&prev=WSJ', displayingPaper('NYT')],
  [OK, '/latest?papers=NYT,INVALID', displayingPaper('NYT')],
  [OK, '/latest?papers=INVALID', notDisplayingPaper()],
  [OK, '/latest?deviceId=INVALID', notDisplayingPaper()],
  [OK, '/latest?deviceId=2a002800-0c47-3133-3633-333400000000', displayingPaper()],
  [OK, '/latest?deviceId=2a002800-0c47-3133-3633-333400000000&prev=WSJ', notDisplayingPaper('WSJ')],
  [NOT_FOUND, '/latest/INVALID', contains('Cannot GET')],
  [NOT_FOUND, '/INVALID', contains('Cannot GET')]
])('%i: %s', (statusCode, path, check) => browser.newPage().then(page => Promise.all([
    page.goto(`http://127.0.0.1:${port}${[path]}`).then(res => expect(res.status()).toBe(statusCode)),
    page.waitForNetworkIdle().then(_ => check(page))
])))
