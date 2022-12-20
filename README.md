Inspired by the [e-ink newspaper](https://github.com/mmicire/nyt2png) project ([HN post](https://news.ycombinator.com/item?id=26611371)).

This is a pure node.js port of [graiz/newsprint](https://github.com/graiz/newsprint) that adds couple of new features:
1. Ability to [configure](https://github.com/pathikrit/newswall/blob/8ff36120521ab406fec4d214b3800c9f699b9f66/app.js#L21) how long to display per newspaper before [auto refreshing](https://en.wikipedia.org/wiki/Meta_refresh) to the next one
2. Easier to add sources that are not just from [The Freedom Forum](https://www.freedomforum.org/todaysfrontpages/) e.g.:
```js
{
    id: 'NYT',
    name: 'New York Times',
    url: date => `https://static01.nyt.com/images/${date.format('YYYY/MM/DD')}/nytfrontpage/scan.pdf`,
    style: 'transform: scale(1.05)',
    displayFor: 60
}
```
3. Uses a cookie to ensure you get a new paper on next refresh instead of global server counter

The server is a simple express app. Running it locally:
```shell
npm install
node --watch app.js
```
Then open <http://localhost:3000>

I personally use the [32-inch Visionect display](https://www.visionect.com/shop/place-play-32/ref/pathikrit/)
which can be easily configured in [their online portal](https://portal.getjoan.com/) to point to any website
([this](http://newswall.onrender.com) is deployed on <https://render.com>).
