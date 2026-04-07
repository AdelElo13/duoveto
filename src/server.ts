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

function runCli(cmd: string, args: string[], timeout = 120000): Promise<string> {
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

const PORT = process.env.PORT || 3200;
app.listen(PORT, () => {
  console.log(`DuoVeto running on http://localhost:${PORT}`);
  console.log("Reviewers: Codex (GPT-5.4 via OAuth) + Claude Code (Opus 4.6 via OAuth)");
});
