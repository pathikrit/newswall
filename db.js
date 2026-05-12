const freedom_forum_url = id => date =>
  `https://d2dr22b2lm4tvw.cloudfront.net/${id}/${date.format('YYYY-MM-DD')}/front-page.pdf` // TODO: support .png direct?

const linh_times_url = (name, token) => date =>
  `https://linh-news.fly.dev/pdf/${date.format('YYYY-MM-DD')}/${name.toLowerCase()}?token=${token}`

module.exports = {
  // List of newspapers we support
  // and a function for each that given a date returns the url of the pdf of the front page of that newspaper for that date
  // The Freedom Forum has a large list of papers: https://frontpages.freedomforum.org/
  // e.g. for Wall Street Journal the url is https://d2dr22b2lm4tvw.cloudfront.net/wsj/2026-03-12/front-page.pdf
  //
  // But, any url as a function of date works e.g. for NYT, this works too (albeit with slight adjustment of the scale param):
  // url: date => `https://static01.nyt.com/images/${date.format('YYYY/MM/DD')}/nytfrontpage/scan.pdf`
  //
  // alwaysDownload: If set, redownload and overwrite today's local paper on every refresh (useful for intraday-updated sources)
  // scale: Gets compiled to transform: scale(x) CSS style to zoom in to remove useless white margins. Use the emulator on homepage to experiment
  newspapers: [
    {
      id: 'LATimes',
      name: 'Los Angeles Times',
      url: freedom_forum_url('ca_lat'),
      scale: 1.02,
    },
    {
      id: 'WaPo',
      name: 'Washington Post',
      url: freedom_forum_url('dc_wp'),
      scale: 1.08,
    },
    {
      id: 'NYT',
      name: 'New York Times',
      isSelected: true, // isSelected: True (for either newspaper or device) means we show it as default on the server homepage
      url: freedom_forum_url('ny_nyt'),
      scale: 1.04,
    },
    {
      id: 'WSJ',
      name: 'Wall Street Journal',
      url: freedom_forum_url('wsj'),
      scale: 1.04,
    },
    {
      id: 'RickTimes',
      name: 'The Rick Times',
      url: linh_times_url('Rick', process.env.RICK_TIMES_TOKEN),
      alwaysDownload: true,
      scale: 1.0
    },
    {
      id: 'LinhTimes',
      name: 'The Linh Times',
      url: linh_times_url('Linh', process.env.LINH_TIMES_TOKEN),
      alwaysDownload: true,
      scale: 1.0
    }
  ],

  // Each device has the following attributes:
  // id: This is the joan device id e.g. from this url https://portal.getjoan.com/manage/devices/2a002800-0c47-3133-3633-333400000000
  // timezone: Your local timezone to display correct local time and make sure we don't display newspapers from "tomorrow"
  // showFahrenheit: Which temperature scale to use for the device temperature display in the page footer.
  // newspapers: A list of newspapers (from the section above) that will display on your device - in the format:
  //    id: The id of the newspaper (from the section above).
  //    displayFor: Configure this (in minutes) to display this paper before moving onto the next one.
  devices: [
    {
      id: '32001d00-0f47-3830-3933-303600000000',
      name: "Rick's Newswall",
      timezone: 'America/New_York',
      showFahrenheit: true,
      newspapers: [
        {
          id: 'NYT',
          displayFor: 60
        },
        {
          id: 'WSJ',
          displayFor: 30
        },
        {
          id: 'WaPo',
          displayFor: 15
        },
        {
          id: 'RickTimes',
          displayFor: 15
        }
      ]
    },
    {
      id: '35003600-1247-3830-3933-303600000000',
      name: "Tapas's Newswall",
      timezone: 'America/New_York',
      showFahrenheit: false,
      newspapers: [
        {
          id: 'NYT',
          displayFor: 60
        },
        {
          id: 'WSJ',
          displayFor: 30
        },
        {
          id: 'WaPo',
          displayFor: 15
        },
      ]
    },
    {
      id: '2a002800-0c47-3133-3633-333400000000',
      name: "Alex's Newswall",
      timezone: 'America/New_York',
      showFahrenheit: false,
      newspapers: [
        {
          id: 'NYT',
          displayFor: 60
        },
        {
          id: 'WSJ',
          displayFor: 45
        },
        {
          id: 'WaPo',
          displayFor: 15
        }
      ]
    },
    {
      id: '45004e00-1950-3151-4133-362000000000',
      name: "Linh's Newswall",
      timezone: 'America/New_York',
      showFahrenheit: false,
      newspapers: [
        {
          id: 'LinhTimes',
          displayFor: 30
        },
        {
          id: 'NYT',
          displayFor: 30
        },
        {
          id: 'WSJ',
          displayFor: 30
        },
        {
          id: 'LATimes',
          displayFor: 30
        },
        {
          id: 'WaPo',
          displayFor: 30
        }
      ]
    }
  ]
}
