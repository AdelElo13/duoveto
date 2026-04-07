import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(_req: VercelRequest, res: VercelResponse): void {
  res.setHeader("Content-Type", "text/html");
  res.status(200).send(HTML);
}

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>DuoVeto — Two AIs. One Verdict.</title>
<meta name="description" content="Two AI models review your code independently. Get a unified adversarial verdict with disagreements highlighted.">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: #0a0a0a; color: #e5e5e5; min-height: 100vh; padding: 2rem 1rem; }
  .container { max-width: 800px; margin: 0 auto; }
  .logo { font-size: 2.8rem; font-weight: 800; letter-spacing: -0.02em; margin-bottom: 0.4rem; text-align: center; }
  .logo .duo { background: linear-gradient(135deg, #6366f1, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  .logo .veto { background: linear-gradient(135deg, #f43f5e, #ef4444); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  .tagline { color: #888; font-size: 1.05rem; margin-bottom: 2rem; text-align: center; }
  .card { background: #141414; border: 1px solid #262626; border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; }
  .card h2 { font-size: 0.85rem; color: #8b5cf6; margin-bottom: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; }
  textarea { width: 100%; min-height: 200px; background: #0d0d0d; border: 1px solid #333; border-radius: 8px; padding: 1rem; font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace; font-size: 0.88rem; color: #e5e5e5; resize: vertical; outline: none; transition: border-color 0.2s; line-height: 1.5; }
  textarea:focus { border-color: #8b5cf6; }
  textarea::placeholder { color: #444; }
  .form-row { display: flex; gap: 0.75rem; margin-top: 1rem; align-items: center; flex-wrap: wrap; }
  select { background: #1a1a1a; border: 1px solid #333; border-radius: 8px; padding: 0.5rem 0.75rem; color: #ccc; font-size: 0.85rem; outline: none; cursor: pointer; }
  .btn { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; border: none; border-radius: 8px; padding: 0.6rem 1.8rem; font-size: 0.95rem; font-weight: 600; cursor: pointer; transition: opacity 0.2s, transform 0.1s; }
  .btn:hover { opacity: 0.9; }
  .btn:active { transform: scale(0.98); }
  .btn:disabled { opacity: 0.35; cursor: not-allowed; }
  .btn-sm { background: #1a1a2a; border: 1px solid #333; color: #bbb; padding: 0.35rem 0.75rem; font-size: 0.8rem; border-radius: 6px; cursor: pointer; font-weight: 500; }
  .btn-sm:hover { background: #262640; color: #fff; }
  .spacer { flex: 1; }
  #status { color: #888; font-size: 0.85rem; }
  #result { display: none; }
  .consensus-bar { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; }
  .consensus-badge { padding: 0.3rem 0.8rem; border-radius: 6px; font-weight: 700; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.03em; }
  .consensus-badge.approve { background: #1a3a1a; color: #4ade80; }
  .consensus-badge.concerns { background: #3a3a1a; color: #facc15; }
  .consensus-badge.reject { background: #3a1a1a; color: #f43f5e; }
  .score-big { font-size: 1.8rem; font-weight: 800; color: #fff; }
  .recommendation { background: #1a1a2a; border-left: 3px solid #8b5cf6; border-radius: 0 8px 8px 0; padding: 0.75rem 1rem; margin-bottom: 1rem; font-size: 0.95rem; }
  .review-card { background: #111; border: 1px solid #222; border-radius: 8px; padding: 1rem; margin-bottom: 0.75rem; }
  .review-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
  .review-model { font-weight: 700; color: #fff; font-size: 0.95rem; }
  .review-score { font-weight: 700; font-size: 1rem; }
  .issue { padding: 0.25rem 0; display: flex; gap: 0.5rem; align-items: flex-start; }
  .sev { font-size: 0.7rem; font-weight: 600; padding: 0.1rem 0.35rem; border-radius: 3px; text-transform: uppercase; flex-shrink: 0; margin-top: 0.1rem; }
  .sev.critical { background: #3a1a1a; color: #f43f5e; }
  .sev.high { background: #3a2a1a; color: #fb923c; }
  .sev.medium { background: #3a3a1a; color: #facc15; }
  .sev.low { background: #1a2a1a; color: #86efac; }
  .issue-text { color: #bbb; font-size: 0.88rem; line-height: 1.4; }
  .sect { color: #555; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; margin: 0.6rem 0 0.2rem; }
  .item { color: #999; font-size: 0.85rem; padding: 0.1rem 0; }
  .item.good::before { content: "\\2713 "; color: #4ade80; }
  .item.fix::before { content: "\\2192 "; color: #818cf8; }
  .disagree { color: #facc15; font-size: 0.85rem; padding: 0.15rem 0; }
  .disagree::before { content: "\\26A0\\FE0F "; }
  .models-row { display: flex; gap: 0.75rem; margin-top: 0.75rem; }
  .mi { background: #111; border: 1px solid #262626; border-radius: 8px; padding: 0.5rem 0.75rem; flex: 1; text-align: center; }
  .mi .prov { color: #8b5cf6; font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.06em; }
  .mi .mname { font-weight: 600; color: #fff; font-size: 0.85rem; }
  .mi .mrole { color: #666; font-size: 0.75rem; }
  .copy-toast { position: fixed; bottom: 2rem; left: 50%; transform: translateX(-50%); background: #4ade80; color: #000; padding: 0.5rem 1.5rem; border-radius: 8px; font-weight: 600; font-size: 0.85rem; opacity: 0; transition: opacity 0.3s; pointer-events: none; z-index: 100; }
  .copy-toast.show { opacity: 1; }
  footer { margin-top: 2rem; color: #444; font-size: 0.8rem; text-align: center; }
  a { color: #8b5cf6; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .feature-list { list-style: none; padding: 0; }
  .feature-list li { padding: 0.2rem 0; color: #999; font-size: 0.88rem; }
  .feature-list li::before { content: "\\2713 "; color: #4ade80; margin-right: 0.4rem; }
  @media (max-width: 600px) { .form-row { flex-direction: column; align-items: stretch; } .models-row { flex-direction: column; } .consensus-bar { flex-wrap: wrap; } }
</style>
</head>
<body>
<div class="container">
  <div class="logo"><span class="duo">Duo</span><span class="veto">Veto</span></div>
  <p class="tagline">Two AI models review your code. One unified verdict.</p>

  <div class="card" id="editor">
    <h2>Review your code</h2>
    <textarea id="code" placeholder="Paste your code here...

Example:
async function deleteUser(userId) {
  await db.query(\`DELETE FROM users WHERE id = \${userId}\`);
  return { success: true };
}"></textarea>
    <div class="form-row">
      <select id="type">
        <option value="code">Code review</option>
        <option value="plan">Plan review</option>
        <option value="architecture">Architecture review</option>
        <option value="decision">Decision review</option>
      </select>
      <button class="btn-sm" onclick="loadSample()">Try sample</button>
      <span class="spacer"></span>
      <span id="status"></span>
      <button class="btn" id="reviewBtn" onclick="submitReview()">Review</button>
    </div>
  </div>

  <div id="result"></div>

  <div class="card">
    <h2>How it works</h2>
    <p style="color:#bbb;font-size:0.9rem;line-height:1.6">Two AI models with different specializations review your code independently and in parallel. You get issues found by each, where they disagree, and a unified ship-or-block recommendation.</p>
    <div class="models-row">
      <div class="mi"><div class="prov">Reviewer 1</div><div class="mname">GPT-5.4</div><div class="mrole">Security &amp; correctness</div></div>
      <div class="mi"><div class="prov">Reviewer 2</div><div class="mname">o4-mini</div><div class="mrole">Architecture &amp; tradeoffs</div></div>
    </div>
  </div>

  <div class="card">
    <h2>Why multi-model?</h2>
    <ul class="feature-list">
      <li>Different models have different blind spots</li>
      <li>Disagreements reveal the gray areas in your code</li>
      <li>Consensus means genuinely solid code</li>
      <li>One API call, two independent reviews, one verdict</li>
    </ul>
  </div>

  <footer>
    <a href="https://github.com/AdelElo13/duoveto">GitHub</a> &middot; Built by <a href="https://github.com/AdelElo13">AdelElo13</a> &middot; Free: 10 reviews/day
  </footer>
</div>

<div class="copy-toast" id="toast">Copied!</div>

<script>
function esc(s){var d=document.createElement('div');d.textContent=s;return d.innerHTML}

function loadSample(){
  document.getElementById('code').value='async function deleteUser(userId) {\\n  await db.query(\`DELETE FROM users WHERE id = \${userId}\`);\\n  await db.query(\`DELETE FROM orders WHERE user_id = \${userId}\`);\\n  return { success: true };\\n}';
}

function copyText(text){
  navigator.clipboard.writeText(text);
  var t=document.getElementById('toast');t.classList.add('show');
  setTimeout(function(){t.classList.remove('show')},1500);
}

function renderReview(r){
  var h='<div class="review-card"><div class="review-header"><span class="review-model">'+esc(r.model)+'</span><span class="review-score">'+r.score+'/10 &mdash; '+esc(r.verdict)+'</span></div>';
  if(r.issues.length){
    h+='<div class="sect">Issues ('+r.issues.length+')</div>';
    r.issues.forEach(function(i){h+='<div class="issue"><span class="sev '+i.severity+'">'+i.severity+'</span><span class="issue-text">'+esc(i.description)+'</span></div>'});
  }
  if(r.improvements&&r.improvements.length){
    h+='<div class="sect">Suggested fixes</div>';
    r.improvements.forEach(function(i){h+='<div class="item fix">'+esc(i)+'</div>'});
  }
  if(r.praise&&r.praise.length){
    h+='<div class="sect">What\\'s good</div>';
    r.praise.forEach(function(p){h+='<div class="item good">'+esc(p)+'</div>'});
  }
  h+='</div>';
  return h;
}

async function submitReview(){
  var code=document.getElementById('code').value.trim();
  if(code.length<10){alert('Paste at least 10 characters.');return}
  var btn=document.getElementById('reviewBtn'),st=document.getElementById('status'),res=document.getElementById('result');
  btn.disabled=true;st.textContent='Reviewing... (~20s)';res.style.display='none';
  try{
    var r=await fetch('/api/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:code,type:document.getElementById('type').value})});
    var d=await r.json();
    if(d.error){st.textContent=d.error;btn.disabled=false;return}

    var prComment=d.reviews.map(function(rv){
      return'## '+rv.model+' ('+rv.score+'/10 — '+rv.verdict+')\\n'+rv.issues.map(function(i){return'- **'+i.severity+'**: '+i.description}).join('\\n')+'\\n\\n'+rv.improvements.map(function(i){return'- '+i}).join('\\n')
    }).join('\\n\\n---\\n\\n');
    prComment='# DuoVeto Review: '+d.consensus.toUpperCase()+' ('+d.consensus_score+'/10)\\n\\n'+d.unified_recommendation+'\\n\\n'+prComment;

    var html='<div class="card"><div class="consensus-bar"><span class="consensus-badge '+d.consensus+'">'+d.consensus+'</span><span class="score-big">'+d.consensus_score+'/10</span><span class="spacer"></span><button class="btn-sm" onclick="copyText('+esc(JSON.stringify(JSON.stringify(d)))+')">Copy JSON</button><button class="btn-sm" onclick="copyText('+esc(JSON.stringify(prComment))+')">Copy as PR comment</button></div>';
    html+='<div class="recommendation">'+esc(d.unified_recommendation)+'</div>';
    if(d.disagreements.length){d.disagreements.forEach(function(dg){html+='<div class="disagree">'+esc(dg)+'</div>'})}
    html+='</div>';
    d.reviews.forEach(function(rv){html+=renderReview(rv)});
    res.innerHTML=html;res.style.display='block';
    res.scrollIntoView({behavior:'smooth',block:'start'});
    st.textContent='';
  }catch(e){st.textContent='Error: '+e.message}
  btn.disabled=false;
}
</script>
</body>
</html>`;
