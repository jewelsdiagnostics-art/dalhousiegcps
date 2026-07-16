const PAYUNIT_BASE_URL = process.env.PAYUNIT_BASE_URL || "https://gateway.payunit.net";
const PAYUNIT_API_KEY = process.env.PAYUNIT_API_KEY;
const PAYUNIT_API_USER = process.env.PAYUNIT_API_USER;

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { provider, amount, phone, reference, payerName } = body;

    if (!provider || !amount || !phone || !reference) {
      return json(400, { error: "Missing provider, amount, phone, or reference" });
    }

    if (!PAYUNIT_API_KEY || !PAYUNIT_API_USER) {
      return json(500, { error: "Missing PayUnit credentials in Netlify environment" });
    }

    const channel = provider.toUpperCase() === "MTN" ? "mtn" : "orange";

    const payload = {
      amount: Number(amount),
      currency: "XAF",
      transaction_id: reference,
      return_url: process.env.PAYMENT_RETURN_URL || "https://example.com/payment/success",
      notify_url: process.env.PAYMENT_NOTIFY_URL || "https://example.com/.netlify/functions/payment-webhook",
      description: `Hospital payment (${channel})`,
      customer_name: payerName || "Patient",
      customer_phone: phone,
      gateway: channel
    };

    const response = await fetch(`${PAYUNIT_BASE_URL}/api/gateway/initialize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": PAYUNIT_API_KEY,
        "x-api-user": PAYUNIT_API_USER
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      return json(response.status, { error: data.message || "Gateway initialization failed", details: data });
    }

    return json(200, {
      status: data.status || "PENDING",
      gateway: channel,
      gatewayRef: data.transaction_id || reference,
      checkoutUrl: data.payment_url || null,
      raw: data
    });
  } catch (error) {
    return json(500, { error: error.message });
  }
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  };
}
