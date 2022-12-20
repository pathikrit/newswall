Inspired by the [e-ink newspaper](https://github.com/mmicire/nyt2png) project ([HN post](https://news.ycombinator.com/item?id=26611371)).

This is a pure node.js port of [graiz/newsprint](https://github.com/graiz/newsprint)

The server is a simple express app. Running it locally:
```shell
npm install
node --watch app.js
```
Then open <http://localhost:3000>

I personally use the [32-inch Visionect display](https://www.visionect.com/shop/place-play-32/ref/pathikrit/)
which can be easily configured in [their online portal](https://portal.getjoan.com/) to point to any website
([mine](newswall.onrender.com) is hosted on <render.com>).
