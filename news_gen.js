const OpenAI = require("openai")
const Exa = require('exa-js').default
const { z } = require('zod')
const { zodResponseFormat } = require('openai/helpers/zod')
require('dotenv').config()

const llm = new OpenAI()
const search_engine = new Exa(process.env.EXA_API_KEY)

const synthesize_news_prompt = (articles) => ({
    name: "synthesize_news",
    system: `
        You will be provided with a list of news articles of format {topic, title, url, publishedDate, author, text, highlights, image}.
        You must synthesize these articles into a new array containing {topic, title, highlight, image_urls, text},
        because my input may contain the same information multiple times from different sources.
        Make sure each item in the output array pertains to a distinct piece of news
        (ok to repeat topics but the text must not overlap with other items in the output array in terms of what information it contains)
        Make sure your output array is sorted from most important news to least important news
        The image_urls in the output must be list of images pertaining to the same article from the input sources (empty array if none)
    `,
    user: JSON.stringify(articles),
    schema: z.object({articles: z.array(z.object({topic: z.string(), title: z.string(), highlight: z.string(), image_urls: z.array(z.string()), text: z.string()}))})
})

const ask_llm = (query, mini=true) => llm.beta.chat.completions.parse({
    model: mini ? "gpt-4o-mini" : "gpt-4o",
    messages: [
        {role: 'user',content: query.user},
        {role: 'system',content: query.system}
    ],
    response_format: zodResponseFormat(query.schema, query.name),
}).then(result => result.choices[0].message.parsed)

const news_search = (topic) => search_engine
    .searchAndContents(topic, {useAutoprompt: true, text: true, highlights: true, category: "news"})
    .then(response => response.results.map(res => ({topic, title: res.title, url: res.url, publishedDate: res.publishedDate, author: res.author, text: res.text, highlights: res.highlights, image: res.image})))

const make_news = (topics) => Promise.all(topics.map(topic => news_search(topic)))
    .then(articles => ask_llm(synthesize_news_prompt(articles.flat())))


const main = async () => {
    const res = await make_news(["spacex", "bergen county"]);
    console.log(res)
}

main()
