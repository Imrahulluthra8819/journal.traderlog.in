// This line imports the 'node-fetch' library, which is needed for making API calls in a Node.js environment like Netlify Functions.
// You must have it installed in your project by running `npm install node-fetch`.
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// This is the main function that Netlify will run when your frontend calls it.
exports.handler = async function (event) {
    // Security check: Only allow POST requests.
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    // Securely get the data from the frontend and your API key from Netlify's environment variables.
    const { question, trades, psychology } = JSON.parse(event.body);
    const apiKey = process.env.GEMINI_API_KEY;

    // Safety check: Ensure the API key is set in your Netlify dashboard.
    if (!apiKey) {
        console.error("GEMINI_API_KEY is not set in environment variables.");
        return { statusCode: 500, body: JSON.stringify({ error: "API key is not configured." }) };
    }

    // This is the detailed "prompt" that tells the AI how to behave and what to do.
    // It's the most important part for getting high-quality, relevant answers.
    const prompt = `
        ## Persona & Goal
        You are an expert trading coach and data analyst. Your primary goal is to help a trader reflect on their performance by connecting their trade data and psychological entries to fundamental trading rules and concepts. You are a mentor. Do not just state data; interpret it.

        ## Core Trading Concepts & Rules (Your Knowledge Base)
        You must frame your analysis using these core principles:
        1.  **Risk Management:** Is the trader cutting losses short? Is their Risk:Reward ratio healthy (ideally > 1:1.5)? Are they risking a small percentage of their capital?
        2.  **Emotional Discipline:** Look for signs of "FOMO" (Fear Of Missing Out), "Revenge Trading" (entering a new trade right after a loss), "Greed" (holding a winner too long), or "Fear" (exiting a winning trade too early).
        3.  **Strategy Adherence:** Does the trader mention deviating from their plan? Do they follow their chosen strategy (e.g., "Breakout + VWAP")?
        4.  **A+ Setups:** Is the trader waiting for high-quality setups, or are they over-trading on low-quality signals? High confidence and multiple confluence factors often indicate an A+ setup.
        5.  **Market Context:** Does the trader acknowledge the overall market environment (e.g., trending, sideways)? Trading against a strong trend is difficult.
        6.  **Psychological State:** How does sleep, stress, or pre-trade emotion correlate with P&L?

        ## Your Task:
        Given the user's trade data and psychology notes, analyze their question and provide a two-part answer:
        1.  **The Reason (Diagnosis):** Clearly explain the likely reason behind their trading outcome by referencing specific trades from their data and linking it to one or more of the **Core Trading Concepts** above.
        2.  **The Solution (Actionable Advice):** Provide a concrete, actionable suggestion for improvement or a reflective question that encourages them to think deeper.

        ---
        ## User's Data

        **Recent Trades:**
        ${JSON.stringify(trades, null, 2)}

        **Recent Psychology/Confidence Entries:**
        ${JSON.stringify(psychology, null, 2)}
        ---

        ## User's Question
        "${question}"

        ## Your Expert Analysis (Reason & Solution):
    `;

    // Set up the API call to Google Gemini
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        safetySettings: [ // Basic safety filters
            { "category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE" },
            { "category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_MEDIUM_AND_ABOVE" }
        ]
    };

    // Try to make the API call and handle any errors
    try {
        const apiResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        // If the API returns an error, handle it gracefully
        if (!apiResponse.ok) {
            const errorBody = await apiResponse.text();
            console.error("API Error:", errorBody);
            throw new Error(`API Error: ${apiResponse.status}`);
        }

        const result = await apiResponse.json();
        
        // Extract the text from the AI's response
        const reply = result.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't generate a response at this moment.";

        // Send the AI's clean response back to the frontend
        return {
            statusCode: 200,
            body: JSON.stringify({ reply: reply.trim() }),
        };

    } catch (error) {
        console.error("Function Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "An internal error occurred while contacting the AI." }),
        };
    }
};
