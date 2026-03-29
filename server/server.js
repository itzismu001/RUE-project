require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression'); 
const morgan = require('morgan'); 
const rateLimit = require('express-rate-limit'); 
const NodeCache = require('node-cache');
const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');

const app = express();
app.use(helmet());
app.use(cors());
app.use(compression()); 
app.use(express.json());
app.use(morgan('dev'));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests. Please give the AI a short rest!' }
});
app.use('/api/', apiLimiter);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// FIXED: Changed to stable 1.5-flash backend model to stop the 500 crash
const MODEL_NAME = 'gemini-2.5-flash-lite'; 

// --- ENHANCED SCHEMA FOR WINNING THE HACKATHON ---
const educationalSchema = {
  type: SchemaType.OBJECT,
  properties: {
    answer_text: {
      type: SchemaType.STRING,
      description: "A clear, well-structured educational answer using markdown for formatting."
    },
    concepts: {
      type: SchemaType.ARRAY,
      description: "Key building blocks for deep understanding.",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          term: { type: SchemaType.STRING },
          difficulty: { 
            type: SchemaType.STRING, 
            enum: ["beginner", "intermediate", "advanced"],
            description: "Conceptual load of the term."
          },
          relevance_score: { 
            type: SchemaType.NUMBER, 
            description: "How essential this is to the core topic (1-10)."
          }
        },
        required: ["term", "difficulty", "relevance_score"]
      }
    }
  },
  required: ["answer_text", "concepts"]
};

const generativeModel = genAI.getGenerativeModel({
  model: MODEL_NAME,
  generationConfig: {
    responseMimeType: "application/json",
    responseSchema: educationalSchema,
    temperature: 0.2, // Lower temperature for more consistent "Teacher" logic
  }
});

const cache = new NodeCache({ stdTTL: 3600, maxKeys: 1000 });

async function generateWithRetry(prompt, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const result = await generativeModel.generateContent(prompt);
      const response = await result.response;
      const usageMetadata = response.usageMetadata;
      
      // ADDED: Strip markdown backticks just in case the API includes them
      let rawText = response.text();
      let cleanJson = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();

      // Added missing token variables so the UI Telemetry populates properly
      return {
        data: JSON.parse(cleanJson),
        usage: {
          prompt_tokens: usageMetadata?.promptTokenCount || 0,
          completion_tokens: usageMetadata?.candidatesTokenCount || 0,
          total_tokens: usageMetadata?.totalTokenCount || 0
        }
      };
    } catch (error) {
      if (i === retries) {
        console.error("🔥 GENERATION ERROR:", error); // ADDED: Will print the exact issue to terminal
        throw error;
      }
      await new Promise(res => setTimeout(res, 1000 * Math.pow(2, i)));
    }
  }
}

// --- ENDPOINTS ---

app.post('/api/ask', async (req, res) => {
  const { question } = req.body;
  if (!question) return res.status(400).json({ error: 'Question required' });

  // ADDED: Check cache before asking Gemini
  const cacheKey = `ask_${question.toLowerCase().trim()}`;
  if (cache.has(cacheKey)) {
    console.log("⚡ CACHE HIT for Question:", question);
    const cachedData = cache.get(cacheKey);
    return res.json({ ...cachedData, depth: 0, cache_hit: true });
  }

  try {
    // Removed old citation artifacts to prevent AI hallucinations
    const prompt = `
      You are an expert teacher.
      Question: "${question}"
      
      Task:
      1. Provide a comprehensive answer. Break it into short paragraphs.
      2. Identify 8-12 "Load-bearing" concepts. 
      Criteria for concepts:
      - Essential for true understanding.
      - Not common words like "is", "provides", or "system".
      - Assign difficulty based on how much prior knowledge is needed.
    `;
    
    const { data: aiData, usage } = await generateWithRetry(prompt);
    
    // ADDED: Save to cache for the next time
    cache.set(cacheKey, { ...aiData, usage });

    res.json({ ...aiData, usage, depth: 0, cache_hit: false });
  } catch (error) {
    console.error("🔥 ROUTE /ask ERROR:", error); // ADDED: Error logging
    res.status(500).json({ error: 'Failed to generate answer.' });
  }
});

app.post('/api/explain', async (req, res) => {
  const { term, depth = 1, contextQuestion } = req.body;

  // ADDED: Check cache before asking Gemini
  const cacheKey = `explain_${term.toLowerCase().trim()}_${depth}`;
  if (cache.has(cacheKey)) {
    console.log("⚡ CACHE HIT for Term:", term);
    const cachedData = cache.get(cacheKey);
    return res.json({ ...cachedData, depth, cache_hit: true });
  }

  try {
    let style = "Use simple metaphors.";
    if (depth > 3) style = "Explain like I'm 5. Avoid all technical jargon.";

    // Added ${style} into the prompt so the ELI5 feature actually triggers!
    const prompt = `
      Explain the concept: "${term}" 
      Context of original query: "${contextQuestion}"
      Recursive Depth: ${depth}
      Instruction: ${style}

      Task:
      1. Define simply and provide a concrete example.
      2. Extract 5-8 NEW sub-concepts found within THIS explanation to continue the recursion.
      3. Focus on "Building Blocks" - if the user understands these new terms, they will master "${term}".
    `;
    
    const { data: aiData, usage } = await generateWithRetry(prompt);
    
    // ADDED: Save to cache for the next time
    cache.set(cacheKey, { ...aiData, usage });

    res.json({ ...aiData, usage, depth, cache_hit: false });
  } catch (error) {
    console.error("🔥 ROUTE /explain ERROR:", error); // ADDED: Error logging
    res.status(500).json({ error: 'Failed to generate explanation.' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 RUE Engine running on port ${PORT}`));