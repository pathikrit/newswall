const test = require('supertest')
const app = require('./app')

describe('server', () => {
	it("should serve homepage", () => test(app).get('/').expect(200))
	it("should serve a paper", () => test(app).get('/latest').expect(200))
	it("should serve NYT", () => test(app).get('/latest?papers=NYT').expect(200))
	it("should serve any paper", () => test(app).get('/latest?papers=-1').expect(200))
	it("serve 404 404", () => test(app).get('/foo').expect(404))
})
