require('dotenv').config()
const dayjs = require('dayjs')
  .extend(require('dayjs/plugin/duration'))
  .extend(require('dayjs/plugin/relativeTime'))
  .extend(require('dayjs/plugin/utc'))
  .extend(require('dayjs/plugin/timezone'))
const fs = require('fs')
const glob = require('glob')
const path = require('path')
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

  // Every hour check for new newspapers
  refreshCron: '0 * * * *',

  // Settings for rotating papers in the frontend
  rotation: {
    // By default, rotate every 60 mins
    default: 60,

    // In non-prod, 10x speedup for easier debugging
    speedUp: env.isProd ? 1 : 10
  },

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

// Add a util array.random()
Object.defineProperty(Array.prototype, 'random', {
  value: function () {
    return this[~~(this.length * Math.random())]
  }
})

const wait = (seconds) => new Promise(resolve => setTimeout(resolve, 1000*seconds))

// Cartesian product util - see https://stackoverflow.com/questions/12303989/
const cartesian = (...as) => as.reduce((a, b) => a.flatMap(d => b.map(e => [d, e].flat())))

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
function recentDays(n, timezone = 'Etc/GMT-14') {
  return Array.from(Array(n).keys()).map(i => dayjs().tz(timezone).subtract(i, 'days').format('YYYY-MM-DD'))
}

/** Downloads all newspapers for all recent days; trashes old ones */
function downloadAll() {
  // Delete old stuff
  glob(path.join(config.newsstand, `!(${recentDays(config.archiveLength).join('|')})`), (err, dirs) => {
    dirs.forEach(dir => fs.rm(dir, {force: true, recursive: true}, () => log.info(`Deleted old files: ${dir}`)))
  })

  log.info('Checking for new papers ...')
  return Promise.all(cartesian(recentDays(3), db.newspapers.list()).map(arg => download(arg[1], arg[0])))
}

/** Download the newspaper for given date */
function download(newspaper, date) {
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

function pdfToImage(pdf, png) {
  log.info(`Converting ${pdf} to ${png} ...`)
  return require('pdf-img-convert')
    .convert(pdf, config.display.pdf2ImgOpts)
    .then(images => fs.writeFile(png, images[0], () => log.info(`Wrote ${png}`)))
    .catch(error => fs.rm(pdf, () => log.error(`Could not convert ${pdf} to png`, error))) // Corrupted pdf? Delete it
}

/** Finds a new latest paper that is preferably not the current one. If papers is specified, it would be one of these */
function nextPaper(currentDevice, currentPaper) {
  const searchTerm = currentDevice?.newspapers?.length > 0 ? (currentDevice.newspapers.length === 1 ? currentDevice.newspapers[0].id : `{${currentDevice.newspapers.map(p => p.id).join(',')}}`) : '*'
  for (const date of recentDays(3, currentDevice?.timezone)) {
    const globExpr = path.join(config.newsstand, date, `${searchTerm}.png`)
    const ids = glob.sync(globExpr).map(image => path.parse(image).name)
    if (ids.length === 0) continue
    // Find something that is not current or a random one
    const id = ids.filter(id => currentPaper && id !== currentPaper).random() || ids.random()
    const paper = db.newspapers.list(id)
    const displayFor = (currentDevice?.newspapers?.find(p => p.id === paper.id)?.displayFor || config.rotation.default)/config.rotation.speedUp
    if (paper) return Object.assign(paper, {date: date, displayFor: displayFor})
    if (id) log.error(`Unknown paper found: ${id}`)
  }
}

/** Schedule the job (and kick one off right now) */
function scheduleAndRun(cron, job) {
  require('node-schedule').scheduleJob(cron, job)
  return job()
}

/** Uses VSS API to fetch device WiFi and Battery info AND also sync VSS device info with our configs */
function setupVisionectUpdates() {
  console.assert(!env.isTest, "VSS should not be messed around with from tests!")
  const VisionectApiClient = require('node-visionect')
  const visionect = new VisionectApiClient(config.visionect)

  if (env.isProd) {
    db.devices.list().forEach(device => {
      logApi = (msg, promise) => promise.then(() => console.log(msg, device.id)).catch(err => console.error(`Failed to ${msg.toLowerCase()}`, device.id, err))

      logApi('Update device', visionect.devices.patch(device.id, {Options: {Name: device.name, Timezone: device.timezone}}))
      logApi('Update session', visionect.sessions.patch(device.id, {
        Backend: {
            Name: 'HTML',
            Fields: {
              ReloadTimeout: (config.rotation.default * 60).toString(),
              url: `${config.myUrl}/latest/${device.id}`
            }
          }
        })
      )
      logApi('Restart session', wait(60).then(() => visionect.sessions.restart(device.id)))
    })
  }

  scheduleAndRun(config.refreshCron, () => {
    log.info('Updating status ...')
    visionect.devices.get().then(res => {
      log.debug(res.data)
      res.data.forEach(device => {
        const updated = db.devices.updateStatus(device.Uuid, {
          wifi: parseInt(device.Status?.RSSI),
          battery: parseInt(device.Status?.Battery),
          temperature: parseInt(device.Status?.Temperature),
          updatedAt: dayjs(), //TODO: updatedAt should come from joan API
          _apiResponse: device
        })
        if (!updated) log.error('Device in API not found in database', device)
      })
    })
  })
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

    log.info(reqInfo, `; Next=${paper?.name} for ${paper?.date}; Device=${device?.name}`)
    paper ? res.render('paper', {paper: paper, device: device}) : notFound('Any newspapers')
  })
// Wire up globals to ejs
app.locals = Object.assign(app.locals, {dayjs: dayjs, env: env, display: config.display})

// Just download right away and then and export the app if this is a test so test framework can start the server
if (env.isTest) {
  module.exports = downloadAll().then(() => app)
} else { // Start the server!
  app.listen(config.port, () => {
    log.info(`Started server on port ${config.port} ...`)

    // Uncomment this line to trigger a rerender of images on deployment
    // If you change *.png to *, it would essentially wipe out the newsstand and trigger a fresh download
    // glob.sync(path.join(newsstand, '*', '*.png')).forEach(fs.rmSync)

    // Schedule jobs
    scheduleAndRun(config.refreshCron, downloadAll)
    setupVisionectUpdates()
  })
}
