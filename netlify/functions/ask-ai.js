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

    // --- NEW 2-STEP NEWS ANALYSIS LOGIC ---
    // Step 1: Check if the user is asking about news.
    if (/\bnews\b/i.test(question)) {
        console.log("[AI] News query detected. Starting entity extraction.");
        
        // Step 1a: Ask Gemini to extract search terms from the question.
        const entityExtractionPrompt = `
            You are an expert financial analyst AI. Your task is to extract key entities from a user's question about financial news. Analyze the user's question and return a JSON object with the appropriate search parameters for a news API. The JSON object must have three keys: "symbols", "countries", and "search".

            - "symbols": A comma-separated string of stock, crypto, or forex tickers (e.g., "AAPL,TSLA", "BTCUSD,ETHUSD").
            - "countries": A comma-separated string of two-letter ISO country codes (e.g., "us,in").
            - "search": A string for general topic searches (e.g., "geopolitics", "interest rates", "crypto market").

            Rules:
            - If you identify a market like "Indian market", map it to the country code "in". For "US market", use "us".
            - If you identify a specific ticker (like RELIANCE, BTC, EURUSD), put it in "symbols".
            - If the user asks about a broad topic like "geopolitics", "fed", "crypto", or "forex market", put it in the "search" field.
            - If a key has no relevant entity, its value MUST be null.
            - Your response MUST be ONLY the raw JSON object and nothing else.

            User's Question: "${question}"
        `;

        const extractedJson = await callGemini(entityExtractionPrompt, geminiApiKey);
        let searchParams = null;
        try {
            if (extractedJson) {
                // Sanitize the response from Gemini to ensure it's valid JSON
                const sanitizedJson = extractedJson.replace(/```json/g, '').replace(/```/g, '').trim();
                searchParams = JSON.parse(sanitizedJson);
            }
        } catch (e) {
            console.error("Failed to parse JSON from Gemini entity extraction:", extractedJson);
        }

        let queryContext = "the market";
        if (searchParams && (searchParams.symbols || searchParams.countries || searchParams.search)) {
             // Determine the context for the final prompt
            if (searchParams.symbols) queryContext = searchParams.symbols;
            else if (searchParams.countries === 'in') queryContext = "the Indian market";
            else if (searchParams.countries === 'us') queryContext = "the US market";
            else if (searchParams.search) queryContext = `news related to "${searchParams.search}"`;

            // Step 1b: Fetch news using the extracted parameters.
            const newsArticles = await fetchNews(searchParams, marketauxApiKey);

            if (newsArticles?.error === "missing_key") {
                 finalReply = "The news feature is not configured. The site owner needs to add a MARKETAUX_API_KEY to the Netlify environment variables to enable it.";
            } else if (newsArticles && newsArticles.length > 0) {
                // Step 2: Build the final analysis prompt for Gemini.
                const analysisPrompt = `
                    ## Persona & Rules (VERY IMPORTANT)
                    - **Your Persona:** You are TradeMentor, an expert AI market analyst.
                    - **Your Goal:** Analyze the provided news articles regarding ${queryContext} and summarize the overall sentiment and potential impact for a trader.
                    - **Tone & Style:** Authoritative, clear, and concise.

                    ## How to Answer (VERY IMPORTANT)
                    You MUST analyze the provided news articles. Structure your response precisely as follows:
                    1.  Start with a one-sentence summary of the most significant news affecting ${queryContext}.
                    2.  Create a bolded heading: **Overall Market Sentiment**.
                    3.  Under it, provide a **Sentiment:** (e.g., Cautiously Optimistic, Bearish, Neutral, Volatile) and a short paragraph explaining the key drivers behind this sentiment, citing themes from the news.
                    4.  Create a bolded heading: **Key Themes & Potential Impact**.
                    5.  Briefly list 2-3 key themes from the news (e.g., Inflation data, Tech sector earnings, Regulatory updates) and their potential impact on ${queryContext}.
                    6.  Create a bolded heading: **Mentor Tip**.
                    7.  Provide a short, actionable tip relevant to the current news and market conditions.

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
             // This case handles when "news" is in the query but no entities are extracted
             finalReply = "I see you're asking about news, but I couldn't identify a specific stock, market, or topic. Could you please be more specific? For example, ask 'any news on RELIANCE?' or 'what's the news for the Indian market?'.";
        }
    }

    // --- FALLBACK TO EXISTING TRADE/GENERAL ANALYSIS LOGIC ---
    if (!finalReply) { 
        console.log("[AI] No news query detected. Using general trade analysis prompt.");
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
