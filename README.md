# DuoVeto

Two AIs review your code independently. One unified verdict.

**Live:** [duoveto.dev](https://duoveto.dev)

## What it does

Send your code, plan, or architecture decision. GPT-5.4 and o4-mini review it independently and in parallel with different personas. You get a unified adversarial report with consensus, disagreements, and a clear ship-or-block recommendation.

## Quick Start

```bash
curl -X POST https://duoveto.dev/api/review \
  -H "Content-Type: application/json" \
  -d '{
    "content": "function add(a, b) { return a + b; }",
    "type": "code"
  }'
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
    { "model": "gpt-5.4", "score": 8, "verdict": "approve", "issues": [...], "improvements": [...], "praise": [...] },
    { "model": "o4-mini", "score": 7, "verdict": "concerns", "issues": [...], "improvements": [...], "praise": [...] }
  ],
  "disagreements": ["Verdict split: gpt-5.4 says approve, o4-mini says concerns"],
  "unified_recommendation": "CAUTION: 2 high-severity issues. Address before shipping."
}
```

## Pricing

- **Free:** 10 reviews/day
- **Pro:** Coming soon

## License

MIT
