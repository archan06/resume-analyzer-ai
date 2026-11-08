require('dotenv').config();
const express    = require('express');
const multer     = require('multer');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');
const Anthropic  = require('@anthropic-ai/sdk');
const path       = require('path');

const app    = express();
const PORT   = process.env.PORT || 3000;
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Rate limiting: 10 req / IP / hour ────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again in an hour.' }
});
app.use('/api/', limiter);

// ── Multer: memory storage, PDF only, 5 MB max ───────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are accepted.'));
    }
  }
});

// ── Static files ─────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── POST /api/analyze ─────────────────────────────────────────────────────────
app.post('/api/analyze', upload.single('resume'), async (req, res) => {
  const file     = req.file;
  const text     = (req.body.text || '').trim();
  const jobTitle = (req.body.jobTitle || '').trim();

  if (!file && !text) {
    return res.status(400).json({ error: 'Provide a PDF file or resume text.' });
  }

  // ── System prompt ───────────────────────────────────────────────────────────
  const roleClause = jobTitle
    ? `\n\nTarget role: "${jobTitle}". Tailor every score, keyword, and suggestion specifically to this role.`
    : '';

  const systemPrompt = `You are an expert resume analyst and senior career coach with deep knowledge of ATS systems, hiring practices, and industry-specific expectations. Analyze the provided resume and return ONLY valid JSON — no markdown code fences, no explanation text, no commentary before or after. Return exactly this JSON shape:

{
  "overall": <integer 0–100>,
  "role_match": "<best-fit job title for this resume>",
  "scores": {
    "skills":     { "score": <0–100>, "bullets": ["<concise observation>", "<concise observation>"] },
    "experience": { "score": <0–100>, "bullets": ["<concise observation>", "<concise observation>"] },
    "formatting": { "score": <0–100>, "bullets": ["<concise observation>", "<concise observation>"] },
    "ats":        { "score": <0–100>, "bullets": ["<concise observation>", "<concise observation>"] },
    "impact":     { "score": <0–100>, "bullets": ["<concise observation>", "<concise observation>"] }
  },
  "strengths":    ["<specific strength>", "<specific strength>", "<specific strength>"],
  "improvements": ["<actionable improvement>", "<actionable improvement>", "<actionable improvement>"],
  "missing_keywords": ["<keyword>", "<keyword>", "<keyword>", "<keyword>", "<keyword>", "<keyword>", "<keyword>"],
  "rewrite_suggestions": [
    { "original": "<weak bullet copied verbatim from the resume>", "improved": "<rewritten version with strong action verb + metric + outcome>" },
    { "original": "<weak bullet copied verbatim from the resume>", "improved": "<rewritten version with strong action verb + metric + outcome>" }
  ],
  "one_liner": "<one direct, specific sentence verdict — no filler words like 'overall' or 'in summary'>"
}

Score dimension definitions:
- skills: relevance and depth of listed technical and soft skills vs. market demand
- experience: quality, recency, and relevance of work history entries
- formatting: readability, visual hierarchy, section structure, appropriate length
- ats: ATS-friendliness — clean formatting, standard headings, keyword density, no tables/columns that break parsers
- impact: use of metrics, quantified achievements, and outcome-focused language${roleClause}`;

  // ── Build message content ───────────────────────────────────────────────────
  let userContent;
  if (file) {
    const base64Data = file.buffer.toString('base64');
    userContent = [
      {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: base64Data }
      },
      { type: 'text', text: 'Analyze this resume and return the JSON analysis.' }
    ];
  } else {
    userContent = `Analyze this resume and return the JSON analysis:\n\n${text}`;
  }

  // ── SSE headers ─────────────────────────────────────────────────────────────
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  try {
    const stream = client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }]
    });

    stream.on('text', (chunk) => {
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    });

    stream.on('error', (err) => {
      console.error('Stream error:', err.message);
      try { res.write('data: [ERROR]\n\n'); res.end(); } catch {}
    });

    await stream.finalMessage();
    res.write('data: [DONE]\n\n');
    res.end();

  } catch (err) {
    console.error('Anthropic API error:', err.message);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'AI analysis failed. Check your ANTHROPIC_API_KEY.' });
    }
    try { res.write('data: [ERROR]\n\n'); res.end(); } catch {}
  }
});

// ── Multer + general error handler ───────────────────────────────────────────
app.use((err, _req, res, _next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'That file is too large. The limit is 5 MB.' });
  }
  if (err.message === 'Only PDF files are accepted.') {
    return res.status(400).json({ error: err.message });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

// ── 404 catch-all (non-API) ──────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  ResumeAI ⚡ http://localhost:${PORT}\n`);
});
