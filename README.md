# ResumeAI — AI-Powered Resume Analyzer

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.x-000000?style=flat&logo=express&logoColor=white)
![Claude](https://img.shields.io/badge/Anthropic-Claude-D97757?style=flat&logo=anthropic&logoColor=white)
![Chart.js](https://img.shields.io/badge/Chart.js-4.x-FF6384?style=flat&logo=chartdotjs&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue?style=flat)

A full-stack AI resume analyzer that gives instant, actionable feedback across five dimensions — built with Node.js, Express, and Anthropic's Claude API. The frontend streams results in real time via Server-Sent Events, progressively revealing each section as the AI finishes analyzing.

---

## What It Does

Upload a PDF or paste resume text, optionally specify a target job title, and get back:

- **Overall score** (0–100) with an animated SVG dial
- **5-dimension breakdown** — Skills Match, Experience Quality, Formatting, ATS Compatibility, Impact — displayed in a radar chart and bento metric cards
- **Role Match** — the best-fit job title the AI identifies
- **Bullet Point Rewriter** — side-by-side comparisons of weak bullets vs. AI-rewritten versions with copy buttons
- **Missing Keywords** — a tiered tag cloud (critical / recommended / optional)
- **Strengths & Improvements** — two-column chip layout
- **Export** — copy a markdown summary to clipboard or trigger a clean print for PDF

---

## Interesting Challenges Solved

**1. Streaming JSON over SSE from POST**
The Anthropic API streams text deltas. The backend pipes each delta as an SSE `data:` event; the frontend buffers the chunks, waits for `[DONE]`, then parses the accumulated JSON. This gives a live "thinking" feel without a multi-phase API.

**2. Progressive reveal without multiple round-trips**
All results arrive in one streamed JSON blob. The frontend staggered-reveals each section using CSS opacity/transform transitions timed off a single parse call — no skeleton loaders needed, no layout shift.

**3. PDF as base64 document source**
Multer captures the PDF buffer in memory; the backend converts it to base64 and sends it to Claude as `{ type: "document", source: { type: "base64", media_type: "application/pdf" } }` — Claude's native PDF understanding rather than text extraction.

**4. Radar chart + animated dial with vanilla Chart.js**
No React, no component library. The radar chart and SVG dial are driven by pure JavaScript against Chart.js 4 and raw SVG `stroke-dashoffset` animation.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend runtime | Node.js 18+ |
| HTTP framework | Express 4 |
| AI model | Anthropic Claude (claude-sonnet-4-6) |
| File upload | Multer (memory storage) |
| Rate limiting | express-rate-limit |
| Streaming | Server-Sent Events (SSE) |
| Frontend charts | Chart.js 4 |
| Icons | Lucide (CDN) |
| Fonts | Google Fonts — Syne + Inter |
| Styling | Vanilla CSS with custom properties |

---

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Create environment file
cp .env.example .env

# 3. Add your Anthropic API key to .env
#    ANTHROPIC_API_KEY=sk-ant-...

# 4. Start the server
node server.js

# 5. Open in browser
open http://localhost:3000
```

Requires Node.js 18 or later.

---

## Project Structure

```
resume-analyzer/
├── server.js          # Express backend — multer, SSE, Anthropic API
├── public/
│   ├── index.html     # Single-file frontend — all CSS and JS inline
│   └── 404.html       # Custom 404 page
├── .env               # Your API key (git-ignored)
├── .env.example       # Template
└── package.json
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key — get one at console.anthropic.com |
| `PORT` | Server port (default: 3000) |

---

## Rate Limiting

The `/api/analyze` endpoint is rate-limited to **10 requests per IP per hour** using `express-rate-limit`. Adjust `max` in `server.js` as needed.

---

## License

MIT
