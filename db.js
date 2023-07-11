module.exports = {
  // Note: An `isSelected: true` item can be added to either an entry in the `newspapers` or `devices` sections below.
  //       Only one `isSelected` can be added across both sections, and an `isSelected` in the `newspapers` section
  //       takes priority over an `isSelected` in the `devices` section.
  //
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
    {
      id: 'NYT',
      name: 'New York Times',
      isSelected: true,
      url: date => `https://cdn.freedomforum.org/dfp/pdf${date.format('D')}/NY_NYT.pdf`,
      scale: 1.04,
    },
    {
      id: 'WSJ',
      name: 'Wall Street Journal',
      url: date => `https://cdn.freedomforum.org/dfp/pdf${date.format('D')}/WSJ.pdf`,
      scale: 1.05
    },
    {
      id: 'WaPo',
      name: 'Washington Post',
      url: date => `https://cdn.freedomforum.org/dfp/pdf${date.format('D')}/DC_WP.pdf`,
      scale: 1.07,
    },
    {
      id: 'UsaToday',
      name: 'USA Today',
      url: date => `https://cdn.freedomforum.org/dfp/pdf${date.format('D')}/USAT.pdf`,
      scale: 1.03,
    },
    {
      id: 'AsianAge',
      name: 'The Asian Age',
      url: date => `https://cdn.freedomforum.org/dfp/pdf${date.format('D')}/IND_AGE.pdf`,
      scale: 1.02,
    },
  ],

  // Each device has the following attributes:
  // id: This is the joan device id e.g. from this url https://portal.getjoan.com/manage/devices/2a002800-0c47-3133-3633-333400000000
  // timezone: Since we always try to show the latest newspapers, you may not want to see newspapers from tomorrow based on your timezone.
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
          id: 'UsaToday',
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
