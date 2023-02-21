require('dotenv').config()
const path = require('path')

const isProd = process.env.NODE_ENV === 'production'

module.exports = {
	port:  process.env.PORT || 3000,

	// Directory to cache newspaper downloads
	newsstand: isProd ? '/var/lib/data/newsstand' : path.resolve('./.newspapers'),

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
