// POST /api/create-order
// Creates a Razorpay Order using the secret key (kept server-side via env vars).
// The browser never sees RAZORPAY_KEY_SECRET — only the returned order_id + key_id.

export async function onRequestPost(context) {
  const { request, env } = context;

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

    // key_id is public (not secret) — safe to return to the browser.
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

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
