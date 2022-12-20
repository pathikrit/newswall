const dayjs = require('dayjs')
const fs = require('fs')
const glob = require('glob')
const path = require('path')

// Configs
const isProd = process.env.NODE_ENV === 'production'
const port = process.env.PORT || 3000

// Change this to your liking - you may not want to see a newspaper in the future
process.env.TZ = 'America/New_York'

// Directory to cache newspaper downloads
const newsstand = isProd ? '/var/lib/data/newsstand' : path.resolve('./.newspapers')
// If following is set to true, only recent papers are kept; rest are deleted
const onlyKeepRecentPapers = false

// List of newspapers we support
// and a function for each that given a date returns the url of the pdf of the front page of that newspaper for that date
// The Freedom Forum has a large list of papers: https://www.freedomforum.org/todaysfrontpages/
// e.g. for Wall Street Journal the url is https://cdn.freedomforum.org/dfp/pdf12/WSJ.pdf
//
// But, any url as a function of date works e.g. for NYT, this works too (albeit with slight adjustment of the style param):
// url: date => `https://static01.nyt.com/images/${date.format('YYYY/MM/DD')}/nytfrontpage/scan.pdf`
//
// displayFor: Configure this (in minutes) to display this paper before moving onto the next one
//
// For the CSS style, you just have to experiment to remove the margins - margin:top right bottom left
const newspapers = [
	{
		id: 'NYT',
		name: 'New York Times',
		url: date => `https://cdn.freedomforum.org/dfp/pdf${date.format('D')}/NY_NYT.pdf`,
		style: 'transform: scale(1.05)',
		displayFor: 60
	},
	{
		id: 'WSJ',
		name: 'Wall Street Journal',
		url: date => `https://cdn.freedomforum.org/dfp/pdf${date.format('D')}/WSJ.pdf`,
		style: 'transform: scale(1.05)',
		displayFor: 30
	},
	{
		id: 'UsaToday',
		name: 'USA Today',
		url: date => `https://cdn.freedomforum.org/dfp/pdf${date.format('D')}/USAT.pdf`,
		style: 'transform: scale(1.05)',
		displayFor: 10
	},
	{
		id: 'WaPo',
		name: 'Washington Post',
		url: date => `https://cdn.freedomforum.org/dfp/pdf${date.format('D')}/DC_WP.pdf`,
		style: 'transform: scale(1.07); margin-top:-100px',
		displayFor: 10
	},
	// {
	// 	id: 'Pravda',
	// 	name: 'Moskovskaya Pravda',
	// 	url: date => `https://cdn.freedomforum.org/dfp/pdf${date.format('D')}/RUS_MP.pdf`,
	// 	style: 'transform: scale(1.05); margin-top:-250px',
	// 	displayFor: 5
	// },
	// {
	// 	id: 'AsianAge',
	// 	name: 'The Asian Age',
	// 	url: date => `https://cdn.freedomforum.org/dfp/pdf${date.format('D')}/IND_AGE.pdf`,
	// 	style: 'transform: scale(1.01); margin-top:-150px',
	// 	displayFor: 5
	// },
]
console.assert(newspapers.length > 0, 'Please configure at least 1 newspaper for app to work')

// Every hour check for new newspapers
const refreshCron = '0 * * * *'

// Although our display is 2560x1440 we choose a slightly bigger width of 1600 which makes it easier to zoom/crop useless white margins around the edges
const pdf2ImgOpts = {width: 1600}

/** Returns today, yesterday, day before yesterday etc. */
function recentDays() {
	return [0, 1, 2, 3].map(i => dayjs().subtract(i, 'days'))
}

Object.defineProperty(Array.prototype, 'random', {
	value: function () {
		return this[~~(this.length * Math.random())]
	}
})

/** Downloads all newspapers for all recent days; trashes old ones */
function downloadAll() {
	const dates = recentDays()

	if (onlyKeepRecentPapers) {
		const oldDirs = path.join(newsstand, `!(${dates.map(d => d.format('YYYY-MM-DD')).join('|')})`)
		glob(oldDirs, (err, dirs) => {
			dirs.forEach(dir => fs.rm(dir, {force: true, recursive: true}, () => console.log(`Deleted old files: ${dir}`)))
		})
	}

	for (const date of dates)
		for (const newspaper of newspapers)
			download(newspaper, date)
}

/** Download the newspaper for given date */
function download(newspaper, date) {
	const fragments = [newsstand, date.format('YYYY-MM-DD'), `${newspaper.id}.pdf`]
	const fullPath = path.join(...fragments)
	const name = `${newspaper.name} for ${fragments[1]}`

	if (fs.existsSync(fullPath)) {
		if (fs.existsSync(fullPath.replace('.pdf', '.png'))) {
			console.debug(`Already downloaded ${name}`)
		} else {
			pdfToImage(fullPath)
		}
		return
	}

	console.log(`Checking for ${name} ...`)
	const url = newspaper.url(date)
	const Downloader = require('nodejs-file-downloader')
	const downloader = new Downloader({
		url: url,
		directory: path.join(...fragments.slice(0, 2)),
		skipExistingFileName: true,
		fileName: fragments[2]
	})
	downloader.download()
		.then(() => pdfToImage(fullPath))
		.catch(error => {
			if (error.statusCode && error.statusCode === 404)
				console.log(`${name} is not available at ${url}`)
			else
				console.error(`Could not download ${name} from ${url}`, error)
		})
}

function pdfToImage(pdf) {
	console.log(`Converting ${pdf} to png ...`)
	require('pdf-img-convert')
		.convert(pdf, pdf2ImgOpts)
		.then(images => {
			const png = pdf.replace('.pdf', '.png')
			fs.writeFile(png, images[0], () => console.log(`Wrote ${png}`))
		})
		.catch(error => {
			console.error(`Could not convert ${pdf} to png`, error)
			fs.rm(pdf) // Corrupted pdf? Delete it
		})
}

/** Finds a new latest paper that is preferably not the current one. If papers is specified, it would be one of these */
function nextPaper(papers, current) {
	const searchTerm = papers && papers.includes(',') ? `{${papers}}` : papers
	for (const date of recentDays().map(d => d.format('YYYY-MM-DD'))) {
		const globExpr = path.join(newsstand, date, `${searchTerm || '*'}.png`)
		const ids = glob.sync(globExpr).map(image => path.parse(image).name)
		// Find something that is not current or a random one
		const id = ids.filter(id => current && id !== current).random() || ids.random()
		const paper = newspapers.find(item => item.id === id)
		if (paper) return Object.assign(paper, {date: date})
		if (id) console.error(`Unknown paper found: ${id}`)
	}
}

/** Setup the express server */
const express = require('express')
const app = express()
	// Hook up middlewares
	.use(require('compression')())
	.use(require('nocache')())  // We don't want page to be cached since they can be refreshed in the background
	.set('view engine', 'ejs')
	// Statically serve the archive
	.use('/archive', require('serve-index')(newsstand))
	.use('/archive', express.static(newsstand))
	// Main pages
	.get('/', (req, res) => res.render('index', {papers: newspapers}))
	.get('/latest', (req, res) => {
		const paper = nextPaper(req.query.papers, req.query.prev)
		console.log(`GET ${req.originalUrl} from ${req.ip} (${req.headers['user-agent']}): Prev=${req.query.prev}; Next=${paper ? `${paper.id} (${paper.date})` : 'NOT FOUND'}`)
		paper ? res.render('paper', {paper: paper}) : res.sendStatus(404)
	})

/** Invoking this actually starts everything! */
function run() {
	// Uncomment this line to trigger a rerender of images on deployment
	// If you change *.png to *, it would essentially wipe out the newsstand and trigger a fresh download
	// glob.sync(path.join(newsstand, '*', '*.png')).forEach(fs.rmSync)

	// Schedule the download job for immediate and periodic
	const scheduler = require('node-schedule')
	scheduler.scheduleJob(refreshCron, downloadAll)
	downloadAll()
	// Start the server
	app.listen(port, () => console.log(`Starting server on port ${port} ...`))
}

run() //Yolo!