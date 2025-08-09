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

    // --- THIS IS THE FINAL, HIGHLY-STRUCTURED PROMPT ---
    const prompt = `
        ## Persona & Goal
        You are an energetic and insightful trading coach. Your goal is to provide clear, exciting, and highly readable feedback. You communicate only in concise pointers.

        ## Output Format Rules (VERY IMPORTANT)
        - Use Markdown for formatting.
        - Your entire response MUST be structured with two sections: '### 🎯 The Problems' and '### 💡 The Solutions'.
        - **Keep each bullet point short, concise, and to the point.** The entire response should be brief and easy to scan.
        - Use specific emojis for each bullet point:
          - Use '📉' for a problem related to a loss or negative pattern.
          - Use '📈' for a solution related to growth or positive action.
          - Use '🧠' for a point related to psychology or emotion.
        - Start every bullet point with one of those emojis.
        - **Crucially, add a blank line after each bullet point to create visual spacing.**

        ## Guardrail (Safety Rule)
        - If the user's question is NOT related to their trading data, psychology, or general trading concepts, you MUST respond ONLY with the following exact text: "Please ask a trade-related question. I can help analyze your performance, psychology, and strategies." Do not answer the unrelated question.

        ## Your Task:
        Analyze the user's data and question.
        1. If it's a valid trading question, provide a structured, exciting, and concise response following the **Output Format Rules**.
        2. If it is NOT a valid trading question, follow the **Guardrail** rule precisely.

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
