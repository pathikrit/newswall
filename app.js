const express = require('express')
const serveIndex = require('serve-index')
const dayjs = require('dayjs')
const fs = require('fs')
const Downloader = require('nodejs-file-downloader')
const schedule = require('node-schedule')
const pdf2img = require('pdf-img-convert')

// Server configs
const app = express()
const port = process.env.PORT || 3000

// Newsstand configs
const newsstand = './.newspapers' // Local directory to cache newspaper downloads
const newspapers = ['WSJ', 'NY_NYT'] // See https://www.freedomforum.org/todaysfrontpages/ for list of papers
const numDays = 3 // Try today, yesterday etc
const refreshChron = '0 * * * *' // Every hour check for new newspapers

schedule.scheduleJob(refreshChron, downloadAll)

function recentDays() {
	const today = dayjs()
	return Array(numDays).fill(null).map((_, i) => today.subtract(i, 'days'))
}

function downloadAll() {
	for (const date of recentDays())
		for (const paper of newspapers)
			download(paper, date)
}

function download(key, date) {
	const path = [newsstand, date.format('YYYY-MM-DD'), `${key}.pdf`]
	const pdf = path.slice(1).join('/')
	const fullPath = path.join('/')

	if (fs.existsSync(fullPath)) {
		console.debug(`Already downloaded ${pdf}`)
		pdfToImage(fullPath)
		return
	}

	console.log(`Checking for ${pdf} ...`)
	const downloader = new Downloader({
		// e.g. https://cdn.freedomforum.org/dfp/pdf12/WSJ.pdf
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
	if (!fs.existsSync(png)) {
		console.log(`Converting ${pdf} to png ...`)
		pdf2img.convert(pdf)
			.then(images => {
				fs.writeFileSync(png, images[0])
				console.log(`Wrote ${png}`)
			})
			.catch(error => console.error(`Could not convert ${pdf} to png`, error))
	}
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

if (!nextPaper()) downloadAll()

app.use('/static', serveIndex(newsstand))
app.use('/static', express.static(newsstand))

app.get('/', (req, res) => {
	const paper = nextPaper()
	if (paper)
		res.sendFile(paper, {root: __dirname})
	else
		res.sendStatus(404)
})

app.listen(port, () => console.log(`Starting server on port ${port} ...`))
