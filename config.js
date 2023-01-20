const path = require('path')

const isProd = process.env.NODE_ENV === 'production'

module.exports = {
	port:  process.env.PORT || 3000,

	// Change this to your liking - you may not want to see a newspaper in the future
	timezone: 'America/New_York',

	// Directory to cache newspaper downloads
	newsstand: isProd ? '/var/lib/data/newsstand' : path.resolve('./.newspapers'),

	// How many days of papers to keep
	archiveLength: 35,

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
	// scale: Gets compiled to transform: scale(x) CSS style to zoom in to remove useless white margins. Use the emulator on homepage to experiment
	newspapers: [
		{
			id: 'NYT',
			name: 'New York Times',
			url: date => `https://cdn.freedomforum.org/dfp/pdf${date.format('D')}/NY_NYT.pdf`,
			scale: 1.04,
			displayFor: 60
		},
		{
			id: 'WSJ',
			name: 'Wall Street Journal',
			url: date => `https://cdn.freedomforum.org/dfp/pdf${date.format('D')}/WSJ.pdf`,
			scale: 1.05,
			displayFor: 30
		},
		{
			id: 'UsaToday',
			name: 'USA Today',
			url: date => `https://cdn.freedomforum.org/dfp/pdf${date.format('D')}/USAT.pdf`,
			scale: 1.03,
			displayFor: 10
		},
		{
			id: 'WaPo',
			name: 'Washington Post',
			url: date => `https://cdn.freedomforum.org/dfp/pdf${date.format('D')}/DC_WP.pdf`,
			scale: 1.07,
			displayFor: 10
		},
		{
			id: 'AsianAge',
			name: 'The Asian Age',
			url: date => `https://cdn.freedomforum.org/dfp/pdf${date.format('D')}/IND_AGE.pdf`,
			scale: 1.02,
			displayFor: 5
		},
	],

	// Every hour check for new newspapers
	refreshCron: '0 * * * *',

	// Although my e-ink display is 2560x1440 we choose a slightly bigger width of 1600px when converting from pdf to png
	// since it makes it easier to zoom/crop useless white margins around the edges of the newspapers
	display: {
		height: 2560,
		width: 1440,
		pdf2ImgOpts: {width: 1600}
	}
}

console.assert(module.exports.newspapers.length > 0, 'Please configure at least 1 newspaper for app to work')