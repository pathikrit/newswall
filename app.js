require('dotenv').config()
const dayjs = require('dayjs-with-plugins')
const fs = require('fs')
const glob = require('glob')
const path = require('path')
const _ = require('lodash')
const {StatusCodes} = require('http-status-codes')
const db = require('./db.js')

const log = console

// Last-resort safety nets: a stray async error (e.g. a fire-and-forget VSS call failing) must never take the server down
process.on('unhandledRejection', (err) => log.error('Unhandled rejection', err))
process.on('uncaughtException', (err) => log.error('Uncaught exception', err))

const env = {
  isProd: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test'
}

/** Parse an int from an env var, falling back if unset or garbage (a NaN here can be dangerous e.g. archiveLength=NaN would trash the whole newsstand) */
const intEnv = (value, fallback) => Number.isFinite(parseInt(value)) ? parseInt(value) : fallback

const config = {
  port: process.env.PORT ?? 3000,

  // Directory to cache newspaper downloads
  newsstand: path.resolve(process.env.NEWSPAPER_STORAGE_DIR ?? './.newspapers'),

  // The production site url
  myUrl: process.env.RENDER_EXTERNAL_URL,

  // How many days of papers to keep
  archiveLength: intEnv(process.env.ARCHIVE_LENGTH_DAYS, 5),

  // Every hour check for new papers and update device statuses
  refreshInterval: dayjs.duration({minutes: intEnv(process.env.REFRESH_INTERVAL_MINUTES, 60)}),

  // Although the Visionect 32-inch e-ink display is 2560x1440 we choose a slightly bigger width of 1600px when converting from pdf to png
  // since it makes it easier to zoom/crop useless white margins around the edges of the newspapers
  display: {
    height: 2560,
    width: 1440,
    pdf2ImgOpts: {width: 1600}
  },

  // Show low battery warning below this
  lowBatteryWarning: intEnv(process.env.LOW_BATTERY_WARNING, 15),

  // VSS Settings: See https://github.com/pathikrit/node-visionect
  // Note: This whole section can be removed and things will still work e.g. if you are using the Joan portal
  visionect: {
    apiServer: process.env.VISIONECT_API_SERVER,
    apiKey: process.env.VISIONECT_API_KEY,
    apiSecret: process.env.VISIONECT_API_SECRET
  },

  // Sometimes the URL may contain a PDF of the wrong date - enable this to try and parse the date from PDF and check if it is correct
  dateCheck: false  // TODO: disabled for now since we cannot install tesseract on the render.com platform
}

/** We store hashes of all PDFs we dowload to do a quick verification that we are not redownloading same file twice */
const hashes = new Map()

/** Returns last n days (including today); default is the earliest timezone on Earth (UTC+14 i.e. Etc/GMT-14 in POSIX notation) so we fetch new papers as soon as they can possibly exist */
const recentDays = (n, timezone = 'Etc/GMT-14') => _.range(n).map(i => dayjs().tz(timezone).subtract(i, 'days').format('YYYY-MM-DD'))

/** Downloads all newspapers for all recent days; trashes old ones */
const downloadAll = () => {
  // Delete old stuff
  glob(path.join(config.newsstand, `!(${recentDays(config.archiveLength).join('|')})`), (err, dirs) => {
    if (err) return log.error('Could not clean up old papers', err)
    dirs.forEach(dir => fs.rm(dir, {force: true, recursive: true}, () => log.info(`Deleted old files: ${dir}`)))
  })

  // Rebuild hashes from PDFs on disk (e.g. from before a server restart) so the stale-file check in download() works across restarts
  const md5 = require('md5-file')
  hashes.clear()
  glob.sync(path.join(config.newsstand, '*', '*.pdf').replace(/\\/g, '/')).forEach(pdf => {
    try { hashes.set(md5.sync(pdf), pdf) } catch (error) { log.warn(`Could not hash ${pdf}`, error) } // file may vanish mid-scan (e.g. cleanup above)
  })

  log.info('Checking for new papers ...')
  // LinhTimes requires a private token and is intentionally excluded from tests to avoid external auth dependency in CI.
  const newspapers = env.isTest ? db.newspapers.filter(paper => paper.id !== 'LinhTimes') : db.newspapers
  // For each newspaper, download dates oldest-first sequentially so an earlier date always claims its hash
  const dates = recentDays(3).reverse()
  return Promise.all(newspapers.map(newspaper =>
    dates.reduce((prev, date) => prev.then(() => download(newspaper, date)), Promise.resolve())
  ))
}

/** Download the newspaper for given date */
const download = (newspaper, date) => {
  const directory = path.join(config.newsstand, date)
  const fileName = `${newspaper.id}.pdf`
  const pdfPath = path.join(directory, fileName)
  const pngPath = pdfPath.replace('.pdf', '.png')
  const name = `'${newspaper.name}' for ${date}`

  const shouldForceDownload = newspaper.alwaysDownload && recentDays(2).includes(date)
  if (!shouldForceDownload && fs.existsSync(pdfPath)) {
    return fs.existsSync(pngPath) ? Promise.resolve(log.debug(`Already downloaded ${name}`)) : pdfToImage(pdfPath, pngPath)
  }

  log.info(`Checking for ${name} ...`)
  const url = newspaper.url(dayjs(date))
  const Downloader = require('nodejs-file-downloader')

  return new Downloader({url, directory, fileName})
    .download()
    .then(() => {
      const md5 = require('md5-file')
      const hash = md5.sync(pdfPath)
      if (hashes.has(hash)) {
        const msg = shouldForceDownload ?
          `No intraday change detected for ${name} at ${url}` :
          `Stale file found at ${url}: ${pdfPath} and ${hashes.get(hash)} have same hash (${hash})`
        return Promise.reject(msg)
      }
      hashes.set(hash, pdfPath)
      log.debug(`Hash size = ${hashes.size}`)
      return config.dateCheck ? pdfToText(pdfPath).then(extractDateFromText) : [date]
    })
    .then(dates => {
      if (!dates.includes(date)) return Promise.reject(`Could not find ${date} in ${pdfPath}: ${dates}`)
      return pdfToImage(pdfPath, pngPath)
    })
    .catch(error => {
      if (typeof error === 'string' && error.startsWith('No intraday change detected'))
        return log.info(error)
      fs.rmSync(pdfPath, {force: true})
      if ([StatusCodes.NOT_FOUND, StatusCodes.FORBIDDEN].includes(error.statusCode)) // CDNs like CloudFront return 403 for missing objects
        log.info(`${name} is not available at ${url}`)
      else
        log.error(`Could not download ${name} from ${url}`, error)
    })
}

const pdfToText = (pdf, numChunks = 50) => {
  const util = require('util')
  const pdfText = util.promisify(require('pdf-text'))
  return pdfText(pdf).then(chunks => chunks.slice(0, numChunks).join(' '))
}

const extractDateFromText = (text) => {
  const extractDate = require('extract-date').default
  return extractDate(text).map(({date}) => date)
}

const pdfToImage = (pdf, png) => {
  log.info(`Converting ${pdf} to ${png} ...`)
  const tmp = `${png}.tmp` // write to a temp file and rename so a device request can never glob a half-written png
  return require('pdf-img-convert')
    .convert(pdf, config.display.pdf2ImgOpts)
    .then(images => fs.promises.writeFile(tmp, images[0]))
    .then(() => fs.promises.rename(tmp, png))
    .then(() => log.info(`Wrote ${png}`))
}

const checkImage = _.memoize((image, mtime) => {
  const name = path.parse(image).name
  try {
    const {width, height} = require('image-size')(image)
    const minHeight = width * config.display.height / config.display.width * 0.8
    if (env.isTest || height >= minHeight) return [name] // Skip check in tests to avoid flaky failures when a newspaper publishes an unusual page
    log.warn(`Skipping ${name} (${width}W x ${height}H) since it has abnormal height`)
  } catch (error) {
    log.warn(`Skipping unreadable image ${image}`, error)
  }
  return []
}, (image, mtime) => `${image}@${mtime}`) // memoize per file version since alwaysDownload papers overwrite the same path intraday

/** Finds a new latest paper that is preferably not the current one. If papers is specified, it would be one of these */
const nextPaper = (currentDevice, currentPaper) => {
  const searchTerm = currentDevice?.newspapers?.length > 0 ?
      (currentDevice.newspapers.length === 1 ?
          currentDevice.newspapers[0].id :
          `{${currentDevice.newspapers.map(p => p.id).join(',')}}`) :
      '*'

  for (const date of recentDays(3, currentDevice?.timezone)) {
    const globExpr = path.join(config.newsstand, date, `${searchTerm}.png`)
    const ids = glob.sync(globExpr.replace(/\\/g, '/')).flatMap(image => {
      try { return checkImage(image, fs.statSync(image).mtimeMs) } catch (error) { return [] } // file may vanish between glob and stat
    }).sort()

    if (ids.length === 0) continue
    // Find something that is not current or a random one
    const idx = currentPaper ? ids.indexOf(currentPaper) : -1
    const id = idx >= 0 ? ids[(idx + 1) % ids.length] : _.sample(ids)
    const paper = db.newspapers.find(paper => paper.id === id)
    const displayFor = currentDevice?.newspapers?.find(p => p.id === paper?.id)?.displayFor || config.refreshInterval.asMinutes()

    if (paper) return {...paper, date, displayFor} // return a copy - don't pollute the shared db object with request-specific fields
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
  vss.http.defaults.timeout = 30 * 1000 // don't hang forever if VSS is unresponsive

  // Note: interceptors must re-reject (not swallow) errors - a swallowed rejection resolves to undefined inside
  // node-visionect's promise chains and the resulting TypeError is an unhandled rejection that kills the process
  vss.http.interceptors.request.use(req => {
    req.method = req.method.toUpperCase()
    if (env.isTest) return Promise.reject('VSS should not be messed around from tests')
    if (!env.isProd && req.method !== 'GET') return Promise.reject(`${req.method} ${req.url} BLOCKED (cannot make non-GET call from non-prod env)`)
    return req
  }, (err) => Promise.reject(err))

  vss.http.interceptors.response.use(res => {
    log.debug(res.request.method, res.request.path, res.status)
    return res
  }, (err) => Promise.reject(err))

  // TODO: diff against current VSS state and only patch/restart devices whose config actually changed
  db.devices.forEach((device, i) => {
    const logFail = (action) => (err) => log.error(`VSS ${action} failed for ${device.name}: ${err?.message ?? err}`)
    setTimeout(() => { // Stagger the devices so we don't blast the VSS API with all updates at once
      log.info(`Syncing ${device.id} to VSS ...`)
      log.table(device.newspapers)
      vss.devices.patch(device.id, {Options: {Name: device.name, Timezone: device.timezone}}).catch(logFail('device patch'))
      if (config.myUrl) {
        const myUrl = `${config.myUrl}/latest`
        log.debug(`Sending URL ${myUrl} to device ${device.id} ...`)
        vss.sessions.patch(device.id, {Backend: { Name: 'HTML', Fields: { ReloadTimeout: '0', url: myUrl}}}).catch(logFail('session patch'))
      }
      // Restart the device session a minute from now (also makes its html engine pick up timezone changes)
      setTimeout(() => vss.sessions.restart(device.id).catch(logFail('session restart')), 60 * 1000)
    }, i * 10 * 1000)
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
  .get('/', (req, res) => res.render('index', {db}))
  // GET returns the HTML and POST returns the next paper to render
  .get('/latest', (req, res) => res.render('paper'))
  .post('/latest', (req, res) => {
    const result = {}
    if (req.body.papers) {
      const ids = [].concat(req.body.papers).filter(id => /^\w+$/.test(id)) // ids end up in a glob - don't let a crafted one escape the newsstand
      result.paper = nextPaper({newspapers: ids.map(paper => ({id: paper}))}, req.body.prev)
      if (!result.paper) result.missing = `Newspapers = ${req.body.papers}`
    } else if (req.body.uuid) {
      result.device = db.devices.find(device => device.id === req.body.uuid)
      if (result.device) result.paper = nextPaper(result.device, req.body.prev)
      else result.missing = `Device Id = ${req.body.uuid}`
    } else {
      result.paper = nextPaper(null, req.body.prev)
    }
    if (!result.paper) result.missing = 'Any newspapers'
    log.info(`${req.method} ${req.originalUrl}`, JSON.stringify({req: req.body, res: {device: result.device?.name, paper: result.paper?.id, error: result.missing}}))
    return res.status(result.missing ? StatusCodes.NOT_FOUND : StatusCodes.OK).send(result)
  })
// Wire up globals to ejs
app.locals = Object.assign(app.locals, config, {env})

//Uncomment the following lines to trigger a re-render of images on deployment
//If you change *.png to *, it would essentially wipe out the newsstand and trigger a fresh download
// glob.sync(path.join(config.newsstand, '*', '*').replace(/\\/g, '/'))
//   .forEach(path => {
//     log.info('Deleting', path)
//     fs.rmSync(path)
//   })

// Start listening right away (in prod) so devices are never refused while a slow cold-start download runs;
// export a promise that resolves after the first download cycle completes (tests await this before asserting)
const server = env.isTest ? app : app.listen(config.port, () => {
  log.info(`\nStarted server on port ${config.port} with paper refresh interval of ${config.refreshInterval.humanize()} ...`)

  // Resolve newspaper DB items URL function to its string, for display in the console table output
  log.table(db.newspapers.map((item) => ({...item, url: item.url(dayjs())})))

  // Update Visionect
  if (config.visionect?.apiKey && config.visionect?.apiServer && config.visionect?.apiSecret) {
    try {
      const VisionectApiClient = require('node-visionect')
      updateVss(new VisionectApiClient(config.visionect))
    } catch (error) {
      log.error('VSS update failed', error)
    }
  }
})
module.exports = scheduleAndRun(downloadAll).then(() => server)
