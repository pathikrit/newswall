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

displayingPaper = (html, paper) => html.includes(`<img id="${paper || ''}`)

test.each([
  [OK, '/', html => html.includes('emulator')],
  [OK, '/archive', html => html.includes('archive')],
  [OK, '/latest', displayingPaper],
  [OK, '/latest?prev=NYT', html => !displayingPaper(html, 'NYT')],
  [OK, '/latest?papers=NYT', html => displayingPaper(html, 'NYT')],
  [OK, '/latest?papers=NYT&prev=NYT', html => displayingPaper(html, 'NYT')],
  [OK, '/latest?papers=NYT&prev=INVALID', html => displayingPaper(html, 'NYT')],
  [OK, '/latest?papers=NYT,WSJ', html => displayingPaper(html,'NYT') || displayingPaper(html,'WSJ')],
  [OK, '/latest?papers=NYT,WSJ&prev=NYT', html => displayingPaper(html, 'WSJ')],
  [OK, '/latest?papers=NYT,WSJ&prev=WSJ', html => displayingPaper(html, 'NYT')],
  [OK, '/latest?papers=NYT,INVALID', html => displayingPaper(html,'NYT')],
  [OK, '/latest?papers=INVALID', displayingPaper],
  [OK, '/latest?deviceId=INVALID', displayingPaper],
  [OK, '/latest?deviceId=2a002800-0c47-3133-3633-333400000000', displayingPaper],
  [OK, '/latest?deviceId=2a002800-0c47-3133-3633-333400000000&prev=WSJ', html => !displayingPaper(html, 'WSJ')],
  [NOT_FOUND, '/latest/INVALID', html => html.includes('Cannot GET')],
  [NOT_FOUND, '/INVALID', html => html.includes('Cannot GET')]
])('%i: %s', async (statusCode, path, bodyCheck) => {
    const page = await browser.newPage()
    const res = await page.goto(`http://localhost:${port}${[path]}`)
    await page.waitForNetworkIdle()
    expect(typeof(bodyCheck) === 'function')
    expect(res.status()).toBe(statusCode)
    return page.content().then(content => bodyCheck(content) ? Promise.resolve(content) : Promise.reject(content))
  }
)
