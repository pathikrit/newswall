const OpenAI = require("openai")
const Exa = require('exa-js').default
const { z } = require('zod')
const { zodResponseFormat } = require('openai/helpers/zod')
require('dotenv').config()

const llm = new OpenAI()
const search_engine = new Exa(process.env.EXA_API_KEY)

const prompts = {
    search_query: (topics) => ({
        name: "search_queries",
        system: "You will be provided with list of topics for which the user wanst to query latest news articles for. Return an array of strings that I should google - 1 per topic.",
        user: `These are my topics:\n${topics.join("\n")}`,
        schema: z.object({queries: z.array(z.string())})
    }),
    synthesize_news: (articles) => ({
        name: "synthesize_news",
        system: `
            You will be provided with a list of news articles of format {topic, title, url, publishedDate, author, text, highlights, image}.
            You must synthesize these articles into a new array containing {topic, title, highlight, image, text},
            because my input may contain the same information multiple times from different sources.
            Make sure each item in the output array pertains to a distinct piece of news
            (ok to repeat topics but the text must not overlap with other items in the output array in terms of what information it contains)
            Make sure your output array is sorted from most important news to least important news
        `,
        user: articles,
        schema: z.array(z.object({topic: z.string(), title: z.string(), highlight: z.string(), image: z.string(), text: z.string()}))
    })
}

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


const main = async () => {
    const topics = ["spacex", "bergen county"]
    // const articles = Promise.all(topics.map(topic => news_search(topic)))

    const res = await news_search("bergen county");
    console.log(res)
}

main()


// name: "search_queries",
//
//