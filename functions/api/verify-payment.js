// POST /api/verify-payment
// Verifies the signature Razorpay returns after checkout, using HMAC-SHA256
// with the secret key. This step is what actually confirms a payment is
// genuine — without it, anyone could forge a "success" response client-side.

export async function onRequestPost(context) {
  const { request, env } = context;

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

    // In production, this is also where you'd mark the order as "paid" in
    // your own order store (a database, Google Sheet, email notification,
    // etc.) — Cloudflare Pages Functions can call out to any of those too.

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
