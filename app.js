require('dotenv').config()
const dayjs = require('dayjs') //TODO: dayjs all
  .extend(require('dayjs/plugin/duration'))
  .extend(require('dayjs/plugin/relativeTime'))
  .extend(require('dayjs/plugin/utc'))
  .extend(require('dayjs/plugin/timezone'))
  .extend(require('dayjs/plugin/arraySupport'))
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
  return Promise.all(_.product(recentDays(3), db.newspapers).map(arg => download(arg[1], arg[0])))
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
    const ids = glob.sync(globExpr).map(image => path.parse(image).name)
    if (ids.length === 0) continue
    // Find something that is not current or a random one
    const id = ids.length === 1 ? ids[0] : _.sample(ids.filter(id => !currentPaper || id !== currentPaper))
    const paper = db.newspapers.find(paper => paper.id === id)
    const displayFor = currentDevice?.newspapers?.find(p => p.id === paper.id)?.displayFor || config.refreshInterval.asMinutes()
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
    setTimeout(vss.sessions.restart, 60*1000, device.id)
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
  // Main pages
  .get('/', (req, res) => res.render('index', {db: db}))
  .get('/latest', (req, res) => {
    const result = {device: null, paper: null}
    if (req.query.deviceId) {
      result.device = db.devices.find(device => device.id === req.query.deviceId)
      if (result.device) result.paper = nextPaper(result.device, req.query.prev)
      else result.missing = `Device Id = ${req.query.deviceId}`
    } else if (req.query.papers) {
      const papers = req.query.papers.split(',').map(paper => {return {id: paper}})
      result.paper = nextPaper({newspapers: papers}, req.query.prev)
      if (!result.paper) result.missing = `Newspapers = ${req.query.papers}`
    } else {
      result.paper = nextPaper(null, req.query.prev)
    }
    if (!result.paper) result.missing = 'Any newspapers'
    log.info(`${req.method} ${req.originalUrl} from ${req.ip} (${req.headers['user-agent']}), result =`, JSON.stringify(result))
    if (result.missing) return res.status(StatusCodes.NOT_FOUND).send(`Not Found: ${result.missing}`)
    return req.query.api ? res.send(result) : res.render('paper', result)
  })
  // Helpful route to log things from device on the server console
  .post('/log', (req, res) => {
    let logger

    if (req.body?.error) logger = log.warn
    else if (req.headers['user-agent'].includes('VisionectOkular')) logger = log.info
    else logger = log.debug

    logger('LOG', req.headers['user-agent'], JSON.stringify(req.body))
    res.sendStatus(StatusCodes.OK)
  })
// Wire up globals to ejs
app.locals = Object.assign(app.locals, {env: env, display: config.display})

// Kickoff download and export the app if this is a test so test framework can start the server else we start it ourselves
module.exports = scheduleAndRun(downloadAll).then(() => env.isTest ? app : app.listen(config.port, () => {
  log.info(`Started server on port ${config.port} with refreshInterval = ${config.refreshInterval.humanize()} ...`)

  // Uncomment this line to trigger a rerender of images on deployment
  // If you change *.png to *, it would essentially wipe out the newsstand and trigger a fresh download
  // glob.sync(path.join(newsstand, '*', '*.png')).forEach(fs.rmSync)

  if (config.visionect) {
    const VisionectApiClient = require('node-visionect')
    updateVss(new VisionectApiClient(config.visionect))
  }
}))
