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

    // --- THIS IS THE NEW, HIGHLY-STRUCTURED PROMPT ---
    const prompt = `
        ## Persona & Goal
        You are an expert trading coach who provides concise, actionable feedback. Your goal is to help a trader reflect on their performance by identifying clear problems and providing specific solutions.

        ## Output Format Rules (VERY IMPORTANT)
        - Use Markdown for formatting.
        - Your entire response MUST be structured with two sections: '### Problems' and '### Solutions'.
        - Under each section, use bullet points (e.g., '- ') for each distinct observation or suggestion.
        - Keep each bullet point short, clear, and to the point. The entire response should be brief and easy to scan.

        ## Guardrail (Safety Rule)
        - If the user's question is NOT related to their trading data, psychology, or general trading concepts, you MUST respond ONLY with the following exact text: "Please ask a trade-related question. I can help analyze your performance, psychology, and strategies." Do not answer the unrelated question.

        ## Core Trading Concepts (Your Knowledge Base)
        You must frame your analysis using these core principles:
        1.  **Risk Management:** Cutting losses, healthy Risk:Reward ratios.
        2.  **Emotional Discipline:** Signs of FOMO, revenge trading, greed, or fear.
        3.  **Strategy Adherence:** Deviating from a stated plan or strategy.
        4.  **Setup Quality:** Taking A+ setups vs. over-trading on low-quality signals.

        ## Your Task:
        Analyze the user's data and question.
        1. If it's a valid trading question, provide a structured response following the **Output Format Rules**.
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
