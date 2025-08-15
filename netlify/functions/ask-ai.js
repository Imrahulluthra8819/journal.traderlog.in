// You must have node-fetch installed in your project: npm install node-fetch
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

/**
 * A helper function to make calls to the Gemini API.
 * @param {string} prompt - The prompt to send to the Gemini API.
 * @param {string} apiKey - Your Gemini API key.
 * @returns {Promise<string|null>} The text response from the API, or null if an error occurs.
 */
async function callGemini(prompt, apiKey) {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        safetySettings: [
            { "category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE" },
            { "category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_MEDIUM_AND_ABOVE" }
        ]
    };
    try {
        const apiResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!apiResponse.ok) {
            const errorBody = await apiResponse.text();
            console.error("Gemini API Error:", errorBody);
            return null;
        }
        const result = await apiResponse.json();
        return result.candidates?.[0]?.content?.parts?.[0]?.text || null;
    } catch (error) {
        console.error("Gemini Function Error:", error);
        return null;
    }
}


/**
 * Fetches news articles from the Marketaux API based on dynamic search parameters.
 * @param {object} params - An object containing search parameters.
 * @param {string} params.symbols - Comma-separated ticker symbols.
 * @param {string} params.countries - Comma-separated country codes.
 * @param {string} params.search - General search query string.
 * @param {string} apiKey - The Marketaux API key.
 * @returns {Promise<Array|object|null>} A promise that resolves to an array of news articles or an error object.
 */
async function fetchNews(params, apiKey) {
    if (!apiKey) {
        console.error("MARKETAUX_API_KEY environment variable is not set.");
        return { error: "missing_key" };
    }
    
    const { symbols, countries, search } = params;
    
    // Construct the query string for the Marketaux API
    const queryParams = new URLSearchParams({
        filter_entities: 'true',
        language: 'en',
        limit: 5, // Fetch up to 5 relevant articles for better context
        api_token: apiKey
    });

    if (symbols) queryParams.set('symbols', symbols);
    if (countries) queryParams.set('countries', countries);
    if (search) queryParams.set('search', search);

    const url = `https://api.marketaux.com/v1/news/all?${queryParams.toString()}`;
    console.log(`[NEWS] Fetching news from URL: ${url}`);

    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`Marketaux API error: ${response.status} ${await response.text()}`);
            return null;
        }
        const data = await response.json();
        return data.data || [];
    } catch (error) {
        console.error("Error fetching news:", error);
        return null;
    }
}

/**
 * Fetches the latest price for a given symbol from the Marketaux API.
 * @param {string} symbol - The stock/crypto/forex symbol (e.g., 'AAPL').
 * @param {string} apiKey - The Marketaux API key.
 * @returns {Promise<object|null>} A promise that resolves to the price data or null.
 */
async function fetchPrice(symbol, apiKey) {
    if (!apiKey) {
        console.error("MARKETAUX_API_KEY environment variable is not set.");
        return { error: "missing_key" };
    }
    const url = `https://api.marketaux.com/v1/finance/quotes?symbols=${symbol}&api_token=${apiKey}`;
    console.log(`[PRICE] Fetching price from URL: ${url}`);
    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`Marketaux Price API error: ${response.status} ${await response.text()}`);
            return null;
        }
        const data = await response.json();
        return data.data && data.data.length > 0 ? data.data[0] : null;
    } catch (error) {
        console.error("Error fetching price:", error);
        return null;
    }
}


exports.handler = async function (event) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const { question, trades, psychology } = JSON.parse(event.body);
    const geminiApiKey = process.env.GEMINI_API_KEY;
    const marketauxApiKey = process.env.MARKETAUX_API_KEY;

    if (!geminiApiKey) {
        console.error("GEMINI_API_KEY environment variable not set.");
        return { statusCode: 500, body: JSON.stringify({ error: "Gemini API key is not configured." }) };
    }

    let finalReply = null;

    // --- NEW 3-STEP ANALYSIS LOGIC ---
    // Step 1: Check for a price query first.
    if (/\bprice\b/i.test(question)) {
        console.log("[AI] Price query detected. Extracting symbol.");
        const priceSymbolPrompt = `
            You are an AI assistant. Your task is to extract a single, valid stock, crypto, or forex ticker symbol from the user's question.
            - For "Nifty50" or "Nifty 50", use "NIFTY50".
            - For "BTC" or "Bitcoin", use "BTCUSD".
            - For "Reliance", use "RELIANCE".
            - Your response MUST be ONLY the extracted symbol and nothing else.
            
            User's Question: "${question}"
        `;
        const symbol = await callGemini(priceSymbolPrompt, geminiApiKey);

        if (symbol) {
            const priceData = await fetchPrice(symbol.trim(), marketauxApiKey);
            if (priceData?.error === "missing_key") {
                finalReply = "The price feature is not configured. The site owner needs to add a MARKETAUX_API_KEY to the Netlify environment variables to enable it.";
            } else if (priceData) {
                const priceFormatPrompt = `
                    You are TradeMentor. The user asked for a price. You have the latest data.
                    Format the response clearly and concisely.
                    - Start with the symbol and its name.
                    - State the current price clearly.
                    - Mention the day's change and percentage change, indicating if it's up or down with an emoji (📈 or 📉).
                    - Keep it short and direct.
                    
                    Data: ${JSON.stringify(priceData)}
                `;
                finalReply = await callGemini(priceFormatPrompt, geminiApiKey);
            } else {
                finalReply = `I couldn't fetch the current price for "${symbol.trim()}". Please ensure it's a valid ticker symbol.`;
            }
        } else {
            finalReply = "I see you're asking about a price, but I couldn't identify the symbol. Please ask again with a clear ticker, like 'What is the price of AAPL?'.";
        }
    }
    // Step 2: If not a price query, check for a news query.
    else if (/\bnews\b/i.test(question)) {
        console.log("[AI] News query detected. Starting entity extraction.");
        
        const entityExtractionPrompt = `
            You are an expert financial analyst AI. Your task is to extract key entities from a user's question about financial news to be used in a news API search. Return a JSON object with "symbols", "countries", and "search" keys.

            Rules:
            - Prioritize extracting concrete, searchable terms.
            - If the question is about a specific market, use a general but effective search term.
            - If a key has no relevant entity, its value MUST be null.
            - Your response MUST be ONLY the raw JSON object.

            Examples:
            - User Question: "is there any news that can impact the forex market today?" -> {"symbols": null, "countries": null, "search": "forex market"}
            - User Question: "is there any news related to geo politics, trump and fed that can impact the global market?" -> {"symbols": null, "countries": null, "search": "geopolitics trump federal reserve global market"}
            - User Question: "is there any news in crypto that can impact the crypto market?" -> {"symbols": null, "countries": null, "search": "crypto market"}
            - User Question: "is there any news in indian market that can impact the market?" -> {"symbols": null, "countries": "in", "search": "indian stock market"}
            - User Question: "any news on RELIANCE?" -> {"symbols": "RELIANCE", "countries": null, "search": null}

            User's Question: "${question}"
        `;
        const extractedJson = await callGemini(entityExtractionPrompt, geminiApiKey);
        let searchParams = null;
        try {
            if (extractedJson) {
                const sanitizedJson = extractedJson.replace(/```json/g, '').replace(/```/g, '').trim();
                searchParams = JSON.parse(sanitizedJson);
            }
        } catch (e) {
            console.error("Failed to parse JSON from Gemini entity extraction:", extractedJson);
        }

        let queryContext = "the market";
        if (searchParams && (searchParams.symbols || searchParams.countries || searchParams.search)) {
            if (searchParams.symbols) queryContext = searchParams.symbols;
            else if (searchParams.countries === 'in') queryContext = "the Indian market";
            else if (searchParams.countries === 'us') queryContext = "the US market";
            else if (searchParams.search) queryContext = `news related to "${searchParams.search}"`;

            const newsArticles = await fetchNews(searchParams, marketauxApiKey);

            if (newsArticles?.error === "missing_key") {
                 finalReply = "The news feature is not configured. The site owner needs to add a MARKETAUX_API_KEY to the Netlify environment variables to enable it.";
            } else if (newsArticles && newsArticles.length > 0) {
                const analysisPrompt = `
                    ## Persona & Rules (VERY IMPORTANT)
                    - **Your Persona:** You are TradeMentor, an expert AI market analyst.
                    - **Your Goal:** Analyze the provided news articles regarding ${queryContext} and summarize the overall sentiment and potential price impact for a trader.
                    - **Tone & Style:** Authoritative, clear, and concise.

                    ## How to Answer (VERY IMPORTANT)
                    You MUST analyze the provided news articles. Structure your response precisely as follows:
                    1.  Start with a one-sentence summary of the most significant news affecting ${queryContext}.
                    2.  Create a bolded heading: **Overall Market Sentiment**.
                    3.  Under it, provide a **Sentiment:** (e.g., Cautiously Optimistic, Bearish, Neutral, Volatile) and a short paragraph explaining the key drivers behind this sentiment, citing themes from the news.
                    4.  Create a bolded heading: **Probable Impact on Price**.
                    5.  Under it, provide a **Short-Term Impact:** and write a brief analysis of how the news might affect prices in the immediate future (e.g., next few days to a week).
                    6.  On the next line, provide a **Long-Term Impact:** and write a brief analysis of the potential effects over a longer period (e.g., weeks to months).
                    7.  Create a bolded heading: **Mentor Tip**.
                    8.  Provide a short, actionable tip relevant to the current news and market conditions.

                    ## User's Question
                    "${question}"

                    ## Recent News Articles for Analysis
                    ${JSON.stringify(newsArticles, null, 2)}
                `;
                finalReply = await callGemini(analysisPrompt, geminiApiKey);
            } else {
                finalReply = `I couldn't find any recent, significant news related to your query about ${queryContext}. The market may be quiet, or you can try rephrasing your question.`;
            }
        } else {
             finalReply = "I see you're asking about news, but I couldn't identify a specific stock, market, or topic. Could you please be more specific? For example, ask 'any news on RELIANCE?' or 'what's the news for the Indian market?'.";
        }
    }

    // --- Step 3: FALLBACK TO EXISTING TRADE/GENERAL ANALYSIS LOGIC ---
    if (!finalReply) { 
        console.log("[AI] No price or news query detected. Using general trade analysis prompt.");
        const generalPrompt = `
            ## Persona & Rules (VERY IMPORTANT)
            - **Your Persona:** You are TradeMentor, an AI trading coach with 20 years of experience.
            - **Your Goal:** Help the user by answering their questions about their trading performance or general trading concepts.
            - **Tone & Style:** Be direct, wise, and encouraging.
            - **Language:** Use simple English.

            ## How to Answer (VERY IMPORTANT)
            Handle two types of questions:
            1.  **Data-Specific Questions:** If the question is about the user's performance, base your analysis on the provided **User's Data**.
            2.  **General Trading Questions:** If the question is about a general trading concept, answer it based on your experience.

            ## Output Format Rules (FOLLOW PRECISELY)
            - Start with a brief, encouraging introductory sentence.
            - For each point, you MUST follow this structure exactly:
                1. A bolded heading (e.g., **Master Your Strategy**).
                2. Your analysis or advice on the next line.
                3. A bolded heading **Mentor Tip** on the next line.
                4. A short, actionable tip on the next line.
                5. Add a blank line after the Mentor Tip.
            - **Do NOT use bullet points ('*' or '-') at the start of lines.**
            - **Off-Topic Guardrail:** If the question is not related to trading, respond ONLY with: "Please ask a trade-related question."

            ---
            ## User's Data
            **Recent Trades:**
            ${JSON.stringify(trades, null, 2)}
            **Recent Psychology/Confidence Entries:**
            ${JSON.stringify(psychology, null, 2)}
            ---

            ## User's Question
            "${question}"
        `;
        finalReply = await callGemini(generalPrompt, geminiApiKey);
    }

    return {
        statusCode: 200,
        body: JSON.stringify({ reply: finalReply || "I'm sorry, I couldn't generate a response at this time." }),
    };
};
