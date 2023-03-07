require('dotenv').config()
const dayjs = require('dayjs')
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

const wait = (seconds) => new Promise(resolve => setTimeout(resolve, 1000*seconds))

class db {
  static #data = require('./db.js') // TODO: use a real database

  static newspapers = {
    list: id => id ? this.#data.newspapers.find(paper => paper.id === id) : this.#data.newspapers
  }

  static devices = {
    list: id => id ? this.#data.devices.find(device => device.id === id) : this.#data.devices,

    updateStatus: (deviceId, status) => Object.assign(db.devices.list(deviceId), {status: status})
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
  return Promise.all(_.product(recentDays(3), db.newspapers.list()).map(arg => download(arg[1], arg[0])))
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
    const paper = db.newspapers.list(id)
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

/** Uses VSS API to fetch device WiFi and Battery info AND also sync VSS device info with our configs */
const setupVisionectUpdates = (visionect) => {
  visionect.http.interceptors.request.use(req => {
    console.assert(!env.isTest, 'VSS should not be messed around from tests')
    console.assert(env.isProd || req.method.toUpperCase() === 'GET', 'Cannot make non-GET calls from non-prod env')
    return req
  })

  const sync = {
    toVss: (device) => {
      log.info(`Syncing deviceId=${device.id} from DB to VSS ...`)
      logApi = (msg, promise) => promise
        .then(() => log.info(`${msg} id = `, device.id))
        .catch(err => log.error(`Failed to ${msg.toLowerCase().replace('ed ', '')} id = `, device.id, err))

      logApi('Updated device', visionect.devices.patch(device.id, {Options: {Name: device.name, Timezone: device.timezone}}))

      if (config.myUrl) {
        logApi(
          'Updated session',
          visionect.sessions.patch(device.id, {Backend: { Name: 'HTML', Fields: { ReloadTimeout: '0', url: `${config.myUrl}/latest/${device.id}`}}})
        )
      } else {
        log.warn('Server url not found', config)
      }

      logApi('Restarted session', wait(60).then(() => visionect.sessions.restart(device.id)))
    },

    toDb: (device) => {
      int = (x) => _.isInteger(x) && x !== -999 && x !== 999 ? x : undefined

      log.info(`Syncing deviceId=${device.id} from VSS to DB ...`)
      visionect.devices.get(device.id, dayjs().subtract(config.refreshInterval).unix())
        .then(res => {
          const statuses = res.data.map(r => { return {
            wifi: Math.min(Math.max(2*(100 - int(r.Status?.RSSI)), 0), 100), //See: https://stackoverflow.com/a/31852591/471136
            battery: int(r.Status?.Battery),
            temperature: int(r.Status?.Temperature),
            updatedAt: r?.Date?.length === 6 ? dayjs.utc(r.Date).subtract(1, 'month').toISOString() : undefined,
          }}).filter(status => status.wifi && status.battery && status.temperature && status.updatedAt)
          const latest = _.maxBy(statuses, r => dayjs(r.updatedAt))
          if (latest) {
            log.debug(`Updating db status for deviceId=${device.id} to`, latest)
            db.devices.updateStatus(device.id, latest)
          } else {
            log.warn(`No recent status for deviceId=${device.id} in ${config.refreshInterval.humanize()}`, res, statuses)
          }
        })
        .catch(err => log.error('Error retrieving status for device = ', device, err))
    }
  }

  if (env.isProd) db.devices.list().forEach(sync.toVss)
  return scheduleAndRun(() => db.devices.list().forEach(sync.toDb))
}

/** Setup the express server */
const express = require('express')
const app = express()
  .use(require('compression')())
  .set('view engine', 'ejs')
  // Statically serve the archive
  .use('/archive', require('serve-index')(config.newsstand))
  .use('/archive', express.static(config.newsstand))
  .use('/my', express.static('my_frame.jpg'))
  // Main pages
  .get('/', (req, res) => res.render('index', {db: db}))
  .get('/latest/:deviceId?', (req, res) => {
    const reqInfo = `GET ${req.originalUrl} from ${req.ip} (${req.headers['user-agent']}): Prev=[${req.query.prev}]; DeviceId=[${req.params.deviceId}]`

    notFound = msg => {
      log.warn(reqInfo, `Not Found: ${msg}`)
      return res.status(StatusCodes.NOT_FOUND).send(`Not Found: ${msg}`)
    }

    let paper = null, device = null
    if (req.params.deviceId) {
      device = db.devices.list(req.params.deviceId)
      if (!device) return notFound(`Device Id = ${req.params.deviceId}`)
      paper = nextPaper(device, req.query.prev)
    } else if (req.query.papers) {
      const papers = req.query.papers.split(',').map(paper => {return {id: paper}})
      paper = nextPaper({newspapers: papers}, req.query.prev)
      if (!paper) return notFound(`Newspapers = ${req.query.papers}`)
    } else {
      paper = nextPaper(null, req.query.prev)
    }

    log.info(reqInfo, `; Next=[${paper?.name} for ${paper?.date}]; Device=[${device?.name}]`)
    paper ? res.render('paper', {paper: paper, device: device}) : notFound('Any newspapers')
  })
// Wire up globals to ejs
app.locals = Object.assign(app.locals, {dayjs: dayjs, env: env, display: config.display})

// Kickoff download and export the app if this is a test so test framework can start the server else we start it ourselves
module.exports = scheduleAndRun(downloadAll).then(() => env.isTest ? app : app.listen(config.port, () => {
  log.info(`Started server on port ${config.port} with refreshInterval = ${config.refreshInterval.humanize()} ...`)

  // Uncomment this line to trigger a rerender of images on deployment
  // If you change *.png to *, it would essentially wipe out the newsstand and trigger a fresh download
  // glob.sync(path.join(newsstand, '*', '*.png')).forEach(fs.rmSync)

  if (config.visionect) {
    const VisionectApiClient = require('node-visionect')
    setupVisionectUpdates(new VisionectApiClient(config.visionect))
  }
}))