// Google OAuth + HMAC-signed session cookie.
// Pattern adapted from elle-eats; adjusted for raw Node http (no Hono).

const { Google, generateState, generateCodeVerifier } = require("arctic");
const { createHmac, timingSafeEqual } = require("node:crypto");

const SESSION_COOKIE = "session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function createAuth(env) {
  const required = [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REDIRECT_URI",
    "SESSION_SECRET",
  ];
  for (const key of required) {
    if (!env[key]) throw new Error(`Fehlende Umgebungsvariable: ${key}`);
  }

  const google = new Google(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI,
  );

  const secret = env.SESSION_SECRET;
  const cookieSecure = env.COOKIE_SECURE !== "false";

  return {
    SESSION_COOKIE,
    SESSION_TTL_MS,
    cookieSecure,

    startAuth() {
      const state = generateState();
      const codeVerifier = generateCodeVerifier();
      const url = google.createAuthorizationURL(state, codeVerifier, [
        "openid",
        "email",
        "profile",
      ]);
      return { url: url.toString(), state, codeVerifier };
    },

    async finishAuth(code, codeVerifier) {
      const tokens = await google.validateAuthorizationCode(code, codeVerifier);
      const idToken = tokens.idToken();
      const claims = decodeIdToken(idToken);
      return {
        email: String(claims.email || "").toLowerCase(),
        name: claims.name || "",
      };
    },

    signSession(email) {
      const expiry = Date.now() + SESSION_TTL_MS;
      const payload = `${email}|${expiry}`;
      const sig = createHmac("sha256", secret).update(payload).digest("base64url");
      return `${b64(payload)}.${sig}`;
    },

    verifySession(token) {
      if (!token || typeof token !== "string") return null;
      const [encPayload, sig] = token.split(".");
      if (!encPayload || !sig) return null;

      let payload;
      try {
        payload = unb64(encPayload);
      } catch {
        return null;
      }
      const expected = createHmac("sha256", secret).update(payload).digest("base64url");

      const sigBuf = Buffer.from(sig);
      const expBuf = Buffer.from(expected);
      if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;

      const [email, expiryStr] = payload.split("|");
      const expiry = Number(expiryStr);
      if (!email || !Number.isFinite(expiry) || Date.now() > expiry) return null;
      return { email, expiry };
    },
  };
}

function decodeIdToken(jwt) {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new Error("id_token: ungültiges Format");
  return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
}

function b64(s) {
  return Buffer.from(s, "utf8").toString("base64url");
}
function unb64(s) {
  return Buffer.from(s, "base64url").toString("utf8");
}

// --- Cookie helpers for raw http ------------------------------------------

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  const out = {};
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function buildSetCookie(name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${opts.path || "/"}`);
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.expires) parts.push(`Expires=${opts.expires.toUTCString()}`);
  parts.push(`SameSite=${opts.sameSite || "Lax"}`);
  if (opts.secure) parts.push("Secure");
  if (opts.httpOnly !== false) parts.push("HttpOnly");
  return parts.join("; ");
}

function setCookies(res, cookies) {
  const existing = res.getHeader("Set-Cookie");
  const list = Array.isArray(existing) ? existing.slice() : existing ? [existing] : [];
  for (const c of cookies) list.push(c);
  res.setHeader("Set-Cookie", list);
}

module.exports = { createAuth, parseCookies, buildSetCookie, setCookies };
