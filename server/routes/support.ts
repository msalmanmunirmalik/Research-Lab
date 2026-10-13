import express, { type Request, type Response, type Router } from 'express';
import { z } from 'zod';

const router: Router = express.Router();

const MIN_AMOUNT_USD = 3;
const MAX_AMOUNT_USD = 10000;
const CENTS_PER_DOLLAR = 100;
const MAX_MESSAGE_LENGTH = 500;
const MAX_METADATA_MESSAGE_LENGTH = 450;
const HTTP_BAD_REQUEST = 400;
const HTTP_SERVER_ERROR = 500;
const HTTP_SERVICE_UNAVAILABLE = 503;
const DEFAULT_CONTACT_EMAIL = 'support@digitalresearchmanager.com';
const SUGGESTED_AMOUNTS = [10, 25, 50, 100] as const;

const checkoutSchema = z.object({
  amount: z.number().min(MIN_AMOUNT_USD).max(MAX_AMOUNT_USD),
  currency: z.enum(['usd', 'eur', 'gbp']).optional().default('usd'),
  message: z.string().max(MAX_MESSAGE_LENGTH).optional(),
});

function getFrontendBaseUrl(): string {
  const fromEnv = process.env.FRONTEND_URL?.replace(/\/$/, '');
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return fromEnv;
  }
  return 'http://localhost:5173';
}

function getContactEmail(): string {
  const fromEnv = process.env.DONATION_CONTACT_EMAIL?.trim();
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return fromEnv;
  }
  return DEFAULT_CONTACT_EMAIL;
}

function getPaypalCheckoutUrl(amount: number): string | null {
  const base = process.env.DONATION_PAYPAL_URL?.trim();
  if (base === undefined || base.length === 0) {
    return null;
  }

  const normalized = base.replace(/\/$/, '');
  if (normalized.includes('paypal.me')) {
    return `${normalized}/${amount}`;
  }

  try {
    const url = new URL(normalized);
    url.searchParams.set('amount', String(amount));
    return url.toString();
  } catch {
    return normalized;
  }
}

function parseStripeSessionUrl(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  if (!('url' in payload)) {
    return null;
  }
  const url = (payload as { url: unknown }).url;
  return typeof url === 'string' && url.length > 0 ? url : null;
}

async function createStripeCheckoutSession(
  amount: number,
  currency: string,
  message?: string
): Promise<string | null> {
  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (secret === undefined || secret.length === 0) {
    return null;
  }

  const frontend = getFrontendBaseUrl();
  const amountCents = Math.round(amount * CENTS_PER_DOLLAR);
  const params = new URLSearchParams();
  params.append('mode', 'payment');
  params.append('success_url', `${frontend}/support?status=success`);
  params.append('cancel_url', `${frontend}/support?status=cancelled`);
  params.append('submit_type', 'donate');
  params.append('billing_address_collection', 'auto');
  params.append('line_items[0][price_data][currency]', currency);
  params.append(
    'line_items[0][price_data][product_data][name]',
    'Support RILOS'
  );
  params.append(
    'line_items[0][price_data][product_data][description]',
    'Contribution to keep the free research platform running and improving.'
  );
  params.append('line_items[0][price_data][unit_amount]', String(amountCents));
  params.append('line_items[0][quantity]', '1');
  params.append('metadata[source]', 'support_us_page');
  params.append('metadata[amount_usd]', String(amount));
  if (message !== undefined && message.length > 0) {
    params.append('metadata[supporter_message]', message.slice(0, MAX_METADATA_MESSAGE_LENGTH));
  }

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error('Stripe checkout session failed:', detail);
    return null;
  }

  const data: unknown = await response.json();
  return parseStripeSessionUrl(data);
}

router.get('/config', (_req: Request, res: Response): void => {
  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
  const paypalUrl = process.env.DONATION_PAYPAL_URL?.trim();

  res.json({
    stripeEnabled: stripeKey !== undefined && stripeKey.length > 0,
    paypalEnabled: paypalUrl !== undefined && paypalUrl.length > 0,
    contactEmail: getContactEmail(),
    currency: 'USD',
    minAmount: MIN_AMOUNT_USD,
    maxAmount: MAX_AMOUNT_USD,
    suggestedAmounts: SUGGESTED_AMOUNTS,
    platformIsFree: true,
  });
});

router.post('/checkout', (req: Request, res: Response): void => {
  void (async () => {
    const parsed = checkoutSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(HTTP_BAD_REQUEST).json({
        error: `Choose an amount between $${MIN_AMOUNT_USD} and $${MAX_AMOUNT_USD}.`,
        details: parsed.error.issues,
      });
      return;
    }

    const { amount, currency, message } = parsed.data;
    const contactEmail = getContactEmail();

    try {
      const stripeUrl = await createStripeCheckoutSession(amount, currency, message);
      if (stripeUrl !== null) {
        res.json({ checkoutUrl: stripeUrl, provider: 'stripe' });
        return;
      }

      const paypalUrl = getPaypalCheckoutUrl(amount);
      if (paypalUrl !== null) {
        res.json({ checkoutUrl: paypalUrl, provider: 'paypal' });
        return;
      }

      res.status(HTTP_SERVICE_UNAVAILABLE).json({
        error:
          'Online checkout is not configured yet. Please email us to contribute another way.',
        contactEmail,
      });
    } catch (error) {
      console.error('Support checkout error:', error);
      res.status(HTTP_SERVER_ERROR).json({
        error: 'Unable to start checkout right now. Please try again or contact us.',
        contactEmail,
      });
    }
  })();
});

export default router;
