Newswall
---
Inspired by the [e-ink newspaper](https://github.com/mmicire/nyt2png) project ([HN post](https://news.ycombinator.com/item?id=26611371)),
this is a pure node.js port of [graiz/newsprint](https://github.com/graiz/newsprint)

1. Install `yarn` and `node` e.g. using `brew`:
```shell
brew install node yarn
```

2. The server is a simple [expressjs](https://expressjs.com/) app. Running it locally:
```shell
yarn && node --watch app.js
```
Then open <http://localhost:3000> in your browser.

My Setup
---
I use the [32-inch Visionect display](https://www.visionect.com/shop/place-play-32/ref/pathikrit/)
which can be easily configured in [their online portal](https://portal.getjoan.com/) to point to any website
([this](http://newswall.onrender.com) is currently [deployed on render.com](https://render.com/docs/deploy-node-express-app)).
My excellent [local framing shop](https://tenaflycamera.business.site/)
made a custom frame for me that not only hides the manufacturer's logo on the frame but also hides [a small portable powerbank](https://www.amazon.com/gp/product/B09VP41M71/ref=ppx_yo_dt_b_asin_title_o00_s00?ie=UTF8&th=1) 
that makes it easy to recharge the display without taking the frame off the wall. 
I have a [little util](https://github.com/pathikrit/node-joan) which uses [their API](https://portal.getjoan.com/api/docs/) to overlay a little battery status on the bottom of the newspaper being shown.

![My Frame](/my_frame.jpg?raw=true)
