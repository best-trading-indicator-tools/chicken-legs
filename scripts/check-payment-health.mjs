const secret = process.env.PAYMENT_WORKER_SECRET;
const url = process.env.PAYMENT_STATUS_URL;
if (!secret || secret.length < 32 || !url || new URL(url).protocol !== 'https:') {
  throw new Error('Configure PAYMENT_WORKER_SECRET and an HTTPS PAYMENT_STATUS_URL.');
}

const response = await fetch(url, {
  headers: { Authorization: `Bearer ${secret}` },
  signal: AbortSignal.timeout(45_000),
  redirect: 'error',
});
if (!response.ok) throw new Error(`Payment monitoring endpoint returned HTTP ${response.status}.`);
const { health } = await response.json();
if (!health || !Array.isArray(health.issues) || typeof health.healthy !== 'boolean') {
  throw new Error('Payment monitoring endpoint did not return a valid health report.');
}
// Counts and error categories only: never print billing information or API IDs.
console.log(JSON.stringify(health, null, 2));
if (!health.healthy || health.issues.length) throw new Error(`Payment recovery needs attention: ${health.issues.join(', ')}`);
