const express = require('express')
const dayjs = require('dayjs')
const fs = require('fs')
const Downloader = require('nodejs-file-downloader')
const schedule = require('node-schedule')
const pdf2img = require('pdf-img-convert')

// Server configs
const app = express()
const port = 3000

// Newsstand configs
const newsstand = './.newspapers' // Local directory to cache newspaper downloads
const newspapers = ['WSJ', 'NY_NYT'] // See https://www.freedomforum.org/todaysfrontpages/ for list of papers
const offsets = [0, 1, 2, 3] // Try today, yesterday etc
const refreshChron = '0 * * * *' // Every hour check for new newspapers

schedule.scheduleJob(refreshChron, downloadAll)

function downloadAll() {
	const today = dayjs()
	for (const offset of offsets)
		for (const paper of newspapers)
			download(paper, today.subtract(offset, 'days'))
}

function download(key, date) {
	const path = [newsstand, date.format('YYYY-MM-DD'), `${key}.pdf`]
	const debug = path.slice(1).join('/')

	if (fs.existsSync(path.join('/'))) {
		console.log(`Already downloaded ${debug}`)
		return
	}

	console.log(`Checking for ${debug} ...`)
	const downloader = new Downloader({
		// e.g. https://cdn.freedomforum.org/dfp/pdf12/WSJ.pdf
		url: `https://cdn.freedomforum.org/dfp/pdf${date.date()}/${path[2]}`,
		directory: path.slice(0, 2).join('/'),
		skipExistingFileName: true,
		onBeforeSave: deducedName => console.log(`Saving ${path[1]}/${deducedName} ...`)
	})
	downloader.download()
		.then(pdfToImage)
		.catch(error => {
			if (error.statusCode && error.statusCode === 404)
				console.log(`${debug} is not available yet`)
			else
				console.error(`Could not download ${debug}`, error)
		})
}

function pdfToImage(pdf) {
	console.log(`Converting ${pdf.filePath} to png ...`)
	pdf2img.convert(pdf.filePath).then(images => {
		fs.writeFileSync(pdf.filePath.replace('.pdf', '.png'), images[0])
	})
}

app.get('/', (req, res) => {
	res.send('Hello World!')
})

app.listen(port, () => {
	console.log(`Starting server on port ${port} ...`)
})

downloadAll()
