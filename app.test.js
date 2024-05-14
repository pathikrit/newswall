require('jest-matcher-one-of')
const puppeteer   = require('puppeteer')
const portfinder  = require('portfinder')
const {StatusCodes} = require("http-status-codes");

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

serves           = (url, text)    => [StatusCodes.OK        , url, contains(text)]
doesNotServe     = (url)          => [StatusCodes.NOT_FOUND , url, contains(`Cannot GET ${url}`)]
showsPaper       = (url, papers)  => [StatusCodes.OK        , url, page => papers ? actualPaperOn(page).resolves.toBeOneOf(papers) : actualPaperOn(page).resolves.not.toBeNull()]
doesNotShowPaper = (url, paper)   => [StatusCodes.OK        , url, page => paper ? actualPaperOn(page).resolves.not.toBe(paper) : actualPaperOn(page).rejects.toThrow()]

test.each([
  serves('/', 'emulator'),
  serves('/archive', 'archive'),
  showsPaper('/latest'),
  // doesNotShowPaper('/latest?prev=NYT', 'NYT'), // TODO: Fixme!
  showsPaper('/latest?papers=NYT', ['NYT']),
  showsPaper('/latest?papers=NYT&prev=NYT', ['NYT']),
  showsPaper('/latest?papers=NYT&prev=INVALID', ['NYT']),
  showsPaper('/latest?papers=NYT,WSJ', ['NYT', 'WSJ']),
  // showsPaper('/latest?papers=NYT,WSJ&prev=NYT', ['WSJ']), // TODO: Fixme!
  showsPaper('/latest?papers=NYT,WSJ&prev=WSJ', ['NYT']),
  showsPaper('/latest?papers=NYT,INVALID', ['NYT']),
  doesNotShowPaper('/latest?papers=INVALID'),
  doesNotShowPaper('/latest?deviceId=INVALID'),
  showsPaper('/latest?deviceId=2a002800-0c47-3133-3633-333400000000'),
  doesNotShowPaper('/latest?deviceId=2a002800-0c47-3133-3633-333400000000&prev=WSJ', ['WSJ']),
  doesNotServe('/latest/INVALID'),
  doesNotServe('/INVALID')
])('%i: %s', (statusCode, path, check) => browser.newPage().then(page => Promise.all([
    page.setCacheEnabled(false),
    page.goto(`http://127.0.0.1:${port}${[path]}`).then(res => expect(res.status()).toBe(statusCode)),
    page.waitForNetworkIdle().then(_ => check(page))
])))
