// You must have node-fetch installed in your project: npm install node-fetch
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

/**
 * Fetches news articles for a given symbol from the Marketaux API.
 * @param {string} symbols - The stock/crypto/forex symbol (e.g., 'AAPL,TSLA').
 * @param {string} apiKey - The Marketaux API key.
 * @returns {Promise<Array|null>} A promise that resolves to an array of news articles or null if an error occurs.
 */
async function fetchNews(symbols, apiKey) {
    if (!apiKey) {
        console.error("MARKETAUX_API_KEY environment variable is not set.");
        // Return a specific object to indicate the key is missing
        return { error: "missing_key" };
    }
    // Fetches the top 3 most recent, English-language articles for the given symbol
    const url = `https://api.marketaux.com/v1/news/all?symbols=${symbols}&filter_entities=true&language=en&limit=3&api_token=${apiKey}`;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`Marketaux API error: ${response.status} ${await response.text()}`);
            return null;
        }
        const data = await response.json();
        return data.data || []; // Return the array of articles
    } catch (error) {
        console.error("Error fetching news:", error);
        return null;
    }
}

exports.handler = async function (event) {
    // Standard security check to ensure only POST requests are processed
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const { question, trades, psychology } = JSON.parse(event.body);
    const geminiApiKey = process.env.GEMINI_API_KEY;
    const marketauxApiKey = process.env.MARKETAUX_API_KEY; // Your new Marketaux API key

    if (!geminiApiKey) {
        console.error("GEMINI_API_KEY environment variable not set.");
        return { statusCode: 500, body: JSON.stringify({ error: "Gemini API key is not configured." }) };
    }

    let prompt;
    let newsArticles = [];
    let symbolMatch = null;

    // --- REVISED NEWS ANALYSIS LOGIC ---
    // Check if the question contains the word "news" in any context.
    if (/\bnews\b/i.test(question)) {
        // Clean the question of punctuation and split it into words.
        const words = question.replace(/[?,.]/g, '').split(' ');
        const newsIndex = words.findIndex(word => word.toLowerCase() === 'news');

        // If "news" is found, look for a potential ticker symbol in the words that follow.
        if (newsIndex !== -1) {
            for (let i = newsIndex + 1; i < words.length; i++) {
                // A common format for a ticker is 2-10 uppercase letters. This is a robust way to find symbols.
                if (/^[A-Z]{2,10}$/.test(words[i])) {
                    symbolMatch = words[i];
                    break; // Found the first likely symbol, so stop looking.
                }
            }
        }
        
        if (symbolMatch) {
            console.log(`[NEWS] Detected news query for symbol: ${symbolMatch}`);
            newsArticles = await fetchNews(symbolMatch, marketauxApiKey);

            if (newsArticles?.error === "missing_key") {
                 // If the API key is missing, inform the user how to configure it.
                 prompt = `The user asked about news for ${symbolMatch}, but the Marketaux API key is missing. Please inform the user that the news feature is not configured and that they need to add their MARKETAUX_API_KEY to the Netlify environment variables to enable it.`;
            } else if (newsArticles && newsArticles.length > 0) {
                // If news is found, create a detailed prompt for Gemini to analyze it
                prompt = `
                    ## Persona & Rules (VERY IMPORTANT)
                    - **Your Persona:** You are TradeMentor, an expert AI trading coach.
                    - **Your Goal:** Analyze the provided news articles for a specific stock symbol (${symbolMatch}) and explain the potential market impact in a clear, structured way.
                    - **Tone & Style:** Be direct, insightful, and professional. Use simple, easy-to-understand language.

                    ## How to Answer (VERY IMPORTANT)
                    You MUST analyze the provided news articles and answer the user's question. Structure your response precisely as follows:
                    1.  Start with a brief, one-sentence summary of the most critical news headline.
                    2.  Create a bolded heading: **Potential Impact Analysis**.
                    3.  Under it, provide a **Sentiment:** (e.g., Bullish, Bearish, Neutral, Mixed) based on the overall tone of the news.
                    4.  Next, provide a **Probable Impact:** (e.g., High, Medium, Low) and write a short paragraph explaining *why* the news could affect the stock's price, mentioning specific details from the articles.
                    5.  Create a bolded heading: **Mentor Tip**.
                    6.  Under it, provide a short, actionable tip for a trader (e.g., "Given the positive earnings surprise, watch for a potential breakout above the key resistance level at $150," or "With the ongoing legal uncertainty, it might be wise to wait for more clarity before taking a new position.").
                    - **Do NOT use bullet points ('*' or '-') at the start of lines.**

                    ## User's Question
                    "${question}"

                    ## Recent News Articles for ${symbolMatch}
                    ${JSON.stringify(newsArticles, null, 2)}
                `;
            } else {
                // If no news is found for the symbol
                prompt = `The user asked for news about "${symbolMatch}", but I couldn't find any recent, relevant articles for that symbol using the Marketaux API. Please inform the user that no significant news was found and suggest they double-check the ticker symbol.`;
            }
        }
    }

    // --- EXISTING TRADE/GENERAL ANALYSIS LOGIC ---
    if (!prompt) { // If the prompt wasn't set by the news logic, use the original logic
        prompt = `
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
    }

    // The URL for the Google Gemini API
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${geminiApiKey}`;
    
    // The data payload we will send to the API
    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        safetySettings: [
            { "category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE" },
            { "category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_MEDIUM_AND_ABOVE" }
        ]
    };

    // The main logic to call the AI and handle the response
    try {
        const apiResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!apiResponse.ok) {
            const errorBody = await apiResponse.text();
            console.error("API Error:", errorBody);
            throw new Error(`API Error: ${apiResponse.status}`);
        }

        const result = await apiResponse.json();
        const reply = result.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't generate a response.";

        return {
            statusCode: 200,
            body: JSON.stringify({ reply: reply.trim() }),
        };

    } catch (error) {
        console.error("Function Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "An internal error occurred." }),
        };
    }
};
