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

### `POST /api/review` (Free)

Single round — both models review independently in parallel.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `content` | string | yes | Code or plan to review (10-50k chars) |
| `type` | string | no | `code`, `plan`, `architecture`, or `decision` |
| `context` | string | no | Additional context |

```json
{
  "consensus": "approve|concerns|reject",
  "consensus_score": 7.5,
  "reviews": [
    {
      "model": "codex (GPT-5.3)",
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

### `POST /api/review/deep` (Pro)

Iterative adversarial sparring — models respond to each other's feedback across multiple rounds until they converge.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `content` | string | yes | Code or plan to review (10-50k chars) |
| `type` | string | no | `code`, `plan`, `architecture`, or `decision` |
| `context` | string | no | Additional context |
| `api_key` | string | yes | Pro API key (`dv_pro_...`) |
| `rounds` | number | no | Max rounds (default 3, max 5) |

```bash
curl -X POST https://duoveto.dev/api/review/deep \
  -H "Content-Type: application/json" \
  -d '{
    "content": "your code here",
    "type": "code",
    "api_key": "dv_pro_...",
    "rounds": 3
  }'
```

```json
{
  "mode": "deep",
  "rounds_completed": 2,
  "consensus": "approve",
  "consensus_score": 8.0,
  "final_reviews": ["... last round's reviews ..."],
  "all_rounds": [
    { "round": 1, "codex": {"...": "independent review"}, "claude": {"...": "independent review"} },
    { "round": 2, "codex": {"...": "responds to claude"}, "claude": {"...": "responds to codex"} }
  ],
  "disagreements": [],
  "unified_recommendation": "APPROVE: Both reviewers agree this is solid. Ship it."
}
```

**How deep review works:**

1. **Round 1**: Both models review independently (same as free)
2. **Round 2+**: Each model sees the other's review and responds — agreeing, disagreeing with rebuttals, or raising new issues
3. **Early exit**: Stops when both models have the same verdict and scores within 2 points
4. **Max 5 rounds**: Presents remaining disagreements if no consensus

## Architecture

```
Free:
  Your code ──> Codex (GPT-5.3) ──┐
                                    ├──> Synthesize ──> Verdict
  Your code ──> Claude (Opus 4.6) ─┘

Pro (deep):
  Round 1: Independent parallel reviews
  Round 2: Each model responds to the other's review
  Round N: Iterate until consensus or max rounds
```

Both models use OAuth — zero API costs when self-hosted.

## License

MIT
