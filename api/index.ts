import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(_req: VercelRequest, res: VercelResponse): void {
  res.setHeader("Content-Type", "text/html");
  res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>DuoVeto — Two AIs. One Verdict.</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: #0a0a0a; color: #e5e5e5; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2rem; }
  .container { max-width: 720px; width: 100%; }
  .logo { font-size: 3rem; font-weight: 800; letter-spacing: -0.02em; margin-bottom: 0.5rem; }
  .logo .duo { background: linear-gradient(135deg, #6366f1, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  .logo .veto { background: linear-gradient(135deg, #f43f5e, #ef4444); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  .tagline { color: #888; font-size: 1.15rem; margin-bottom: 2.5rem; }
  .card { background: #141414; border: 1px solid #262626; border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; }
  .card h2 { font-size: 1rem; color: #8b5cf6; margin-bottom: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
  p { line-height: 1.6; }
  pre { background: #1a1a1a; border: 1px solid #333; border-radius: 8px; padding: 1rem; overflow-x: auto; font-size: 0.85rem; line-height: 1.6; color: #ccc; }
  code { font-family: 'SF Mono', 'Fira Code', monospace; }
  .highlight { color: #8b5cf6; }
  .string { color: #98c379; }
  .comment { color: #666; }
  .models { display: flex; gap: 1rem; margin-top: 1rem; }
  .model { background: #1a1a1a; border: 1px solid #333; border-radius: 8px; padding: 0.75rem 1rem; flex: 1; text-align: center; }
  .model .name { font-weight: 600; color: #fff; }
  .model .provider { color: #8b5cf6; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem; }
  .model .role { color: #888; font-size: 0.85rem; }
  .badge { display: inline-block; background: #1a1a3a; color: #818cf8; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.8rem; font-weight: 500; }
  .badge.pro { background: #3a1a2a; color: #f43f5e; }
  .flow { display: flex; align-items: center; justify-content: center; gap: 0.75rem; margin: 1.5rem 0; font-size: 0.95rem; flex-wrap: wrap; }
  .flow .step { background: #1a1a2a; border: 1px solid #333; border-radius: 8px; padding: 0.5rem 1rem; }
  .flow .arrow { color: #555; }
  .versus { display: flex; align-items: center; justify-content: center; gap: 1.5rem; margin: 1.5rem 0; }
  .versus .vs { color: #f43f5e; font-weight: 800; font-size: 1.2rem; }
  .feature-list { list-style: none; padding: 0; margin: 0.75rem 0; }
  .feature-list li { padding: 0.3rem 0; color: #bbb; }
  .feature-list li::before { content: "\\2713 "; color: #4ade80; margin-right: 0.5rem; }
  footer { margin-top: 2rem; color: #555; font-size: 0.85rem; }
  a { color: #8b5cf6; text-decoration: none; }
  a:hover { text-decoration: underline; }
</style>
</head>
<body>
<div class="container">
  <div class="logo"><span class="duo">Duo</span><span class="veto">Veto</span></div>
  <p class="tagline">Two AI companies review your code. One unified verdict.</p>

  <div class="card">
    <h2>How it works</h2>
    <p>Send your code, plan, or architecture decision. OpenAI and Anthropic review it independently and in parallel with different perspectives. You get a unified adversarial report with consensus, disagreements, and a clear ship-or-block recommendation.</p>
    <div class="flow">
      <div class="step">Your code</div>
      <div class="arrow">&rarr;</div>
      <div class="step">OpenAI</div>
      <div class="arrow">vs</div>
      <div class="step">Anthropic</div>
      <div class="arrow">&rarr;</div>
      <div class="step">Verdict</div>
    </div>
    <div class="models">
      <div class="model">
        <div class="provider">OpenAI</div>
        <div class="name">Codex (GPT-5)</div>
        <div class="role">Security &amp; correctness</div>
      </div>
      <div class="model">
        <div class="provider">Anthropic</div>
        <div class="name">Claude (Opus 4.6)</div>
        <div class="role">Architecture &amp; tradeoffs</div>
      </div>
    </div>
  </div>

  <div class="card">
    <h2>Why two companies?</h2>
    <p>Single-model reviews have blind spots. Models from the same company share training biases. DuoVeto uses models from different AI companies to get genuinely independent perspectives &mdash; like getting a second opinion from a different doctor.</p>
    <ul class="feature-list">
      <li>Different training data = different blind spots caught</li>
      <li>Different safety approaches = more thorough security review</li>
      <li>Disagreements between models highlight the gray areas</li>
      <li>Consensus means the code is genuinely solid</li>
    </ul>
  </div>

  <div class="card">
    <h2>Quick Start</h2>
    <pre><code><span class="comment"># Review some code</span>
curl -X POST https://duoveto.dev/api/review \\
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
    { <span class="string">"model"</span>: <span class="string">"codex (GPT-5)"</span>, <span class="string">"score"</span>: 8, <span class="string">"issues"</span>: [...] },
    { <span class="string">"model"</span>: <span class="string">"claude (Opus 4.6)"</span>, <span class="string">"score"</span>: 7, <span class="string">"issues"</span>: [...] }
  ],
  <span class="string">"disagreements"</span>: [...],
  <span class="string">"unified_recommendation"</span>: <span class="string">"APPROVE: Ship it."</span>
}</code></pre>
  </div>

  <div class="card">
    <h2>Pricing</h2>
    <p><span class="badge">Free</span> 10 reviews/day &nbsp; <span class="badge pro">Pro (coming soon)</span> Unlimited reviews</p>
  </div>

  <footer>
    <a href="https://github.com/AdelElo13/duoveto">GitHub</a> &middot; Built by <a href="https://github.com/AdelElo13">AdelElo13</a>
  </footer>
</div>
</body>
</html>`);
}
