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

const news_search = (topic) => search_engine.searchAndContents(topic, {useAutoprompt: true, text: true, highlights: true, category: "news"})


const main = async () => {
    // const topics = ["spacex", "bergen county"]
    // const res = await ask_llm(prompts.search_query(topics))
    const res = await news_search("bergen county");
    console.log(res)
}

main()


// name: "search_queries",
//
//