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
const log = console // TODO: find a real logging library

config = {
	port:  process.env.PORT || 3000,

	// Directory to cache newspaper downloads
	newsstand: process.env.NODE_ENV === 'production' ? '/var/lib/data/newsstand' : path.resolve('./.newspapers'),

	// How many days of papers to keep
	archiveLength: 35,

	// Every hour check for new newspapers
	refreshCron: '0 * * * *',

	// Although the Visionect 32-inch e-ink display is 2560x1440 we choose a slightly bigger width of 1600px when converting from pdf to png
	// since it makes it easier to zoom/crop useless white margins around the edges of the newspapers
	display: {
		height: 2560,
		width: 1440,
		pdf2ImgOpts: {width: 1600}
	},

	// Used to display battery and wifi strength on display; remove this if you don't want it
	joan: {
		client_id: process.env.joan_client_id,
		client_secret: process.env.joan_client_secret
	}
}

// Add a util array.random()
Object.defineProperty(Array.prototype, 'random', {
	value: function () {
		return this[~~(this.length * Math.random())]
	}
})

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
	for (const date of recentDays(3))
		for (const newspaper of db.newspapers.list())
			download(newspaper, date)
}

/** Download the newspaper for given date */
function download(newspaper, date) {
	const directory = path.join(config.newsstand, date)
	const fileName = `${newspaper.id}.pdf`
	const pdfPath = path.join(directory, fileName)
	const pngPath = pdfPath.replace('.pdf', '.png')
	const name = `${newspaper.name} for ${date}`

	if (fs.existsSync(pdfPath)) {
		if (fs.existsSync(pngPath)) log.debug(`Already downloaded ${name}`)
		else pdfToImage(pdfPath, pngPath)
		return
	}

	log.info(`Checking for ${name} ...`)
	const url = newspaper.url(dayjs(date))
	const Downloader = require('nodejs-file-downloader')
	new Downloader({url: url, directory: directory, fileName: fileName})
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
	require('pdf-img-convert')
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
		if (paper) return Object.assign(paper, {date: date, displayFor: currentDevice?.newspapers?.find(p => p.id === paper.id)?.displayFor || 60})
		if (id) log.error(`Unknown paper found: ${id}`)
	}
}

/** Schedule the job (and kick one off right now) */
function scheduleAndRun(cron, job) {
	require('node-schedule').scheduleJob(cron, job)
	return job()
}

/** Fetches the device's wifi and battery levels to overlay on the paper */
function updateDeviceStatus(joanApiClient) {
	log.info('Updating status ...')
	joanApiClient.devices().then(res => {
		log.debug(res)
		res.results.forEach(device => {
			const status = Object.assign(device, {updatedAt: dayjs()}) //TODO: updatedAt should come from joan API
			if (!db.devices.updateStatus(device.uuid, status)) log.error('Device in API not found in database', device)
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
		const device = db.devices.list(req.params.deviceId)
		const paperParam = req.query.paper ? {newspapers: [{id: req.query.paper}]} : undefined
		const paper = nextPaper(device || paperParam, req.query.prev)
		log.info(`GET ${req.originalUrl} from ${req.ip} (${req.headers['user-agent']}): Prev=[${req.query.prev}]; Next=[${paper ? `${paper.id} for ${paper.date}` : 'NOT FOUND'}]`)
		paper ? res.render('paper', {paper: paper, device: device}) : res.sendStatus(StatusCodes.NOT_FOUND)
	})
// Wire up globals to ejs
app.locals.dayjs = dayjs
app.locals.display = config.display

/** Invoking this actually starts everything! */
function run() {
	// Uncomment this line to trigger a rerender of images on deployment
	// If you change *.png to *, it would essentially wipe out the newsstand and trigger a fresh download
	// glob.sync(path.join(newsstand, '*', '*.png')).forEach(fs.rmSync)

	// Schedule jobs
	scheduleAndRun(config.refreshCron, downloadAll)
	if (config.joan) {
		const {JoanApiClient} = require('node-joan')
		const joanApiClient = new JoanApiClient(config.joan.client_id, config.joan.client_secret)
		scheduleAndRun(config.refreshCron, () => updateDeviceStatus(joanApiClient))
	}

	// Start the server
	app.listen(config.port, () => log.info(`Starting server on port ${config.port} ...`))
}

run() //Yolo!
