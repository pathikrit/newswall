module.exports = {
  // List of newspapers we support
  // and a function for each that given a date returns the url of the pdf of the front page of that newspaper for that date
  // The Freedom Forum has a large list of papers: https://www.freedomforum.org/todaysfrontpages/
  // e.g. for Wall Street Journal the url is https://cdn.freedomforum.org/dfp/pdf12/WSJ.pdf
  //
  // But, any url as a function of date works e.g. for NYT, this works too (albeit with slight adjustment of the scale param):
  // url: date => `https://static01.nyt.com/images/${date.format('YYYY/MM/DD')}/nytfrontpage/scan.pdf`
  //
  // scale: Gets compiled to transform: scale(x) CSS style to zoom in to remove useless white margins. Use the emulator on homepage to experiment
  newspapers: [
    // {
    //   id: 'LATimes',
    //   name: 'Los Angeles Times',
    //   url: date => `https://cdn.freedomforum.org/dfp/pdf${date.format('D')}/CA_LAT.pdf`,
    //   scale: 1.07,
    // },
    // {
    //   id: 'SFChronicle',
    //   name: 'San Francisco Chronicle',
    //   url: date => `https://cdn.freedomforum.org/dfp/pdf${date.format('D')}/CA_SFC.pdf`,
    //   scale: 1.01,
    // },
    {
      id: 'USAToday',
      name: 'USA Today',
      url: date => `https://cdn.freedomforum.org/dfp/pdf${date.format('D')}/USAT.pdf`,
      scale: 1.02,
    },
    {
      id: 'BostonGlobe',
      name: 'Boston Globe',
      url: date => `https://cdn.freedomforum.org/dfp/pdf${date.format('D')}/MA_BG.pdf`,
      scale: 0.98,
    },
    // {
    //   id: 'PittsburghPG',
    //   name: 'Pittsburgh Post-Gazette',
    //   url: date => `https://cdn.freedomforum.org/dfp/pdf${date.format('D')}/PA_PPG.pdf`,
    //   scale: 1.05,
    // },
    {
      id: 'WaPo',
      name: 'Washington Post',
      url: date => `https://cdn.freedomforum.org/dfp/pdf${date.format('D')}/DC_WP.pdf`,
      scale: 1.08,
    },
    {
      id: 'NYT',
      name: 'New York Times',
      isSelected: true, // isSelected: True (for either newspaper or device) means we show it as default on the server homepage
      url: date => `https://cdn.freedomforum.org/dfp/pdf${date.format('D')}/NY_NYT.pdf`,
      scale: 1.04,
    },
    {
      id: 'WSJ',
      name: 'Wall Street Journal',
      url: date => `https://cdn.freedomforum.org/dfp/pdf${date.format('D')}/WSJ.pdf`,
      scale: 1.04,
    },
    // {
    //   id: 'IrishTimes',
    //   name: 'Irish Times',
    //   url: date => `https://cdn.freedomforum.org/dfp/pdf${date.format('D')}/IRL_IT.pdf`,
    //   scale: 1.04,
    // },
    // {
    //   id: 'Haaretz',
    //   name: 'Haaretz (English Edition)',
    //   url: date => `https://cdn.freedomforum.org/dfp/pdf${date.format('D')}/ISR_HA.pdf`,
    //   scale: 1.05,
    // },
    {
      id: 'AsianAge',
      name: 'Asian Age',
      url: date => `https://cdn.freedomforum.org/dfp/pdf${date.format('D')}/IND_AGE.pdf`,
      scale: 1.02,
    },
    // {
    //   id: 'JapanTimes',
    //   name: 'Japan Times',
    //   url: date => `https://cdn.freedomforum.org/dfp/pdf${date.format('D')}/JPN_JT.pdf`,
    //   scale: 1.02,
    // },
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
          id: 'USAToday',
          displayFor: 10
        },
        {
          id: 'AsianAge',
          displayFor: 5
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
        {
          id: 'AsianAge',
          displayFor: 45
        }
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
    }
  ]
}
