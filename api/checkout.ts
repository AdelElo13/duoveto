import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const client = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const { installation_id, email } = req.body as { installation_id?: string; email?: string };

  try {
    const session = await client.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
      success_url: "https://duoveto.dev/?payment=success",
      cancel_url: "https://duoveto.dev/?payment=cancelled",
      client_reference_id: installation_id || undefined,
      customer_email: email || undefined,
      metadata: {
        app: "duoveto",
        installation_id: installation_id || "",
      },
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
}
