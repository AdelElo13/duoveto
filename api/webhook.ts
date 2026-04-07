import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHmac, timingSafeEqual } from "node:crypto";
import { SignJWT, importPKCS8 } from "jose";
import OpenAI from "openai";

// --- Auth helpers ---

function verifySignature(payload: string, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(payload).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

async function getInstallationToken(installationId: number): Promise<string> {
  const appId = process.env.GITHUB_APP_ID!;
  const privateKeyRaw = (process.env.GITHUB_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  const privateKey = await importPKCS8(privateKeyRaw, "RS256");

  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(appId)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(privateKey);

  const res = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  if (!res.ok) throw new Error(`Failed to get installation token: ${res.status}`);
  const data = (await res.json()) as { token: string };
  return data.token;
}

// --- Review logic (same as /api/review but returns markdown) ---

const REVIEW_PROMPT = (persona: string) => `You are ${persona}. Review the code diff critically. Focus on security, correctness, architecture, edge cases, error handling, and performance.

Respond with ONLY valid JSON:
{
  "score": <1-10>,
  "verdict": "<approve|concerns|reject>",
  "issues": [{"severity": "<critical|high|medium|low>", "description": "..."}],
  "improvements": ["..."],
  "praise": ["..."]
}`;

async function reviewDiff(diff: string, model: string, persona: string) {
  const client = new OpenAI();
  const res = await client.chat.completions.create({
    model,
    max_completion_tokens: 2000,
    messages: [
      { role: "system", content: REVIEW_PROMPT(persona) },
      { role: "user", content: `CODE DIFF TO REVIEW:\n\n${diff.slice(0, 30000)}` },
    ],
  });
  const text = res.choices[0]?.message?.content || "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON in response");
  return JSON.parse(match[0]) as {
    score: number;
    verdict: string;
    issues: Array<{ severity: string; description: string }>;
    improvements: string[];
    praise: string[];
  };
}

function toMarkdown(
  r1: { model: string; score: number; verdict: string; issues: Array<{ severity: string; description: string }>; improvements: string[] },
  r2: { model: string; score: number; verdict: string; issues: Array<{ severity: string; description: string }>; improvements: string[] },
): { body: string; conclusion: "success" | "failure" | "neutral" } {
  const avg = (r1.score + r2.score) / 2;
  const consensus = r1.verdict === "reject" || r2.verdict === "reject" ? "REJECT"
    : r1.verdict === "concerns" || r2.verdict === "concerns" ? "CONCERNS" : "APPROVE";

  const criticals = [...r1.issues, ...r2.issues].filter((i) => i.severity === "critical").length;

  let body = `## DuoVeto Review: ${consensus} (${avg.toFixed(1)}/10)\n\n`;

  if (r1.verdict !== r2.verdict) {
    body += `> **Disagreement:** ${r1.model} says *${r1.verdict}*, ${r2.model} says *${r2.verdict}*\n\n`;
  }

  for (const r of [{ ...r1 }, { ...r2 }]) {
    body += `### ${r.model} — ${r.score}/10 (${r.verdict})\n\n`;
    if (r.issues.length) {
      for (const i of r.issues) {
        const icon = i.severity === "critical" ? "🔴" : i.severity === "high" ? "🟠" : i.severity === "medium" ? "🟡" : "🟢";
        body += `- ${icon} **${i.severity}**: ${i.description}\n`;
      }
      body += "\n";
    }
    if (r.improvements.length) {
      body += "**Suggested fixes:**\n";
      for (const imp of r.improvements) body += `- ${imp}\n`;
      body += "\n";
    }
  }

  body += `---\n*Reviewed by [DuoVeto](https://duoveto.dev) — two AI models, one verdict*`;

  const conclusion: "success" | "failure" | "neutral" = criticals > 0 ? "failure" : consensus === "APPROVE" ? "success" : "neutral";
  return { body, conclusion };
}

// --- Webhook handler ---

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    res.status(500).json({ error: "GITHUB_WEBHOOK_SECRET not configured" });
    return;
  }

  // Verify signature
  const rawBody = JSON.stringify(req.body);
  const sig = req.headers["x-hub-signature-256"] as string | undefined;
  if (!verifySignature(rawBody, sig, secret)) {
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  const event = req.headers["x-github-event"] as string;
  if (event !== "pull_request") {
    res.status(200).json({ ignored: true, event });
    return;
  }

  const payload = req.body as {
    action: string;
    installation: { id: number };
    pull_request: { number: number; head: { sha: string }; title: string };
    repository: { full_name: string; owner: { login: string }; name: string };
  };

  if (!["opened", "synchronize", "reopened"].includes(payload.action)) {
    res.status(200).json({ ignored: true, action: payload.action });
    return;
  }

  // Respond immediately, process async
  res.status(202).json({ queued: true });

  try {
    const token = await getInstallationToken(payload.installation.id);
    const owner = payload.repository.owner.login;
    const repo = payload.repository.name;
    const prNumber = payload.pull_request.number;
    const headSha = payload.pull_request.head.sha;

    const gh = (path: string, opts?: RequestInit) =>
      fetch(`https://api.github.com${path}`, {
        ...opts,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          ...opts?.headers,
        },
      });

    // Create "in progress" check run
    await gh(`/repos/${owner}/${repo}/check-runs`, {
      method: "POST",
      body: JSON.stringify({
        name: "DuoVeto Review",
        head_sha: headSha,
        status: "in_progress",
        output: { title: "Reviewing...", summary: "Two AI models are reviewing your PR." },
      }),
    });

    // Fetch PR files
    const filesRes = await gh(`/repos/${owner}/${repo}/pulls/${prNumber}/files`);
    const files = (await filesRes.json()) as Array<{ filename: string; patch?: string; status: string }>;

    const diff = files
      .filter((f) => f.patch)
      .map((f) => `--- ${f.filename}\n${f.patch}`)
      .join("\n\n");

    if (!diff) {
      await gh(`/repos/${owner}/${repo}/check-runs`, {
        method: "POST",
        body: JSON.stringify({
          name: "DuoVeto Review",
          head_sha: headSha,
          status: "completed",
          conclusion: "neutral",
          output: { title: "No reviewable changes", summary: "No code diffs found in this PR." },
        }),
      });
      return;
    }

    // Run dual review
    const [r1, r2] = await Promise.all([
      reviewDiff(diff, "gpt-5.4", "a meticulous senior engineer focusing on security and correctness"),
      reviewDiff(diff, "o4-mini", "a pragmatic tech lead focusing on architecture and tradeoffs"),
    ]);

    const review1 = { model: "GPT-5.4", ...r1 };
    const review2 = { model: "o4-mini", ...r2 };
    const { body, conclusion } = toMarkdown(review1, review2);

    // Post PR comment
    await gh(`/repos/${owner}/${repo}/issues/${prNumber}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });

    // Complete check run
    const avg = (r1.score + r2.score) / 2;
    await gh(`/repos/${owner}/${repo}/check-runs`, {
      method: "POST",
      body: JSON.stringify({
        name: "DuoVeto Review",
        head_sha: headSha,
        status: "completed",
        conclusion,
        output: {
          title: `DuoVeto: ${avg.toFixed(1)}/10 — ${conclusion === "failure" ? "Critical issues found" : conclusion === "success" ? "Approved" : "Concerns noted"}`,
          summary: body,
        },
      }),
    });
  } catch (err) {
    console.error("Webhook processing error:", err);
  }
}

export const config = {
  maxDuration: 60,
};
