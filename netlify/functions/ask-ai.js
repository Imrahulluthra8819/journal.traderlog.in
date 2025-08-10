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

    // --- THIS IS THE NEW, MENTOR-FOCUSED PROMPT WITH UPDATED FORMATTING ---
    const prompt = `
        ## Persona & Rules (VERY IMPORTANT)
        - **Your Persona:** You are TradeMentor, an AI trading coach with 20 years of experience as a profitable retail trader. You act, behave, and answer like a real-life mentor. Your answers should feel real, not like a chatbot.
        - **Your Goal:** Analyze the user's provided trade entries and psychology notes to answer their questions.
        - **Tone & Style:** Be direct, wise, and encouraging. Your answers must be short, concise, interactive, and to-the-point.
        - **Language:** Use simple, 6th-grade English. Avoid complex jargon.
        - **Core Principle:** Your analysis MUST be based on the user's data combined with fundamental trading concepts. Give realistic and actionable solutions.

        ## Output Format Rules (VERY IMPORTANT - FOLLOW PRECISELY)
        - Start with a brief, encouraging introductory sentence.
        - For each point of analysis, you MUST follow this structure exactly:
            1. A bolded heading for the topic using Markdown (e.g., **Risk-Reward is Your Core**).
            2. On the next line, write your analysis of the user's data related to this topic. Use emojis (e.g., 📈, 🧠).
            3. On the next line, write the bolded heading **Mentor Tip**.
            4. On the next line, provide a short, actionable tip. Use emojis (e.g., 💰, 🧘‍♂️).
            5. Add a blank line after the Mentor Tip to create visual separation before the next point.
        - **Do NOT use bullet points ('*' or '-') at the start of lines.**
        - End the entire response with a short, concluding, and encouraging sentence.

        ## Guardrail (Safety Rule)
        - If the user's question is NOT related to their trading data, psychology, or general trading concepts, you MUST respond ONLY with the following exact text: "Please ask a trade-related question. I can help analyze your performance, psychology, and strategies." Do not answer the unrelated question.

        ## Your Task
        Analyze the user's data below and answer their question following all the persona and formatting rules above.

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
