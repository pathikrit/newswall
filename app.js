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
// For the CSS style, you just have to experiment to remove the margins and scale a bit
const newspapers = [
	{
		id: 'WSJ',
		name: 'Wall Street Journal',
		url: date => `https://cdn.freedomforum.org/dfp/pdf${date.date()}/WSJ.pdf`,
		style: 'width:98%; margin:-70px 0px 0px -15px'
	},
	{
		id: 'NYT',
		name: 'New York Times',
		url: date => `https://cdn.freedomforum.org/dfp/pdf${date.date()}/NY_NYT.pdf`,
		style: 'width:99%; margin:-60px 10px 0px 3px'
	},
	{
		id: 'WaPo',
		name: 'Washington Post',
		url: date => `https://cdn.freedomforum.org/dfp/pdf${date.date()}/DC_WP.pdf`,
		style: 'width:99%; margin:-5% -5% 0px -5%'
	}
]

// Every hour check for new newspapers
const refreshChron = '0 * * * *'

// We choose width:1600 since the display is 2560 x 1600; see: https://www.npmjs.com/package/pdf-img-convert
const pdf2ImgOpts = { width: 1600 }

/** Returns tomorrow, today, yesterday, day before yesterday etc. */
function recentDays() {
	return [1, 0, -1, -2, -3].map(i => dayjs().add(i, 'days'))
}

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
	require('pdf-img-convert').convert(pdf, pdf2ImgOpts)
		.then(images => {
			const png = pdf.replace('.pdf', '.png')
			fs.writeFileSync(png, images[0])
			console.log(`Wrote ${png}`)
		})
		.catch(error => {
			console.error(`Could not convert ${pdf} to png`, error)
			fs.unlinkSync(pdf) // Corrupted pdf? Delete it
		})
}

let counter = 0 // We cycle through this so every time we get a new paper
function nextPaper(searchId) {
	for (const date of recentDays().map(d => d.format('YYYY-MM-DD'))) {
		const papers = glob.sync(path.join(newsstand, date, `${searchId || '*'}.png`))
		if (papers.length === 0) continue

		const paper = papers[Math.abs(counter++) % papers.length]
		const id = path.parse(paper).name
		for (const item of newspapers) {
			if (item.id === id) {
				return {...item, ...{date: date}}
			}
		}
		console.error(`Unknown paper found: ${paper}`)
	}
}

/** Setup the express server */
const express = require('express')
const app = express()
	.set('view engine', 'ejs')
	.use(require('compression')())
	// Serve the archive statically
	.use('/archive', require('serve-index')(newsstand))
	.use('/archive', express.static(newsstand))
	// Main pages
	.get('/', (req, res) => res.render('index', {papers: newspapers}))
	.get('/latest/:id?', (req, res) => res.render('paper', {paper: nextPaper(req.params.id)}))

/** Invoking this actually starts everything! */
function run() {
	// Uncomment this line to trigger a rerender of images on deployment
	// If you change *.png to *, it would essentially wipe out the newsstand and trigger a fresh download
	// glob.sync(path.join(newsstand, '*', '*.png')).forEach(fs.unlinkSync))

	// Schedule the download job for immediate and periodic
	const scheduler = require('node-schedule')
	scheduler.scheduleJob(refreshChron, downloadAll)
	downloadAll()
	// Start the server
	app.listen(port, () => console.log(`Starting server on port ${port} ...`))
}

run() //Yolo!