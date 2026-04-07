import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(_req: VercelRequest, res: VercelResponse): void {
  res.setHeader("Content-Type", "text/html");
  res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Adversarial Review API</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: #0a0a0a; color: #e5e5e5; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2rem; }
  .container { max-width: 720px; width: 100%; }
  h1 { font-size: 2.5rem; font-weight: 700; background: linear-gradient(135deg, #ff6b6b, #ffa500, #ff6b6b); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 0.5rem; }
  .tagline { color: #888; font-size: 1.1rem; margin-bottom: 2.5rem; }
  .card { background: #141414; border: 1px solid #262626; border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; }
  .card h2 { font-size: 1rem; color: #ffa500; margin-bottom: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
  pre { background: #1a1a1a; border: 1px solid #333; border-radius: 8px; padding: 1rem; overflow-x: auto; font-size: 0.85rem; line-height: 1.6; color: #ccc; }
  code { font-family: 'SF Mono', 'Fira Code', monospace; }
  .highlight { color: #ffa500; }
  .string { color: #98c379; }
  .comment { color: #666; }
  .models { display: flex; gap: 1rem; margin-top: 1rem; }
  .model { background: #1a1a1a; border: 1px solid #333; border-radius: 8px; padding: 0.75rem 1rem; flex: 1; text-align: center; }
  .model .name { font-weight: 600; color: #fff; }
  .model .role { color: #888; font-size: 0.85rem; }
  .badge { display: inline-block; background: #1a3a1a; color: #4ade80; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.8rem; font-weight: 500; }
  .badge.orange { background: #3a2a1a; color: #ffa500; }
  footer { margin-top: 2rem; color: #555; font-size: 0.85rem; }
  a { color: #ffa500; text-decoration: none; }
  a:hover { text-decoration: underline; }
</style>
</head>
<body>
<div class="container">
  <h1>Adversarial Review</h1>
  <p class="tagline">Multi-model AI code review. Two models. Zero mercy. One verdict.</p>

  <div class="card">
    <h2>How it works</h2>
    <p>Send your code, plan, or architecture decision. Claude and GPT review it independently and in parallel. You get a unified adversarial report with consensus, disagreements, and a clear recommendation.</p>
    <div class="models">
      <div class="model"><div class="name">Claude</div><div class="role">Reviewer 1</div></div>
      <div class="model"><div class="name">GPT</div><div class="role">Reviewer 2</div></div>
    </div>
  </div>

  <div class="card">
    <h2>Quick Start</h2>
    <pre><code><span class="comment"># Review some code</span>
curl -X POST https://adversarial-review.vercel.app/api/review \\
  -H <span class="string">"Content-Type: application/json"</span> \\
  -d <span class="string">'{
    "content": "function add(a, b) { return a + b; }",
    "type": "code"
  }'</span></code></pre>
  </div>

  <div class="card">
    <h2>API Reference</h2>
    <pre><code><span class="highlight">POST</span> /api/review

<span class="comment">// Request body</span>
{
  <span class="string">"content"</span>: <span class="string">"Your code or plan here"</span>,     <span class="comment">// required, 10-50k chars</span>
  <span class="string">"type"</span>: <span class="string">"code|plan|architecture|decision"</span>,  <span class="comment">// optional, default: code</span>
  <span class="string">"context"</span>: <span class="string">"Additional context"</span>              <span class="comment">// optional</span>
}

<span class="comment">// Response</span>
{
  <span class="string">"consensus"</span>: <span class="string">"approve|concerns|reject"</span>,
  <span class="string">"consensus_score"</span>: 7.5,
  <span class="string">"reviews"</span>: [
    { <span class="string">"model"</span>: <span class="string">"claude"</span>, <span class="string">"score"</span>: 8, <span class="string">"issues"</span>: [...], ... },
    { <span class="string">"model"</span>: <span class="string">"gpt"</span>, <span class="string">"score"</span>: 7, <span class="string">"issues"</span>: [...], ... }
  ],
  <span class="string">"disagreements"</span>: [...],
  <span class="string">"unified_recommendation"</span>: <span class="string">"APPROVE: Ship it."</span>
}</code></pre>
  </div>

  <div class="card">
    <h2>Pricing</h2>
    <p><span class="badge">Free</span> 10 reviews/day &nbsp; <span class="badge orange">Pro (coming soon)</span> Unlimited reviews</p>
  </div>

  <footer>
    Built by <a href="https://github.com/AdelElo13">AdelElo13</a>
  </footer>
</div>
</body>
</html>`,
`);
}
