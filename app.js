const express = require('express')
const compression = require('compression')
const serveIndex = require('serve-index')
const dayjs = require('dayjs')
const fs = require('fs')
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
const newspapers = [
	'WSJ',   	 // Wall Street Journal
	'NY_NYT',  // New York Times
	'DC_WP',	 // Washington Post
]

const numDays = 3 // Try today, yesterday etc
const refreshChron = '0 * * * *' // Every hour check for new newspapers

// Schedule the job for immediate and cron schedule
schedule.scheduleJob(refreshChron, downloadAll)
downloadAll()

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
	const path = [newsstand, date.format('YYYY-MM-DD'), `${newspaper}.pdf`]
	const pdf = path.slice(1).join('/')
	const fullPath = path.join('/')

	if (fs.existsSync(fullPath)) {
		console.debug(`Already downloaded ${pdf}`)
		pdfToImage(fullPath)
		return
	}

	console.log(`Checking for ${pdf} ...`)
	const downloader = new Downloader({
		url: `https://cdn.freedomforum.org/dfp/pdf${date.date()}/${path[2]}`,
		directory: path.slice(0, 2).join('/'),
		skipExistingFileName: true,
		onBeforeSave: deducedName => console.log(`Saving ${path[1]}/${deducedName} ...`)
	})
	downloader.download()
		.then(() => pdfToImage(fullPath))
		.catch(error => {
			if (error.statusCode && error.statusCode === 404)
				console.log(`${pdf} is not available`)
			else
				console.error(`Could not download ${pdf}`, error)
		})
}

function pdfToImage(pdf) {
	const png = pdf.replace('.pdf', '.png')
	if (fs.existsSync(png)) {
		console.debug(`${png} already exists`)
		return
	}
	console.log(`Converting ${pdf} to png ...`)
	pdf2img.convert(pdf)
		.then(images => {
			fs.writeFileSync(png, images[0])
			console.log(`Wrote ${png}`)
		})
		.catch(error => {
			console.error(`Could not convert ${pdf} to png`, error)
			fs.unlinkSync(pdf) // Corrupted pdf? Delete it
		})
}

let counter = 0 // We cycle through this so every time we get a new paper
function nextPaper() {
	for (const date of recentDays()) {
		const directory = [newsstand, date.format('YYYY-MM-DD')].join('/')
		if (fs.existsSync(directory)) {
			const papers = fs.readdirSync(directory).filter((file) => file.endsWith('.png'))
			const numPapers = papers.length
			if (numPapers > 0) {
				return [directory, papers[Math.abs(counter++) % numPapers]].join('/')
			}
		}
	}
}

// Setup the server
const app = express()

app.use(compression())
app.use('/archive', serveIndex(newsstand))
app.use('/archive', express.static(newsstand))

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')))

app.get('/latest', (req, res) => {
	const paper = nextPaper()
	if (paper)
		res.sendFile(paper)
	else
		res.sendStatus(404)
})

app.listen(port, () => console.log(`Starting server on port ${port} ...`))
