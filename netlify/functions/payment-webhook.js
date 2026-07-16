export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method not allowed"
    };
  }

  // TODO: Verify signature from provider before trusting payload.
  // Persist webhook payload to your secure store or update Firestore via Admin SDK.
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ received: true })
  };
}
