import Stripe from "stripe";

const FREE_REVIEWS_PER_MONTH = 10;

let stripeClient: Stripe | null = null;
function getStripe(): Stripe {
  if (!stripeClient) stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY!);
  return stripeClient;
}

/** Check if a GitHub installation has an active DuoVeto subscription */
export async function hasActiveSubscription(installationId: string): Promise<boolean> {
  const stripe = getStripe();

  // Search for customers with this installation_id in metadata
  const customers = await stripe.customers.search({
    query: `metadata["duoveto_installation_id"]:"${installationId}"`,
    limit: 1,
  });

  if (customers.data.length === 0) return false;

  const customer = customers.data[0];
  const subs = await stripe.subscriptions.list({
    customer: customer.id,
    status: "active",
    limit: 1,
  });

  return subs.data.length > 0;
}

/** Count reviews this month for a free-tier installation (using Stripe meter or simple approach) */
export async function getMonthlyUsage(installationId: string): Promise<number> {
  // For now, use a simple approach: count via Stripe metadata on checkout sessions
  // In production, use a proper counter (Upstash Redis, Vercel KV, etc.)
  // For MVP: we accept the risk of reset on redeploy and use Stripe's usage records
  const stripe = getStripe();

  // Check if there's a usage record stored as a meter event
  // Simple MVP: just allow it and track later
  // TODO: integrate Upstash Redis for proper counting
  return 0; // Allow all for now, rate limit at API level
}

/** Check if an installation can review (paid OR under free limit) */
export async function canReview(installationId: string): Promise<{
  allowed: boolean;
  reason: string;
  isPaid: boolean;
}> {
  const isPaid = await hasActiveSubscription(installationId);

  if (isPaid) {
    return { allowed: true, reason: "Active subscription", isPaid: true };
  }

  // Free tier: check monthly count
  const usage = await getMonthlyUsage(installationId);
  if (usage >= FREE_REVIEWS_PER_MONTH) {
    return {
      allowed: false,
      reason: `Free tier limit reached (${FREE_REVIEWS_PER_MONTH}/month). Upgrade at https://duoveto.dev`,
      isPaid: false,
    };
  }

  return {
    allowed: true,
    reason: `Free tier: ${usage + 1}/${FREE_REVIEWS_PER_MONTH} this month`,
    isPaid: false,
  };
}
