# DuoVeto

Two AI companies review your code. One unified verdict.

**Live:** [duoveto.dev](https://duoveto.dev)

## What it does

Send your code, plan, or architecture decision. OpenAI (Codex/GPT-5) and Anthropic (Claude Opus 4.6) review it independently and in parallel with different personas. You get a unified adversarial report with consensus, disagreements, and a clear ship-or-block recommendation.

### Why two companies?

Single-model reviews have blind spots. Models from the same company share training biases. DuoVeto uses models from different AI companies to get genuinely independent perspectives — like getting a second opinion from a different doctor.

## Quick Start

```bash
curl -X POST https://duoveto.dev/api/review \
  -H "Content-Type: application/json" \
  -d '{
    "content": "function add(a, b) { return a + b; }",
    "type": "code"
  }'
```

## Self-host

DuoVeto runs locally using Codex CLI and Claude Code CLI — both authenticate via OAuth, so there are zero API costs.

### Prerequisites

- [Codex CLI](https://github.com/openai/codex) (`npm i -g @openai/codex`) — login with `codex login`
- [Claude Code](https://claude.ai/code) — already authenticated via OAuth
- Node.js 18+

### Run

```bash
git clone https://github.com/AdelElo13/duoveto.git
cd duoveto
npm install
npx tsx src/server.ts
```

Server starts on `http://localhost:3200`.

### Run with PM2 (24/7)

```bash
pm2 start "npx tsx src/server.ts" --name duoveto
pm2 save
```

## API

**`POST /api/review`**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `content` | string | yes | Code or plan to review (10-50k chars) |
| `type` | string | no | `code`, `plan`, `architecture`, or `decision` |
| `context` | string | no | Additional context |

**Response:**

```json
{
  "consensus": "approve|concerns|reject",
  "consensus_score": 7.5,
  "reviews": [
    {
      "model": "codex (GPT-5)",
      "score": 8,
      "verdict": "approve",
      "issues": [{"severity": "high", "description": "..."}],
      "improvements": ["..."],
      "praise": ["..."]
    },
    {
      "model": "claude (Opus 4.6)",
      "score": 7,
      "verdict": "concerns",
      "issues": [{"severity": "medium", "description": "..."}],
      "improvements": ["..."],
      "praise": ["..."]
    }
  ],
  "disagreements": ["Verdict split: codex says approve, claude says concerns"],
  "unified_recommendation": "CAUTION: 2 high-severity issues. Address before shipping."
}
```

## Architecture

```
Your code ──> Codex CLI (OpenAI, GPT-5 via OAuth) ──┐
                                                      ├──> Synthesize ──> Verdict
Your code ──> Claude Code CLI (Anthropic, Opus via OAuth) ─┘
```

Both models run in parallel. Both use OAuth — zero API costs.

## License

MIT
