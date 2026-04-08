import express from "express";
import { execFile } from "node:child_process";
import { writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const app = express();
app.use(express.json({ limit: "1mb" }));

interface ModelReview {
  model: string;
  score: number;
  verdict: "approve" | "concerns" | "reject";
  issues: Array<{ severity: "critical" | "high" | "medium" | "low"; description: string }>;
  improvements: string[];
  praise: string[];
}

const REVIEW_PROMPT = (type: string, persona: string) => `You are ${persona}. Review the following ${type} for quality, security, and correctness.

Analyze the code critically and provide your review as a structured JSON object with these fields:
- score (number 1-10, where 7+ means genuinely good code)
- verdict (string: "approve", "concerns", or "reject")
- issues (array of objects with severity "critical"/"high"/"medium"/"low" and description string)
- improvements (array of specific actionable improvement strings)
- praise (array of things that are genuinely good)

Output your review as a JSON object. Do not include any text before or after the JSON.`;

function parseJson(text: string): Record<string, unknown> {
  // Try direct parse
  try { return JSON.parse(text); } catch {}
  // Try code block
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) try { return JSON.parse(codeBlock[1]); } catch {}
  // Find all JSON-like objects and try each (last valid one wins)
  const matches = text.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
  if (matches) {
    for (let i = matches.length - 1; i >= 0; i--) {
      try {
        const parsed = JSON.parse(matches[i]);
        if (parsed.score !== undefined || parsed.verdict !== undefined) return parsed;
      } catch {}
    }
    // Fall back to first parseable match
    for (const m of matches) {
      try { return JSON.parse(m); } catch {}
    }
  }
  // Last resort: greedy match
  const greedy = text.match(/\{[\s\S]*\}/);
  if (greedy) try { return JSON.parse(greedy[0]); } catch {}
  throw new Error("Failed to parse JSON from response");
}

function runCli(cmd: string, args: string[], timeout = 360000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(cmd, args, { timeout, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${cmd} failed: ${err.message}\n${stderr}`));
      else resolve(stdout);
    });
    // Close stdin so Codex doesn't wait for input
    child.stdin?.end();
  });
}

async function reviewWithCodex(content: string, type: string, context: string): Promise<ModelReview> {
  const prompt = `${REVIEW_PROMPT(type, "a meticulous senior engineer (GPT/Codex) who focuses on correctness, security, and edge cases")}

${context ? `Context: ${context}\n\n` : ""}${type.toUpperCase()} TO REVIEW:
${content}`;

  // Codex stdout has headers + answer + token count + answer again
  // Extract JSON from the raw stdout
  const output = await runCli("codex", [
    "exec", prompt,
    "--ephemeral",
    "--skip-git-repo-check",
  ], 120000);

  // The last occurrence of JSON in stdout is the final answer
  const parsed = parseJson(output);
  return {
    model: "codex (GPT-5.3)",
    score: parsed.score as number,
    verdict: parsed.verdict as ModelReview["verdict"],
    issues: parsed.issues as ModelReview["issues"],
    improvements: parsed.improvements as string[],
    praise: parsed.praise as string[],
  };
}

async function reviewWithClaude(content: string, type: string, context: string): Promise<ModelReview> {
  const prompt = `${REVIEW_PROMPT(type, "a pragmatic tech lead (Claude/Opus) who focuses on architecture, maintainability, and real-world tradeoffs")}

${context ? `Context: ${context}\n\n` : ""}${type.toUpperCase()} TO REVIEW:
${content}`;

  const output = await runCli("claude", ["-p", prompt], 120000);
  const parsed = parseJson(output);

  return {
    model: "claude (Opus 4.6)",
    score: parsed.score as number,
    verdict: parsed.verdict as ModelReview["verdict"],
    issues: parsed.issues as ModelReview["issues"],
    improvements: parsed.improvements as string[],
    praise: parsed.praise as string[],
  };
}

function synthesize(reviews: ModelReview[]) {
  const avgScore = reviews.reduce((s, r) => s + r.score, 0) / reviews.length;
  const verdicts = reviews.map((r) => r.verdict);

  let consensus: "approve" | "concerns" | "reject" = "approve";
  if (verdicts.includes("reject")) consensus = "reject";
  else if (verdicts.includes("concerns")) consensus = "concerns";

  const disagreements: string[] = [];
  if (new Set(verdicts).size > 1) {
    disagreements.push(`Verdict split: ${reviews.map((r) => `${r.model} says ${r.verdict}`).join(", ")}`);
  }
  if (reviews.length >= 2 && Math.abs(reviews[0].score - reviews[1].score) >= 2) {
    disagreements.push(`Score gap: ${reviews.map((r) => `${r.model}: ${r.score}/10`).join(" vs ")}`);
  }

  const allIssues = reviews.flatMap((r) => r.issues);
  const criticals = allIssues.filter((i) => i.severity === "critical").length;
  const highs = allIssues.filter((i) => i.severity === "high").length;

  const recommendation = criticals > 0
    ? `BLOCK: ${criticals} critical issue(s). Fix before proceeding.`
    : highs > 0
      ? `CAUTION: ${highs} high-severity issue(s). Address before shipping.`
      : avgScore >= 7
        ? "APPROVE: Both reviewers agree this is solid. Ship it."
        : `IMPROVE: Average score ${avgScore.toFixed(1)}/10. Address the noted issues.`;

  return {
    consensus,
    consensus_score: Math.round(avgScore * 10) / 10,
    disagreements,
    unified_recommendation: recommendation,
  };
}

// CORS
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  next();
});

app.options("/{*path}", (_req, res) => res.sendStatus(204));

app.get("/", (_req, res) => {
  res.redirect("https://duoveto.dev");
});

app.post("/api/review", async (req, res) => {
  const { content, type = "code", context = "" } = req.body || {};

  if (!content || content.length < 10) {
    res.status(400).json({ error: "content is required (min 10 characters)" });
    return;
  }
  if (content.length > 50000) {
    res.status(400).json({ error: "content too large (max 50,000 characters)" });
    return;
  }

  try {
    // Run both reviewers in parallel — Codex (GPT) + Claude (Opus)
    const [codexReview, claudeReview] = await Promise.all([
      reviewWithCodex(content, type, context),
      reviewWithClaude(content, type, context),
    ]);

    const reviews = [codexReview, claudeReview];
    const synthesis = synthesize(reviews);

    res.json({
      id: randomUUID(),
      consensus: synthesis.consensus,
      consensus_score: synthesis.consensus_score,
      reviews,
      disagreements: synthesis.disagreements,
      unified_recommendation: synthesis.unified_recommendation,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: `Review failed: ${msg}` });
  }
});

// ─── Pro: Iterative Sparring ──────────────────────────────────────────
const SPAR_PROMPT = (persona: string, otherModel: string) =>
  `You are ${persona}. You are reviewing code AND responding to a peer reviewer (${otherModel}).

For each point in the peer's review:
- AGREE if you think they're right
- DISAGREE with specific reasoning if you think they're wrong
- Add new issues they missed

Output a JSON object with:
- score (number 1-10)
- verdict ("approve", "concerns", or "reject")
- agreements (array of strings — points you agree with from peer)
- disagreements (array of objects with "point" and "rebuttal" strings)
- new_issues (array of objects with severity and description)
- final_position ("AGREE" or "DISAGREE" with shipping)`;

async function sparRound(
  content: string,
  type: string,
  context: string,
  previousReviews: ModelReview[],
  round: number,
): Promise<{ codex: ModelReview; claude: ModelReview }> {
  const peerContext = previousReviews
    .map((r) => `${r.model} (score ${r.score}/10, ${r.verdict}): issues: ${JSON.stringify(r.issues)}, improvements: ${JSON.stringify(r.improvements)}`)
    .join("\n\n");

  const codexPrompt = `${SPAR_PROMPT("a meticulous senior engineer (GPT/Codex)", "Claude/Opus")}

Round ${round} of adversarial review.

PEER'S PREVIOUS REVIEW:
${peerContext}

${type.toUpperCase()} UNDER REVIEW:
${content}`;

  const claudePrompt = `${SPAR_PROMPT("a pragmatic tech lead (Claude/Opus)", "GPT/Codex")}

Round ${round} of adversarial review.

PEER'S PREVIOUS REVIEW:
${peerContext}

${type.toUpperCase()} UNDER REVIEW:
${content}`;

  const [codexOut, claudeOut] = await Promise.all([
    runCli("codex", ["exec", codexPrompt, "--ephemeral", "--skip-git-repo-check"]),
    runCli("claude", ["-p", claudePrompt]),
  ]);

  const codexParsed = parseJson(codexOut);
  const claudeParsed = parseJson(claudeOut);

  return {
    codex: {
      model: `codex (GPT-5.3) — round ${round}`,
      score: codexParsed.score as number,
      verdict: codexParsed.verdict as ModelReview["verdict"],
      issues: [
        ...((codexParsed.new_issues ?? []) as ModelReview["issues"]),
      ],
      improvements: (codexParsed.disagreements as Array<{ point: string; rebuttal: string }> ?? [])
        .map((d) => `Disagrees with peer: ${d.point} — ${d.rebuttal}`),
      praise: (codexParsed.agreements as string[] ?? []),
    },
    claude: {
      model: `claude (Opus 4.6) — round ${round}`,
      score: claudeParsed.score as number,
      verdict: claudeParsed.verdict as ModelReview["verdict"],
      issues: [
        ...((claudeParsed.new_issues ?? []) as ModelReview["issues"]),
      ],
      improvements: (claudeParsed.disagreements as Array<{ point: string; rebuttal: string }> ?? [])
        .map((d) => `Disagrees with peer: ${d.point} — ${d.rebuttal}`),
      praise: (claudeParsed.agreements as string[] ?? []),
    },
  };
}

app.post("/api/review/deep", async (req, res) => {
  const { content, type = "code", context = "", rounds = 3, api_key } = req.body || {};

  if (!api_key || !api_key.startsWith("dv_pro_")) {
    res.status(403).json({ error: "Deep review requires a Pro API key. Get one at duoveto.dev/pro" });
    return;
  }
  if (!content || content.length < 10) {
    res.status(400).json({ error: "content is required (min 10 characters)" });
    return;
  }
  if (content.length > 50000) {
    res.status(400).json({ error: "content too large (max 50,000 characters)" });
    return;
  }

  const maxRounds = Math.min(rounds, 5);

  try {
    // Round 1: independent parallel reviews (same as free tier)
    const [codexR1, claudeR1] = await Promise.all([
      reviewWithCodex(content, type, context),
      reviewWithClaude(content, type, context),
    ]);

    const allRounds: Array<{ round: number; codex: ModelReview; claude: ModelReview }> = [
      { round: 1, codex: codexR1, claude: claudeR1 },
    ];

    // Rounds 2+: each model sees the other's previous review
    let lastCodex = codexR1;
    let lastClaude = claudeR1;

    for (let r = 2; r <= maxRounds; r++) {
      // Check if they already agree
      if (lastCodex.verdict === lastClaude.verdict && Math.abs(lastCodex.score - lastClaude.score) < 2) {
        break; // Consensus reached
      }

      const result = await sparRound(content, type, context, [lastCodex, lastClaude], r);
      allRounds.push({ round: r, ...result });
      lastCodex = result.codex;
      lastClaude = result.claude;
    }

    const finalReviews = [lastCodex, lastClaude];
    const synthesis = synthesize(finalReviews);

    res.json({
      id: randomUUID(),
      mode: "deep",
      rounds_completed: allRounds.length,
      consensus: synthesis.consensus,
      consensus_score: synthesis.consensus_score,
      final_reviews: finalReviews,
      all_rounds: allRounds,
      disagreements: synthesis.disagreements,
      unified_recommendation: synthesis.unified_recommendation,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: `Deep review failed: ${msg}` });
  }
});

const PORT = process.env.PORT || 3200;
app.listen(PORT, () => {
  console.log(`DuoVeto running on http://localhost:${PORT}`);
  console.log("Reviewers: Codex (GPT-5.3 via OAuth) + Claude Code (Opus 4.6 via OAuth)");
  console.log("Endpoints: POST /api/review (free) | POST /api/review/deep (pro)");
});
