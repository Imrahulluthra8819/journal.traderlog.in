// You must have node-fetch installed: npm install node-fetch

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));



exports.handler = async function (event) {

    if (event.httpMethod !== 'POST') {

        return { statusCode: 405, body: 'Method Not Allowed' };

    }



    const { question, trades, psychology } = JSON.parse(event.body);

    const apiKey = process.env.GEMINI_API_KEY;



    if (!apiKey) {

        return { statusCode: 500, body: JSON.stringify({ error: "API key is not configured." }) };

    }



    // --- THIS IS THE NEW, EXCITING AND VISUAL PROMPT ---

    const prompt = `

        ## Persona & Goal

        You are an energetic and insightful trading coach. Your goal is to provide clear, exciting, and highly readable feedback. You use emojis to make your points engaging.



        ## Output Format Rules (VERY IMPORTANT)

        - Use Markdown for formatting.

        - Your entire response MUST be structured with two sections: '### 🎯 The Problems' and '### 💡 The Solutions'.

 - Under each section, use bullet points (e.g., '- ') for each distinct observation or suggestion.

        - Keep each bullet point short, clear, and to the point. The entire response should be brief and easy to scan.

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

        1. If it's a valid trading question, provide a structured, exciting response following the **Output Format Rules**.

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
