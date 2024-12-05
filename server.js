// Import dependencies
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const app = express();
const port = 3000;

// Initialize Google Generative AI with your API key
const genAI = new GoogleGenerativeAI(''); // Replace with your actual API key
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// Use Express to handle JSON request body parsing
app.use(express.json());
app.post("/analyze", async (req, res) => {
  try {
    const { omset, biayaOperasional, produkUnggulan, jumlahProdukUnggulan, targetOmset } = req.body;

    const prompt = `
    MSME Data:
    - Monthly Revenue: Rp${omset}
    - Operational Costs: Rp${biayaOperasional}
    - Key Products: ${produkUnggulan.join(", ")}
    - Quantity of Key Products: ${jumlahProdukUnggulan}
    - Revenue Target (3 months): Rp${targetOmset}

    Provide an analysis and recommendations in the following JSON format:
    {
      "ProfitMargin": "Analysis of profit margin based on the data.",
      "GrowthPotential": "Analysis of growth potential.",
      "PriorityActionRecommendations": [
        "Step 1",
        "Step 2",
        "Step 3"
      ],
      "EstimatedCapital": "Estimated capital required.",
      "ImplementationTimeline": {
        "Month1": "Activities for month 1",
        "Month2": "Activities for month 2",
        "Month3": "Activities for month 3"
      }
    }
    `;

    // Call the Google Generative AI model
    const result = await model.generateContent(prompt);

    // Clean up the response to extract valid JSON
    const rawResponse = result.response.text();
    const cleanedResponse = rawResponse
      .replace(/```json/g, "") // Remove markdown JSON block start
      .replace(/```/g, "") // Remove markdown block end
      .trim();

    // Parse the cleaned JSON
    const jsonResponse = JSON.parse(cleanedResponse);

    // Send the parsed JSON response
    res.json(jsonResponse);
  } catch (error) {
    console.error("Error generating analysis:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});



// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
