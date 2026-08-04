// tests/spotify-exchange.test.js
// Simple node script to POST to local endpoint (vercel dev) — requires Node 18+ (global fetch) or node-fetch installed
// Usage: node tests/spotify-exchange.test.js CODE VERIFIER [REDIRECT_URI]

async function run() {
  const [,, code, verifier, redirect_uri] = process.argv;
  if (!code || !verifier) {
    console.error("Usage: node tests/spotify-exchange.test.js CODE VERIFIER [REDIRECT_URI]");
    process.exit(2);
  }

  const url = 'http://localhost:3000/api/spotify-exchange';
  const body = { code, code_verifier: verifier, redirect_uri: redirect_uri || 'http://localhost:3000/' };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const json = await res.json();
    console.log('status:', res.status);
    console.log(JSON.stringify(json, null, 2));
  } catch (err) {
    console.error('Request failed:', err);
    process.exit(1);
  }
}

run();
