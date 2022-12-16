const express = require('express')
const compression = require('compression')
const serveIndex = require('serve-index')
const dayjs = require('dayjs')
const fs = require('fs')
const glob = require('glob')
const path = require('path')
const Downloader = require('nodejs-file-downloader')
const schedule = require('node-schedule')
const pdf2img = require('pdf-img-convert')

// Configs
const port = process.env.PORT || 3000
// Directory to cache newspaper downloads
const newsstand = (process.env.NODE_ENV === 'production') ? '/var/lib/data/newsstand' : path.resolve('./.newspapers')

// See https://www.freedomforum.org/todaysfrontpages/ for list of supported papers
// e.g. for Wall Street Journal the url is https://cdn.freedomforum.org/dfp/pdf12/WSJ.pdf and thus the key is 'WSJ'
// For the style, you just have to experiment to remove the margins and scale a bit
const newspapers = [
	{
		name: 'Wall Street Journal',
		key: 'WSJ',
		style: 'width:98%; margin:-70px 0px 0px -15px'
	},
	{
		name: 'New York Times',
		key: 'NY_NYT',
		style: 'width:99%; margin:-60px 10px 0px 3px'
	},
	{
		name: 'Washington Post',
		key: 'DC_WP',
		style: 'width:108%; margin:-5% -5% 0px -5%'
	}
]

const numDays = 3 // Try today, yesterday etc
const refreshChron = '0 * * * *' // Every hour check for new newspapers

// See: https://www.npmjs.com/package/pdf-img-convert; We choose 1600 since the display is 2560 x 1600
const pdf2ImgOpts = { width: 1600 }
// Set this to true to re-render images e.g. if you changed above params
// Note: this is expensive - so this should be set back to false in subsequent deployment
const reRenderImages = false

function recentDays() {
	const today = dayjs()
	return Array(numDays).fill(null).map((_, i) => today.subtract(i, 'days'))
}

// Downloads all newspapers for all recent days
function downloadAll() {
	for (const date of recentDays())
		for (const newspaper of newspapers)
			download(newspaper, date)
}

// Download the newspaper for given day
function download(newspaper, date) {
	const fragments = [newsstand, date.format('YYYY-MM-DD'), `${newspaper.key}.pdf`]
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
	const downloader = new Downloader({
		url: `https://cdn.freedomforum.org/dfp/pdf${date.date()}/${fragments[2]}`,
		directory: path.join(...fragments.slice(0, 2)),
		skipExistingFileName: true,
		onBeforeSave: deducedName => console.log(`Saving ${fragments[1]}/${deducedName} ...`)
	})
	downloader.download()
		.then(() => pdfToImage(fullPath))
		.catch(error => {
			if (error.statusCode && error.statusCode === 404)
				console.log(`${name} is not available`)
			else
				console.error(`Could not download ${name}`, error)
		})
}

function pdfToImage(pdf) {
	console.log(`Converting ${pdf} to png ...`)
	pdf2img.convert(pdf, pdf2ImgOpts)
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
function nextPaper(searchKey) {
	for (const date of recentDays().map(d => d.format('YYYY-MM-DD'))) {
		const papers = glob.sync(path.join(newsstand, date, `${searchKey || '*'}.png`))
		if (papers.length === 0) continue

		const paper = papers[Math.abs(counter++) % papers.length]
		const key = path.parse(paper).name
		for (const item of newspapers) {
			if (item.key === key) {
				return {...item, ...{date: date}}
			}
		}
		console.error(`Unknown paper found: ${paper}`)
	}
}

// Setup the express server
const app = express()
	.set('view engine', 'ejs')
	.use(compression())
	// Serve the archive statically
	.use('/archive', serveIndex(newsstand))
	.use('/archive', express.static(newsstand))
	// Main pages
	.get('/', (req, res) => res.render('index', {papers: newspapers}))
	.get('/latest/:key?', (req, res) => res.render('paper', {paper: nextPaper(req.params.key)}))

// Invoking this actually starts everything
function run() {
	if (reRenderImages) {
		console.warn('Re-rendering all images ...')
		glob(path.join(newsstand, '*', '*.pdf'), (err, pdfs) => pdfs.forEach(pdfToImage))
	}
	// Schedule the download job for immediate and periodic
	schedule.scheduleJob(refreshChron, downloadAll)
	downloadAll()
	// Start the server
	app.listen(port, () => console.log(`Starting server on port ${port} ...`))
}

run() //Yolo!