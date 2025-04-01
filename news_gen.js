require('dotenv').config()
const OpenAI = require("openai")
const Exa = require('exa-js').default
const { z } = require('zod')
const _ = require('lodash')
const { zodResponseFormat } = require('openai/helpers/zod')

const llm = new OpenAI(process.env.OPENAI_API_KEY)
const search_engine = new Exa(process.env.EXA_API_KEY)

const synthesize_news_prompt = (articles) => ({
    name: "synthesize_news",
    system: `
        You will be provided with a list of news articles of format {topic, title, url, publishedDate, author, text, highlights, image}.
        You must synthesize these articles into a new array containing {topic, title, highlight, images, text},
        because my input may contain the same information multiple times from different sources.
        Make sure each item in the output array pertains to a distinct piece of news
        (ok to repeat topics but the text must not overlap with other items in the output array in terms of what information it contains)
        Make sure your output array is sorted from most important news to least important news
        The images in the output must be list of image urls pertaining to the same article from the input sources (empty array if none)
        Make sure there are no duplicate images urls in the output array
        Again, if 2 texts in the output array are tangentially similar, make sure to combine them into a single array item
        This output would be used to render a newpapaer front page with a list of articles, headers, bylines, and images
    `,
    user: JSON.stringify(articles),
    schema: z.object({articles: z.array(z.object({topic: z.string(), title: z.string(), highlight: z.string(), images: z.array(z.string()), text: z.string()}))})
})

const ask_llm = (query, mini=false) => llm.beta.chat.completions.parse({
    model: mini ? "gpt-4o-mini" : "gpt-4o",
    messages: [{role: 'system', content: query.system}, {role: 'user',content: query.user}],
    response_format: zodResponseFormat(query.schema, query.name),
}).then(result => result.choices[0].message.parsed)

const news_search = (topic) => search_engine
    .searchAndContents(topic, {useAutoprompt: true, text: true, highlights: true, category: "news"})
    .then(response => response.results.map(res => _.pick({...res, topic}, ["topic", "url", "publishedDate", "author", "text", "highlights", "image"])))

const make_news = (topics) => Promise.all(topics.map(topic => news_search(topic)))
    .then(articles => ask_llm(synthesize_news_prompt(articles.flat())))

const main = async () => {
    const res = await make_news(["spacex", "bergen county"]);
    console.log(JSON.stringify(res, null, 2))
}

main()
