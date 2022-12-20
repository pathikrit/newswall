const dayjs = require('dayjs')
const fs = require('fs')
const glob = require('glob')
const path = require('path')

// Configs
const port = process.env.PORT || 3000

// Directory to cache newspaper downloads
const newsstand = (process.env.NODE_ENV === 'production') ? '/var/lib/data/newsstand' : path.resolve('./.newspapers')

// List of newspapers we support
// and a function for each that given a date returns the url of the pdf of the front page of that newspaper for that date
// The Freedom Forum has a large list of papers: https://www.freedomforum.org/todaysfrontpages/
// e.g. for Wall Street Journal the url is https://cdn.freedomforum.org/dfp/pdf12/WSJ.pdf
//
// But, any url as a function of date works e.g. for NYT, this works too (albeit with slight adjustment of the style param):
// url: date => `https://static01.nyt.com/images/${date.format('YYYY')}/${date.format('MM')}/${date.format('DD')}/nytfrontpage/scan.pdf`
//
// For the CSS style, you just have to experiment to remove the margins - margin:top right bottom left
const newspapers = [
	{
		id: 'WSJ',
		name: 'Wall Street Journal',
		url: date => `https://cdn.freedomforum.org/dfp/pdf${date.format('D')}/WSJ.pdf`,
		style: 'transform: scale(1.05); margin:0px 0px 0px 0px'
	},
	{
		id: 'NYT',
		name: 'New York Times',
		url: date => `https://cdn.freedomforum.org/dfp/pdf${date.format('D')}/NY_NYT.pdf`,
		style: 'transform: scale(1.05); margin:0px 0px 0px 0px'
	},
	{
		id: 'WaPo',
		name: 'Washington Post',
		url: date => `https://cdn.freedomforum.org/dfp/pdf${date.format('D')}/DC_WP.pdf`,
		style: 'transform: scale(1.05); margin:-20px 0px 0px 0px'
	},
	// {
	// 	id: 'Pravda',
	// 	name: 'Moskovskaya Pravda',
	// 	url: date => `https://cdn.freedomforum.org/dfp/pdf${date.date()}/RUS_MP.pdf`,
	// 	style: 'width:100%; margin:-50px 0px 0px -15px'
	// },
	// {
	// 	id: 'AsianAge',
	// 	name: 'The Asian Age',
	// 	url: date => `https://cdn.freedomforum.org/dfp/pdf${date.date()}/IND_AGE.pdf`,
	// 	style: 'width:100%; margin:-50px 0px 0px -15px'
	// },
]
console.assert(newspapers.length > 0, 'Please add atleast 1 newspaper for app to work')

// Every hour check for new newspapers
const refreshCron = '0 * * * *'

// Although our display is 2560x1440 we choose a slightly bigger width of 1600 which makes it easier to zoom/crop useless white margins around the edges
const pdf2ImgOpts = { width: 1600 }

/** Returns tomorrow, today, yesterday, day before yesterday etc. */
function recentDays() {
	return [1, 0, -1, -2, -3].map(i => dayjs().add(i, 'days'))
}

Object.defineProperty(Array.prototype, 'random', {
	value: function() {
		return this[~~(this.length * Math.random())]
	}
})

/** Downloads all newspapers for all recent days */
function downloadAll() {
	for (const date of recentDays())
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
			fs.unlinkSync(pdf) // Corrupted pdf? Delete it
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
	.use(require('cookie-parser')())
	.use(require('compression')())
	.use(require('nocache')())  // We don't want page to be cached since they can be refreshed in the background
	.set('view engine', 'ejs')
	// Statically serve the archive
	.use('/archive', require('serve-index')(newsstand))
	.use('/archive', express.static(newsstand))
	// Main pages
	.get('/', (req, res) => res.render('index', {papers: newspapers}))
	.get('/latest', (req, res) => {
		const paper = nextPaper(req.query.papers, req.cookies['current'])
		if (paper) res.cookie('current', paper.id).render('paper', {paper: paper})
		else res.sendStatus(404)
	})

/** Invoking this actually starts everything! */
function run() {
	// Uncomment this line to trigger a rerender of images on deployment
	// If you change *.png to *, it would essentially wipe out the newsstand and trigger a fresh download
	// glob.sync(path.join(newsstand, '*', '*.png')).forEach(fs.unlinkSync)

	// Schedule the download job for immediate and periodic
	const scheduler = require('node-schedule')
	scheduler.scheduleJob(refreshCron, downloadAll)
	downloadAll()
	// Start the server
	app.listen(port, () => console.log(`Starting server on port ${port} ...`))
}

run() //Yolo!