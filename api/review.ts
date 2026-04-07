import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";

interface ReviewRequest {
  content: string;
  type?: "plan" | "code" | "architecture" | "decision";
  context?: string;
}

interface ModelReview {
  model: string;
  score: number;
  verdict: "approve" | "concerns" | "reject";
  issues: Array<{ severity: "critical" | "high" | "medium" | "low"; description: string }>;
  improvements: string[];
  praise: string[];
}

interface ReviewResponse {
  id: string;
  consensus: "approve" | "concerns" | "reject";
  consensus_score: number;
  reviews: ModelReview[];
  disagreements: string[];
  unified_recommendation: string;
  timestamp: string;
}

const REVIEW_PROMPT = (type: string, persona: string) => `You are ${persona}. Your job is to find flaws, risks, and improvements that others miss. You are thorough, specific, and constructive — not mean, but relentlessly honest.

You are reviewing a ${type}. Be critical but fair. Focus on:
- Security vulnerabilities and data safety
- Architectural flaws and scalability risks
- Logic errors and edge cases
- Missing error handling
- Performance concerns
- Maintainability issues
- What's actually good (give credit where due)

Respond with ONLY valid JSON matching this structure:
{
  "score": <number 1-10, be honest — 7+ means genuinely good>,
  "verdict": "<approve|concerns|reject>",
  "issues": [
    {"severity": "<critical|high|medium|low>", "description": "Specific issue description"}
  ],
  "improvements": ["Specific actionable improvement"],
  "praise": ["What's genuinely good about this"]
}

Return ONLY valid JSON. No markdown, no code fences.`;

function parseJsonResponse(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) return JSON.parse(match[1]);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    throw new Error("Failed to parse response as JSON");
  }
}

async function reviewWithModel(
  content: string,
  type: string,
  context: string,
  modelId: string,
  persona: string,
): Promise<ModelReview> {
  const client = new OpenAI();
  const userPrompt = context
    ? `Context: ${context}\n\n${type.toUpperCase()} TO REVIEW:\n${content}`
    : `${type.toUpperCase()} TO REVIEW:\n${content}`;

  const isReasoningModel = modelId.startsWith("o");
  const response = await client.chat.completions.create({
    model: modelId,
    ...(isReasoningModel ? { max_completion_tokens: 2000 } : { max_tokens: 2000 }),
    messages: [
      ...(isReasoningModel ? [] : [{ role: "system" as const, content: REVIEW_PROMPT(type, persona) }]),
      { role: "user" as const, content: isReasoningModel
        ? `${REVIEW_PROMPT(type, persona)}\n\n${userPrompt}`
        : userPrompt },
    ],
  });

  const text = response.choices[0]?.message?.content || "";
  const parsed = parseJsonResponse(text) as {
    score: number;
    verdict: string;
    issues: Array<{ severity: string; description: string }>;
    improvements: string[];
    praise: string[];
  };

  return {
    model: modelId,
    score: parsed.score,
    verdict: parsed.verdict as ModelReview["verdict"],
    issues: parsed.issues as ModelReview["issues"],
    improvements: parsed.improvements,
    praise: parsed.praise,
  };
}

function synthesizeReviews(reviews: ModelReview[]): {
  consensus: ReviewResponse["consensus"];
  consensus_score: number;
  disagreements: string[];
  unified_recommendation: string;
} {
  const avgScore = reviews.reduce((sum, r) => sum + r.score, 0) / reviews.length;

  const verdicts = reviews.map((r) => r.verdict);
  let consensus: ReviewResponse["consensus"] = "approve";
  if (verdicts.includes("reject")) consensus = "reject";
  else if (verdicts.includes("concerns")) consensus = "concerns";

  const disagreements: string[] = [];
  if (new Set(verdicts).size > 1) {
    disagreements.push(
      `Verdict split: ${reviews.map((r) => `${r.model} says ${r.verdict}`).join(", ")}`,
    );
  }
  if (reviews.length >= 2) {
    const scoreDiff = Math.abs(reviews[0].score - reviews[1].score);
    if (scoreDiff >= 2) {
      disagreements.push(
        `Score gap: ${reviews.map((r) => `${r.model}: ${r.score}/10`).join(" vs ")}`,
      );
    }

    const criticals0 = reviews[0].issues.filter((i) => i.severity === "critical");
    const criticals1 = reviews[1].issues.filter((i) => i.severity === "critical");
    if (criticals0.length > 0 && criticals1.length === 0) {
      disagreements.push(`${reviews[0].model} found critical issues that ${reviews[1].model} missed`);
    }
    if (criticals1.length > 0 && criticals0.length === 0) {
      disagreements.push(`${reviews[1].model} found critical issues that ${reviews[0].model} missed`);
    }
  }

  const allIssues = reviews.flatMap((r) => r.issues);
  const criticalCount = allIssues.filter((i) => i.severity === "critical").length;
  const highCount = allIssues.filter((i) => i.severity === "high").length;

  let recommendation: string;
  if (criticalCount > 0) {
    recommendation = `BLOCK: ${criticalCount} critical issue(s) found. Fix before proceeding.`;
  } else if (highCount > 0) {
    recommendation = `CAUTION: ${highCount} high-severity issue(s). Address before shipping.`;
  } else if (avgScore >= 7) {
    recommendation = "APPROVE: Both reviewers agree this is solid. Ship it.";
  } else {
    recommendation = `IMPROVE: Average score ${avgScore.toFixed(1)}/10. Address the noted issues.`;
  }

  return { consensus, consensus_score: Math.round(avgScore * 10) / 10, disagreements, unified_recommendation: recommendation };
}

// Rate limiting (in-memory)
const rateLimits = new Map<string, { count: number; resetAt: number }>();
const FREE_LIMIT = 10;

function checkRateLimit(apiKey: string): boolean {
  const now = Date.now();
  const limit = rateLimits.get(apiKey);
  if (!limit || now > limit.resetAt) {
    rateLimits.set(apiKey, { count: 1, resetAt: now + 24 * 60 * 60 * 1000 });
    return true;
  }
  if (limit.count >= FREE_LIMIT) return false;
  limit.count++;
  return true;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const authHeader = req.headers.authorization;
  const apiKey = authHeader?.replace("Bearer ", "") || "anonymous";

  if (!checkRateLimit(apiKey)) {
    res.status(429).json({ error: "Rate limit exceeded. 10 reviews/day on free tier." });
    return;
  }

  const body = req.body as ReviewRequest;

  if (!body.content || body.content.length < 10) {
    res.status(400).json({ error: "content is required (min 10 characters)" });
    return;
  }

  if (body.content.length > 50000) {
    res.status(400).json({ error: "content too large (max 50,000 characters)" });
    return;
  }

  const type = body.type || "code";
  const context = body.context || "";

  try {
    const [review1, review2] = await Promise.all([
      reviewWithModel(
        body.content, type, context,
        "gpt-4.1",
        "a meticulous senior engineer who focuses on correctness, security, and edge cases",
      ),
      reviewWithModel(
        body.content, type, context,
        "o3-mini",
        "a pragmatic tech lead who focuses on architecture, maintainability, and real-world tradeoffs",
      ),
    ]);

    const reviews = [review1, review2];
    const synthesis = synthesizeReviews(reviews);

    const response: ReviewResponse = {
      id: crypto.randomUUID(),
      consensus: synthesis.consensus,
      consensus_score: synthesis.consensus_score,
      reviews,
      disagreements: synthesis.disagreements,
      unified_recommendation: synthesis.unified_recommendation,
      timestamp: new Date().toISOString(),
    };

    res.setHeader("X-RateLimit-Remaining", String(FREE_LIMIT - (rateLimits.get(apiKey)?.count || 0)));
    res.status(200).json(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: `Review failed: ${msg}` });
  }
}

export const config = {
  maxDuration: 60,
};
