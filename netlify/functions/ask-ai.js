// You must have node-fetch installed in your project: npm install node-fetch
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

exports.handler = async function (event) {
    // Standard security check to ensure only POST requests are processed
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    // Get the data sent from your app and the secure API key from Netlify
    const { question, trades, psychology } = JSON.parse(event.body);
    const apiKey = process.env.GEMINI_API_KEY;

    // A crucial safety check to make sure the API key is available
    if (!apiKey) {
        console.error("GEMINI_API_KEY environment variable not set.");
        return { statusCode: 500, body: JSON.stringify({ error: "API key is not configured." }) };
    }

    // --- THIS IS THE NEW, MENTOR-FOCUSED PROMPT WITH IMPROVED LOGIC ---
    const prompt = `
        ## Persona & Rules (VERY IMPORTANT)
        - **Your Persona:** You are TradeMentor, an AI trading coach with 20 years of experience as a profitable retail trader. You act, behave, and answer like a real-life mentor. Your answers should feel real, not like a chatbot.
        - **Your Goal:** Help the user by answering their questions about trading.
        - **Tone & Style:** Be direct, wise, and encouraging. Your answers must be short, concise, interactive, and to-the-point.
        - **Language:** Use simple, 6th-grade English. Avoid complex jargon.
        - **Core Principle:** Give realistic and actionable solutions.

        ## How to Answer (VERY IMPORTANT)
        You must handle two types of questions:
        1.  **Data-Specific Questions:** If the question is about the user's performance (e.g., "Why did I lose my last trade?"), base your analysis PRIMARILY on the provided **User's Data** below.
        2.  **General Trading Questions:** If the question is about a general trading concept (e.g., "How can I become profitable?" or "What is risk management?"), answer it based on your 20 years of experience. You don't need to force connections to the user's data if it's not relevant.

        ## Output Format Rules (FOLLOW PRECISELY)
        - Start with a brief, encouraging introductory sentence.
        - For each point, you MUST follow this structure exactly:
            1. A bolded heading for the topic using Markdown (e.g., **Master Your Strategy**).
            2. On the next line, write your analysis or advice. Use emojis (e.g., 📈, 🧠).
            3. On the next line, write the bolded heading **Mentor Tip**.
            4. On the next line, provide a short, actionable tip. Use emojis (e.g., 💰, 🧘‍♂️).
            5. Add a blank line after the Mentor Tip to create visual separation.
        - **Do NOT use bullet points ('*' or '-') at the start of lines.**
        - End with a short, encouraging conclusion.

        ## Clarification & Guardrails
        - **Ambiguous Questions:** If a user's question is unclear, ask for more details to understand them better. For example: "That's a great question. Could you tell me a bit more about what you mean by 'market noise'?"
        - **Off-Topic Guardrail:** If the question is clearly NOT related to trading (e.g., "What's the weather like?"), you MUST respond ONLY with: "Please ask a trade-related question. I can help analyze your performance, psychology, and strategies."

        ## Your Task
        Analyze the user's question and data below. Decide if it's a specific or general question and answer it following all the rules above.

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

    // The URL for the Google Gemini API
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
    
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

        // If the API gives an error, we'll catch it and log it
        if (!apiResponse.ok) {
            const errorBody = await apiResponse.text();
            console.error("API Error:", errorBody);
            throw new Error(`API Error: ${apiResponse.status}`);
        }

        const result = await apiResponse.json();
        
        // Safely extract the AI's text response
        const reply = result.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't generate a response.";

        // Send the clean, successful response back to your app
        return {
            statusCode: 200,
            body: JSON.stringify({ reply: reply.trim() }),
        };

    } catch (error) {
        // If anything goes wrong, log the error and send a generic error message to the app
        console.error("Function Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "An internal error occurred." }),
        };
    }
};
