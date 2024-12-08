// Import dependencies
const express = require("express");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const app = express();
const port = 3000;
const cors = require('cors'); 

// Initialize Google Generative AI with your API key
const genAI = new GoogleGenerativeAI(""); // Replace with your actual API key
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

app.use(cors({
  credentials: true,
  origin: [
    'http://localhost:5173',
  ],
  methods: ['GET', 'POST'], // Specify allowed methods
  allowedHeaders: ['Content-Type', 'Authorization'] // Specify allowed headers
}));
// Use Express to handle JSON request body parsing
app.use(express.json());

let month1Data = null; // Store data from /analyze for use in /track

// Endpoint: /analyze
app.post("/analyze", async (req, res) => {
  try {
    const { latarbelakang, omset, biayaOperasional, produkUnggulan, targetOmset } = req.body;

    const prompt = `
    Business Analysis Request:
    {
      "latarbelakang bisnis": "${latarbelakang}",
      "omset": ${omset},
      "biayaOperasional": ${biayaOperasional},
      "produkUnggulan": [
        ${produkUnggulan.map((p) => `"${p}"`).join(", ")}
      ],
      "targetOmset": ${targetOmset}
    }

    Analyze the business and provide the response in the following JSON format:
    {
      "ProfitMargin": {
        "persen": "Percentage of profit margin based on the provided data",
        "cost": "Actual profit in currency"
      },
      "GrowthPotential": {
        "increase": "Estimated number of sales increase based on opportunities",
        "decrease": "Estimated number of sales decrease based on competition, seasonality, or other risks",
        "advice": "Actionable advice to achieve growth and mitigate risks"
      },
      "PriorityActionRecommendations": [
        "Step 1",
        "Step 2",
        "Step 3"
      ],
      "EstimatedCapital": "Capital required in currency",
      "ImplementationTimeline": {
        "Month1": "Activities for month 1",
        "Month2": "Activities for month 2",
        "Month3": "Activities for month 3 with milestone"
      }
    }
    `;

    const result = await model.generateContent(prompt);

    const rawResponse = result.response.text();
    const cleanedResponse = rawResponse
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const jsonResponse = JSON.parse(cleanedResponse);
    jsonResponse.ImplementationTimeline = {
      ...jsonResponse.ImplementationTimeline,
      milestones: {
        Month1: "Achieve research and setup goals",
        Month2: "Achieve 50% target omset",
        Month3: "Achieve 100% target omset",
      },
    };

    month1Data = { latarbelakang, omset, biayaOperasional, produkUnggulan, targetOmset }; // Save data for /track
    res.json(jsonResponse);
  } catch (error) {
    console.error("Error generating analysis:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Endpoint: /track
app.post("/track", async (req, res) => {
  if (!month1Data) {
    return res.status(400).json({ error: "Month 1 data not available. Please call /analyze first." });
  }

  const { omset: month2Omset, biayaOperasional: month2BiayaOperasional, produkUnggulan: month2ProdukUnggulan } = req.body;

  const { omset: month1Omset, biayaOperasional: month1BiayaOperasional, produkUnggulan: month1ProdukUnggulan, targetOmset } = month1Data;
  const month1Keuntungan = month1Omset - month1BiayaOperasional;
  const month2Keuntungan = month2Omset - month2BiayaOperasional;

  const calculateGap = (newVal, oldVal) => {
    const rupiah = newVal - oldVal;
    const persen = oldVal === 0 ? (newVal > 0 ? 100 : 0) : ((rupiah / oldVal) * 100).toFixed(2);
    return { persen: `${persen}%`, rupiah };
  };

  const produkComparison = month1ProdukUnggulan.map((item, index) => {
    const [namaProduk, month1Jumlah] = item.split(", ");
    const [, month2Jumlah] = month2ProdukUnggulan[index].split(", ");
    const gap = calculateGap(parseInt(month2Jumlah), parseInt(month1Jumlah));
    return {
      namaProduk,
      bulan1: parseInt(month1Jumlah),
      bulan2: parseInt(month2Jumlah),
      gap,
    };
  });

  const gapOmset = calculateGap(month2Omset, month1Omset);
  const gapBiayaOperasional = calculateGap(month2BiayaOperasional, month1BiayaOperasional);
  const gapKeuntungan = calculateGap(month2Keuntungan, month1Keuntungan);

  const targetAchievement = ((month2Omset / targetOmset) * 100).toFixed(2);

  // Generate advice and timeline using Gemini
  const prompt = `
  Business Analysis Update:
  The following is a product comparison for month 2 compared to month 1:
  ${JSON.stringify(produkComparison, null, 2)}

  Based on this comparison, provide:
  1. Updated advice for each product on whether to increase promotions, maintain strategies, or revise the approach.
  2. An updated implementation timeline for Month 2 and Month 3 with new milestones and activities.

  Respond in the following JSON format:
  {
    "updatedAdvice": [
      "Advice for product 1",
      "Advice for product 2",
      "Advice for product 3"
    ],
    "ImplementationTimeline": {
      "Month2": {
        "activities": ["Activity 1", "Activity 2", "Activity 3"],
        "milestone": "Milestone for Month 2"
      },
      "Month3": {
        "activities": ["Activity 1", "Activity 2", "Activity 3"],
        "milestone": "Milestone for Month 3"
      }
    }
  }
  `;

  try {
    const result = await model.generateContent(prompt);

    const rawResponse = result.response.text();
    const cleanedResponse = rawResponse
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const geminiResponse = JSON.parse(cleanedResponse);

    res.json({
      success: true,
      data: {
        gap: {
          omset: gapOmset,
          biayaOperasional: gapBiayaOperasional,
          keuntungan: gapKeuntungan,
        },
        targetAchievement: {
          persen: `${targetAchievement}%`,
          rupiah: targetOmset - month2Omset,
        },
        produkComparison,
        updatedAdvice: geminiResponse.updatedAdvice,
        ImplementationTimeline: geminiResponse.ImplementationTimeline,
      },
    });
  } catch (error) {
    console.error("Error generating advice and timeline:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


// Endpoint: /conclude
app.post("/conclude", async (req, res) => {
  try {
    if (!month1Data) {
      return res.status(400).json({ error: "Month 1 data not available. Please call /analyze first." });
    }

    // Data input dari bulan ke-3
    const { omset: month3Omset, biayaOperasional: month3BiayaOperasional, produkUnggulan: month3ProdukUnggulan } = req.body;

    // Data dari bulan ke-1 dan ke-2
    const { omset: month1Omset, biayaOperasional: month1BiayaOperasional, produkUnggulan: month1ProdukUnggulan, targetOmset } = month1Data;
    const { omset: month2Omset, biayaOperasional: month2BiayaOperasional, produkUnggulan: month2ProdukUnggulan } = req.body; // Replace with actual saved month 2 data.

    // Perhitungan total omset dan biaya
    const totalOmset = month1Omset + month2Omset + month3Omset;
    const totalBiaya = month1BiayaOperasional + month2BiayaOperasional + month3BiayaOperasional;
    const totalKeuntungan = totalOmset - totalBiaya;

    // Perhitungan pencapaian target
    const targetAchievement = ((totalOmset / targetOmset) * 100).toFixed(2);
    const targetTercapai = totalOmset >= targetOmset;

    // Perhitungan gap (Bulan 2 ke Bulan 3)
    const gapBulan2Ke3 = {
      omset: {
        persen: ((month3Omset - month2Omset) / month2Omset * 100).toFixed(2) + "%",
        rupiah: month3Omset - month2Omset,
      },
      biayaOperasional: {
        persen: ((month3BiayaOperasional - month2BiayaOperasional) / month2BiayaOperasional * 100).toFixed(2) + "%",
        rupiah: month3BiayaOperasional - month2BiayaOperasional,
      },
      keuntungan: {
        persen: ((month3Omset - month3BiayaOperasional - (month2Omset - month2BiayaOperasional)) / (month2Omset - month2BiayaOperasional) * 100).toFixed(2) + "%",
        rupiah: (month3Omset - month3BiayaOperasional) - (month2Omset - month2BiayaOperasional),
      },
    };

    // Perhitungan gap total (Bulan 1 ke Bulan 3)
    const gapTotalBulan1Ke3 = {
      omset: {
        persen: ((totalOmset - month1Omset) / month1Omset * 100).toFixed(2) + "%",
        rupiah: totalOmset - month1Omset,
      },
      biayaOperasional: {
        persen: ((totalBiaya - month1BiayaOperasional) / month1BiayaOperasional * 100).toFixed(2) + "%",
        rupiah: totalBiaya - month1BiayaOperasional,
      },
      keuntungan: {
        persen: ((totalKeuntungan - (month1Omset - month1BiayaOperasional)) / (month1Omset - month1BiayaOperasional) * 100).toFixed(2) + "%",
        rupiah: totalKeuntungan - (month1Omset - month1BiayaOperasional),
      },
    };

    // Analisis per produk
    const produkComparison = month1ProdukUnggulan.map((item, index) => {
      const [namaProduk, month1Jumlah] = item.split(", ");
      const [, month2Jumlah] = month2ProdukUnggulan[index].split(", ");
      const [, month3Jumlah] = month3ProdukUnggulan[index].split(", ");
      const totalJumlah = parseInt(month1Jumlah) + parseInt(month2Jumlah) + parseInt(month3Jumlah);
      return {
        namaProduk,
        bulan1: parseInt(month1Jumlah),
        bulan2: parseInt(month2Jumlah),
        bulan3: parseInt(month3Jumlah),
        total: totalJumlah,
      };
    });

    // Prompt untuk analisis dari Gemini
    const prompt = `
    Business Performance Summary:
    Total performance data:
    {
      "TotalOmset": ${totalOmset},
      "TotalBiaya": ${totalBiaya},
      "TotalKeuntungan": ${totalKeuntungan},
      "TargetAchievement": "${targetAchievement}%",
      "TargetTercapai": ${targetTercapai}
    }

    Product performance data:
    ${JSON.stringify(produkComparison, null, 2)}

    Gap analysis:
    - Bulan 2 ke Bulan 3: ${JSON.stringify(gapBulan2Ke3, null, 2)}
    - Total Bulan 1 ke Bulan 3: ${JSON.stringify(gapTotalBulan1Ke3, null, 2)}

    Based on the overall performance, provide:
    1. GrowthPotential for the upcoming months, including opportunities and risks.
    2. Estimated capital required for further growth.
    3. Actionable advice to sustain and enhance growth.

    Respond in the following JSON format:
    {
      "GrowthPotential": {
        "opportunities": "Opportunities for growth",
        "risks": "Potential risks and challenges",
        "advice": ["Advice 1", "Advice 2", "Advice 3"]
      },
      "EstimatedCapital": "Estimated capital in currency",
      "OverallConclusion": "General conclusion about the business performance"
    }
    `;

    // Meminta analisis dari Gemini
    const result = await model.generateContent(prompt);

    const rawResponse = result.response.text();
    const cleanedResponse = rawResponse
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const geminiResponse = JSON.parse(cleanedResponse);

    // Mengirimkan respons akhir
    res.json({
      success: true,
      summary: {
        totalOmset,
        totalBiaya,
        totalKeuntungan,
        targetAchievement,
        targetTercapai,
        produkComparison,
        gap: {
          bulan2Ke3: gapBulan2Ke3,
          totalBulan1Ke3: gapTotalBulan1Ke3,
        },
      },
      geminiAnalysis: geminiResponse,
    });
  } catch (error) {
    console.error("Error in /conclude endpoint:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});




// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
