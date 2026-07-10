// worker.js — Cloudflare Worker entry point.
// Handles the two Razorpay API routes directly, and falls back to serving
// the static site (index.html, products.html, assets/, etc.) for everything else.

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/api/create-order') {
      return createOrder(request, env);
    }

    if (request.method === 'POST' && url.pathname === '/api/verify-payment') {
      return verifyPayment(request, env);
    }

    // Everything else (index.html, products.html, assets/*, etc.) is served
    // from the static files bound via wrangler.jsonc's "assets" config.
    return env.ASSETS.fetch(request);
  }
};

// ---------- /api/create-order ----------
async function createOrder(request, env) {
  try {
    const body = await request.json();
    const amountInRupees = Number(body.amount);

    if (!amountInRupees || amountInRupees <= 0) {
      return json({ error: 'Invalid amount' }, 400);
    }

    if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
      return json({ error: 'Razorpay keys not configured on the server' }, 500);
    }

    const amountInPaise = Math.round(amountInRupees * 100);
    const auth = btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);

    const razorpayRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`
      },
      body: JSON.stringify({
        amount: amountInPaise,
        currency: 'INR',
        receipt: `raha_${Date.now()}`,
        notes: { source: 'raha-website' }
      })
    });

    const order = await razorpayRes.json();

    if (!razorpayRes.ok) {
      return json({ error: order?.error?.description || 'Order creation failed' }, 500);
    }

    return json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: env.RAZORPAY_KEY_ID
    });

  } catch (err) {
    return json({ error: 'Server error creating order' }, 500);
  }
}

// ---------- /api/verify-payment ----------
async function verifyPayment(request, env) {
  try {
    const body = await request.json();
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return json({ verified: false, error: 'Missing payment fields' }, 400);
    }

    if (!env.RAZORPAY_KEY_SECRET) {
      return json({ verified: false, error: 'Razorpay secret not configured on the server' }, 500);
    }

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(env.RAZORPAY_KEY_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(`${razorpay_order_id}|${razorpay_payment_id}`)
    );

    const expectedSignature = [...new Uint8Array(signatureBuffer)]
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const verified = expectedSignature === razorpay_signature;

    return json({ verified });

  } catch (err) {
    return json({ verified: false, error: 'Server error verifying payment' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
