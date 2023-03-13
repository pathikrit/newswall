require('dotenv').config()
const dayjs = require('dayjs-with-plugins')
const fs = require('fs')
const glob = require('glob')
const path = require('path')
require('lodash.product')
const _ = require('lodash')
const {StatusCodes} = require('http-status-codes')
const log = console
const db = require('./db.js')

env = {
  isProd: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test'
}

config = {
  port:  process.env.PORT || 3000,

  // Directory to cache newspaper downloads
  newsstand: env.isProd ? '/var/lib/data/newsstand' : path.resolve('./.newspapers'),

  // The production site url
  myUrl: process.env.RENDER_EXTERNAL_URL,

  // How many days of papers to keep
  archiveLength: 35,

  // Every hour check for new papers and update device statuses
  refreshInterval: dayjs.duration(env.isProd ? { hours: 1 } : {minutes: 5}),

  // Although the Visionect 32-inch e-ink display is 2560x1440 we choose a slightly bigger width of 1600px when converting from pdf to png
  // since it makes it easier to zoom/crop useless white margins around the edges of the newspapers
  display: {
    height: 2560,
    width: 1440,
    pdf2ImgOpts: {width: 1600}
  },

  // See: https://betterstack.com/docs/logs/javascript/install/#logging-from-browser
  logTailSourceToken:'LQh5K1RSjwcEGtmLmRa9H9ka',

  // VSS Settings: See https://github.com/pathikrit/node-visionect
  visionect: {
    apiServer: 'https://pathikrit-1.dk.visionect.com:8081',
    apiKey: process.env.visionectApiKey,
    apiSecret: process.env.visionectApiSecret
  }
}

/** Returns last n days (including today), if timezone is not specified we assume the earliest timezone i.e. UTC+14 */
const recentDays = (n, timezone = 'Etc/GMT-14')  => Array.from(Array(n).keys()).map(i => dayjs().tz(timezone).subtract(i, 'days').format('YYYY-MM-DD'))

/** Downloads all newspapers for all recent days; trashes old ones */
const downloadAll = () => {
  // Delete old stuff
  glob(path.join(config.newsstand, `!(${recentDays(config.archiveLength).join('|')})`), (err, dirs) => {
    dirs.forEach(dir => fs.rm(dir, {force: true, recursive: true}, () => log.info(`Deleted old files: ${dir}`)))
  })

  log.info('Checking for new papers ...')
  return Promise.all(_.product(recentDays(3), db.newspapers).map(([date, newspaper]) => download(newspaper, date)))
}

/** Download the newspaper for given date */
const download = (newspaper, date) => {
  const directory = path.join(config.newsstand, date)
  const fileName = `${newspaper.id}.pdf`
  const pdfPath = path.join(directory, fileName)
  const pngPath = pdfPath.replace('.pdf', '.png')
  const name = `${newspaper.name} for ${date}`

  if (fs.existsSync(pdfPath)) {
    return fs.existsSync(pngPath) ? Promise.resolve(log.debug(`Already downloaded ${name}`)) : pdfToImage(pdfPath, pngPath)
  }

  log.info(`Checking for ${name} ...`)
  const url = newspaper.url(dayjs(date))
  const Downloader = require('nodejs-file-downloader')
  return new Downloader({url: url, directory: directory, fileName: fileName})
    .download()
    .then(() => pdfToImage(pdfPath, pngPath))
    .catch(error => {
      if (error.statusCode && error.statusCode === StatusCodes.NOT_FOUND)
        log.info(`${name} is not available at ${url}`)
      else
        log.error(`Could not download ${name} from ${url}`, error)
    })
}

const pdfToImage = (pdf, png) => {
  log.info(`Converting ${pdf} to ${png} ...`)
  return require('pdf-img-convert')
    .convert(pdf, config.display.pdf2ImgOpts)
    .then(images => fs.writeFile(png, images[0], () => log.info(`Wrote ${png}`)))
    .catch(error => fs.rm(pdf, () => log.error(`Could not convert ${pdf} to png`, error))) // Corrupted pdf? Delete it
}

/** Finds a new latest paper that is preferably not the current one. If papers is specified, it would be one of these */
const nextPaper = (currentDevice, currentPaper) => {
  const searchTerm = currentDevice?.newspapers?.length > 0 ? (currentDevice.newspapers.length === 1 ? currentDevice.newspapers[0].id : `{${currentDevice.newspapers.map(p => p.id).join(',')}}`) : '*'
  for (const date of recentDays(3, currentDevice?.timezone)) {
    const globExpr = path.join(config.newsstand, date, `${searchTerm}.png`)
    const ids = glob.sync(globExpr).map(image => path.parse(image).name).sort()
    if (ids.length === 0) continue
    // Find something that is not current or a random one
    const idx = currentPaper ? ids.indexOf(currentPaper) : -1
    const id = idx >= 0 ? ids[(idx + 1) % ids.length] : _.sample(ids)
    const paper = db.newspapers.find(paper => paper.id === id)
    const displayFor = currentDevice?.newspapers?.find(p => p.id === paper?.id)?.displayFor || config.refreshInterval.asMinutes()
    if (paper) return Object.assign(paper, {date: date, displayFor: displayFor})
    if (id) log.error(`Unknown paper found: ${id}`)
  }
}

/** Schedule the job (and kick one off right now) */
const scheduleAndRun = (job) => {
  if (env.isTest) log.debug('Skipping job scheduling in tests')
  else setInterval(job, config.refreshInterval.asMilliseconds())
  return job()
}

/** Sync device configs to VSS and restart sessions */
const updateVss = (vss) => {
  vss.http.interceptors.request.use(req => {
    req.method = req.method.toUpperCase()
    if (env.isTest) return Promise.reject('VSS should not be messed around from tests')
    if (!env.isProd && req.method !== 'GET') return Promise.reject(`${req.method} ${req.url} BLOCKED (cannot make non-GET call from non-prod env)`)
    return req
  }, (err) => log.error('VSS request failure', err))

  vss.http.interceptors.response.use(res => {
    log.debug(res.request.method, res.request.path, res.status)
    return res
  }, (err) => log.error(err))

  db.devices.forEach(device => {
    log.info(`Syncing deviceId=${device.id} to VSS ...`)
    vss.devices.patch(device.id, {Options: {Name: device.name, Timezone: device.timezone}})
    if (config.myUrl) vss.sessions.patch(device.id, {Backend: { Name: 'HTML', Fields: { ReloadTimeout: '0', url: `${config.myUrl}/latest`}}})
    setTimeout(vss.sessions.restart, 60 * 1000, device.id) // Restart the device session a minute from now
  })
}

/** Setup the express server */
const express = require('express')
const app = express()
  // Setup middlewares
  .use(require('compression')())
  .use(express.json()) // for parsing application/json
  .use(express.urlencoded({ extended: true })) // for parsing application/x-www-form-urlencoded
  .set('view engine', 'ejs')
  // Statically serve the archive
  .use('/archive', require('serve-index')(config.newsstand))
  .use('/archive', express.static(config.newsstand))
  // Homepage
  .get('/', (req, res) => res.render('index', {db: db}))
  // GET returns the HTML and POST returns the next paper to render
  .get('/latest', (req, res) => res.render('paper'))
  .post('/latest', (req, res) => {
    const result = {}
    if (req.body.uuid) {
      result.device = db.devices.find(device => device.id === req.body.uuid)
      if (result.device) result.paper = nextPaper(result.device, req.body.prev)
      else result.missing = `Device Id = ${req.body.uuid}`
    } else if (req.body.papers) {
      result.paper = nextPaper({newspapers: req.body.papers.map(paper => {return {id: paper}})}, req.body.prev)
      if (!result.paper) result.missing = `Newspapers = ${req.body.papers}`
    } else {
      result.paper = nextPaper(null, req.body.prev)
    }
    if (!result.paper) result.missing = 'Any newspapers'
    log.info(`${req.method} ${req.originalUrl}`, JSON.stringify({req: req.body, res: {device: result.device?.name, paper: result.paper?.id, error: result.missing}}))
    return res.status(result.missing ? StatusCodes.NOT_FOUND : StatusCodes.OK).send(result)
  })
// Wire up globals to ejs
app.locals = Object.assign(app.locals, config, {env: env})

// Kickoff download and export the app if this is a test so test framework can start the server else we start it ourselves
module.exports = scheduleAndRun(downloadAll).then(() => env.isTest ? app : app.listen(config.port, () => {
  log.info(`Started server on port ${config.port} with refreshInterval of ${config.refreshInterval.humanize()} ...`)

  // Uncomment this line to trigger a rerender of images on deployment
  // If you change *.png to *, it would essentially wipe out the newsstand and trigger a fresh download
  // glob.sync(path.join(newsstand, '*', '*.png')).forEach(fs.rmSync)

  if (config.visionect) {
    const VisionectApiClient = require('node-visionect')
    updateVss(new VisionectApiClient(config.visionect))
  }
}))
