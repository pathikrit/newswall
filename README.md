Newswall [![CI](https://github.com/pathikrit/newswall/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/pathikrit/newswall/actions/workflows/ci.yml)
---
Inspired by the [e-ink newspaper](https://github.com/mmicire/nyt2png) project ([HN post](https://news.ycombinator.com/item?id=26611371), [original idea by Max Braun](https://onezero.medium.com/the-morning-paper-revisited-35b407822494)),
this is a pure node.js port of [graiz/newsprint](https://github.com/graiz/newsprint)

1. Install `yarn` and `node` e.g. using `brew`:
```shell
brew install node yarn
```

2. The server is a simple [expressjs](https://expressjs.com/) app. Running it locally:
```shell
yarn && node --watch app.js
```
Then open <http://localhost:3000> in your browser. You can now point your e-ink display to <http://localhost:3000/latest>

3. Run [tests](/app.test.js):
```shell
yarn test
```

Most of the papers come from [The Freedom Forum](https://www.freedomforum.org/todaysfrontpages/) - please consider [supporting](https://www.freedomforum.org/support/) them.

My Setup
---
I use the [32-inch Visionect display](https://www.visionect.com/shop/place-play-32/ref/pathikrit/)
which can be easily configured in [their online portal](https://portal.getjoan.com/) to point to any website
([this](http://newswall.onrender.com) is currently [deployed on render.com](https://render.com/docs/deploy-node-express-app)).
My excellent [local framing shop](https://tenaflycamera.business.site/)
made a [custom frame](https://photos.app.goo.gl/SYgRZbz4BgVaxsVg8) for me that not only hides the manufacturer's logo on the frame but also hides [a small portable powerbank](https://www.amazon.com/gp/product/B09VP41M71/ref=ppx_yo_dt_b_asin_title_o00_s00?ie=UTF8&th=1) 
that makes it easy to recharge the display without taking the frame off the wall. 
I have a [little util](https://github.com/pathikrit/node-joan) which uses [their API](https://portal.getjoan.com/api/docs/) to overlay a little battery status on the bottom of the newspaper being shown.

![My Frame](https://i.imgur.com/g7IWzEU.jpg)
