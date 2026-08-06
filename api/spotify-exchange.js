// api/spotify-exchange.js
// POST { code: string, code_verifier: string, redirect_uri?: string }
// Returns Spotify token response (access_token, refresh_token, expires_in, etc.)
// Keep SPOTIFY_CLIENT_ID and optional SPOTIFY_CLIENT_SECRET in ENV.
//
// Security: by default we DO NOT return refresh_token to frontend.
// To return refresh_token (dev only), set SPOTIFY_RETURN_REFRESH=true in ENV.
//
// For production secure storage of refresh_token, persist it server-side (e.g. Vercel KV, database, or secret store).
// This file only returns tokens; storage must be implemented separately.

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = req.body || {};
    // Vercel parses JSON body automatically for routes under /api
    const code = body.code || (typeof body === 'string' ? JSON.parse(body).code : undefined);
    const code_verifier = body.code_verifier || (typeof body === 'string' ? JSON.parse(body).code_verifier : undefined);
    const redirect_uri = body.redirect_uri || (body.redirectUri || (typeof body === 'string' ? JSON.parse(body).redirect_uri : undefined));

    if (!code || !code_verifier) return res.status(400).json({ error: "Missing code or code_verifier" });

    const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
    const params = new URLSearchParams();
    params.append("grant_type", "authorization_code");
    params.append("code", code);
    params.append("client_id", process.env.SPOTIFY_CLIENT_ID || "");
    params.append("code_verifier", code_verifier);
    if (redirect_uri) params.append("redirect_uri", redirect_uri);

    const headers = { "Content-Type": "application/x-www-form-urlencoded" };
    if (process.env.SPOTIFY_CLIENT_SECRET) {
      const basic = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString("base64");
      headers["Authorization"] = `Basic ${basic}`;
    }

    const tokenRes = await fetch(SPOTIFY_TOKEN_URL, { method: "POST", body: params.toString(), headers });
    const tokenJson = await tokenRes.json().catch(() => null);

    if (!tokenRes.ok) {
      return res.status(500).json({ error: "Spotify token exchange failed", details: tokenJson });
    }

    // By default, do not expose refresh_token to the frontend.
    // For local/dev debugging, set SPOTIFY_RETURN_REFRESH=true in environment to include it.
    const returnRefresh = String(process.env.SPOTIFY_RETURN_REFRESH || '').toLowerCase() === 'true' || process.env.SPOTIFY_RETURN_REFRESH === '1';
    if (!returnRefresh && tokenJson && tokenJson.refresh_token) {
      // copy tokenJson and delete refresh_token
      const safe = Object.assign({}, tokenJson);
      delete safe.refresh_token;
      return res.status(200).json(safe);
    }

    // For stricter security we could persist refresh_token server-side and return only a session id.
    // Example (conceptual):
    // if (tokenJson.refresh_token) {
    //   // persistRefreshTokenForUser(userId, tokenJson.refresh_token)
    //   // return { access_token: tokenJson.access_token, expires_in: tokenJson.expires_in, session_id: '...' }
    // }

    return res.status(200).json(tokenJson);
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
