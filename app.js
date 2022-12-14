const express = require('express')
const dayjs = require('dayjs')
const fs = require('fs')
const Downloader = require('nodejs-file-downloader')
const schedule = require('node-schedule')

// Server configs
const app = express()
const port = 3000

// Newsstand configs
const newsstand = './.newspapers' // Local directory to cache newspaper downloads
const newspapers = ['WSJ', 'NY_NYT'] // See https://www.freedomforum.org/todaysfrontpages/ for list of papers
const offsets = [0, 1, 2] // Try today, yesterday etc
const refreshChron = '* * * * *' // Every hour

schedule.scheduleJob(refreshChron, downloadAll)

function downloadAll() {
	const today = dayjs()
	for (const offset of offsets) {
		for (const paper of newspapers) {
			download(paper, today.subtract(offset, 'days'))
		}
	}
}

function download(key, date) {
	const yyyyMMdd = date.format('YYYY-MM-DD')
	const directory = `${newsstand}/${yyyyMMdd}`

	if (fs.existsSync(`${directory}/${key}.pdf`)) {
		console.log(`Already downloaded ${key} for ${yyyyMMdd}`)
		return
	}

	console.log(`Downloading ${key} for ${yyyyMMdd} ...`)
	const downloader = new Downloader({
		// e.g. https://cdn.freedomforum.org/dfp/pdf12/WSJ.pdf
		url: `https://cdn.freedomforum.org/dfp/pdf${date.date()}/${key}.pdf`,
		directory: directory,
		skipExistingFileName: true,
		onBeforeSave: (deducedName) => {
			console.log(`Saving ${yyyyMMdd}/${deducedName} ...`)
		}
	})
	downloader.download()
}

app.get('/', (req, res) => {
	res.send('Hello World!')
})

app.listen(port, () => {
	console.log(`Example app listening on port ${port}`)
})

downloadAll()
