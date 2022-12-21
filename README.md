Inspired by the [e-ink newspaper](https://github.com/mmicire/nyt2png) project ([HN post](https://news.ycombinator.com/item?id=26611371)).

This is a pure node.js port of [graiz/newsprint](https://github.com/graiz/newsprint).

The server is a simple [expressjs](https://expressjs.com/) app. Running it locally:
```shell
npm install && node --watch app.js
```
Then open <http://localhost:3000>

I personally use the [32-inch Visionect display](https://www.visionect.com/shop/place-play-32/ref/pathikrit/)
which can be easily configured in [their online portal](https://portal.getjoan.com/) to point to any website
([this](http://newswall.onrender.com) is currently [deployed on render.com](https://render.com/docs/deploy-node-express-app)). 
My excellent [local framing shop](https://tenaflycamera.business.site/) 
made a custom frame for me which hides the visionect logo 
and [a small USB batter pack](https://www.amazon.com/gp/product/B09VP41M71/ref=ppx_yo_dt_b_asin_title_o00_s00?ie=UTF8&th=1) which makes it easier to charge without taking the frame off the wall. 
