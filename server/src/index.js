// Minimal static + JSON API server, gated by Google OAuth.
//
// Routes:
//   GET  /auth/google           -> start OAuth, set state+verifier cookies, redirect
//   GET  /auth/google/callback  -> finish OAuth, set session cookie, redirect to /
//   POST /auth/logout           -> clear session cookie
//   GET  /api/me                -> { email }
//   GET  /api/plans             -> data/plans.json (auto-seeded from data/plan.json)
//   PUT  /api/plans             -> overwrite data/plans.json (atomic via tmp+rename)
//   GET  /*                     -> serve files from public/
//
// All routes except /auth/* require a valid session cookie. Unauthenticated
// HTML/static requests redirect to /auth/google; API requests get 401.
//
// data/plan.json is kept around as a read-only seed for the exercise library
// and muscle-group list when plans.json is first created.

const http = require("http");
const fsp = require("fs/promises");
const path = require("path");
const { URL } = require("node:url");

const {
  createAuth,
  parseCookies,
  buildSetCookie,
  setCookies,
} = require("./auth.js");

const PORT = Number(process.env.PORT) || 5173;
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const SERVER_ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(PROJECT_ROOT, "public");
const DATA_FILE = path.join(SERVER_ROOT, "data", "plan.json");
const PLANS_FILE = path.join(SERVER_ROOT, "data", "plans.json");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const auth = createAuth(process.env);

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Cache-Control": "no-store", ...headers });
  res.end(body);
}

function redirect(res, location, extraCookies) {
  if (extraCookies && extraCookies.length) setCookies(res, extraCookies);
  res.writeHead(302, { Location: location, "Cache-Control": "no-store" });
  res.end();
}

async function readBody(req, limit = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("payload too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function writeAtomic(file, contents) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tmp, contents);
  await fsp.rename(tmp, file);
}

async function readPlansFile() {
  try {
    return await fsp.readFile(PLANS_FILE, "utf8");
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  let exerciseLibrary = [];
  let muscleGroups = [];
  try {
    const raw = await fsp.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.exerciseLibrary)) exerciseLibrary = parsed.exerciseLibrary;
    if (Array.isArray(parsed.muscleGroups)) {
      muscleGroups = parsed.muscleGroups.map((m) => ({ name: m.name }));
    }
  } catch {
    // No seed available — start empty.
  }
  const seed = { plans: [], activePlanId: null, exerciseLibrary, muscleGroups };
  const pretty = JSON.stringify(seed, null, 2);
  await writeAtomic(PLANS_FILE, pretty);
  return pretty;
}

async function serveStatic(req, res) {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  const rel = urlPath === "/" ? "/index.html" : urlPath;
  const abs = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!abs.startsWith(PUBLIC_DIR)) return send(res, 403, "forbidden");
  try {
    const data = await fsp.readFile(abs);
    const type = MIME[path.extname(abs)] || "application/octet-stream";
    send(res, 200, data, { "Content-Type": type });
  } catch (err) {
    if (err.code === "ENOENT") return send(res, 404, "not found");
    throw err;
  }
}

// --- Auth route handlers ---------------------------------------------------

const OAUTH_TEMP_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "Lax",
  path: "/",
  secure: auth.cookieSecure,
  maxAge: 600,
};

const SESSION_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "Lax",
  path: "/",
  secure: auth.cookieSecure,
  maxAge: Math.floor(auth.SESSION_TTL_MS / 1000),
};

function handleAuthStart(req, res) {
  const { url, state, codeVerifier } = auth.startAuth();
  redirect(res, url, [
    buildSetCookie("oauth_state", state, OAUTH_TEMP_COOKIE_OPTS),
    buildSetCookie("oauth_verifier", codeVerifier, OAUTH_TEMP_COOKIE_OPTS),
  ]);
}

async function handleAuthCallback(req, res, url) {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookies = parseCookies(req);
  const storedState = cookies.oauth_state;
  const storedVerifier = cookies.oauth_verifier;

  const clearTemp = [
    buildSetCookie("oauth_state", "", { ...OAUTH_TEMP_COOKIE_OPTS, maxAge: 0 }),
    buildSetCookie("oauth_verifier", "", { ...OAUTH_TEMP_COOKIE_OPTS, maxAge: 0 }),
  ];

  if (!code || !state || !storedState || !storedVerifier || state !== storedState) {
    return redirect(res, "/?auth_error=state", clearTemp);
  }

  let result;
  try {
    result = await auth.finishAuth(code, storedVerifier);
  } catch (err) {
    console.error("OAuth-Fehler:", err);
    return redirect(res, "/?auth_error=failed", clearTemp);
  }

  if (!result.email || !auth.isAllowed(result.email)) {
    return redirect(res, "/?auth_error=not-allowed", clearTemp);
  }

  const session = auth.signSession(result.email);
  redirect(res, "/", [
    ...clearTemp,
    buildSetCookie(auth.SESSION_COOKIE, session, SESSION_COOKIE_OPTS),
  ]);
}

function handleLogout(req, res) {
  setCookies(res, [
    buildSetCookie(auth.SESSION_COOKIE, "", { ...SESSION_COOKIE_OPTS, maxAge: 0 }),
  ]);
  send(res, 200, JSON.stringify({ ok: true }), { "Content-Type": MIME[".json"] });
}

// --- Auth gate -------------------------------------------------------------

function getSession(req) {
  const cookies = parseCookies(req);
  return auth.verifySession(cookies[auth.SESSION_COOKIE]);
}

function denyUnauthenticated(req, res, url) {
  const accept = req.headers.accept || "";
  const isApi = url.pathname.startsWith("/api/");
  if (isApi || !accept.includes("text/html")) {
    return send(res, 401, JSON.stringify({ error: "unauthorized" }), {
      "Content-Type": MIME[".json"],
    });
  }
  // Don't auto-redirect to Google when the user explicitly logged out or after
  // a failed callback — that would either log them back in immediately or
  // create a redirect loop. Show a small interstitial instead.
  if (url.pathname === "/") {
    const authError = url.searchParams.get("auth_error");
    if (authError) {
      return send(res, 200, renderInterstitial("Kein Zugriff", authErrorMessage(authError)), {
        "Content-Type": MIME[".html"],
      });
    }
    if (url.searchParams.get("logged_out") != null) {
      return send(res, 200, renderInterstitial("Abgemeldet", "Du wurdest abgemeldet."), {
        "Content-Type": MIME[".html"],
      });
    }
  }
  return redirect(res, "/auth/google");
}

function authErrorMessage(code) {
  return {
    "not-allowed": "Diese Google-Adresse hat keinen Zugriff.",
    state: "Login abgebrochen oder Sitzung abgelaufen.",
    failed: "Login fehlgeschlagen. Bitte erneut versuchen.",
  }[code] || "Login fehlgeschlagen.";
}

function renderInterstitial(title, msg) {
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Trainingsplan</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0b1120; color: #e2e8f0;
           min-height: 100vh; margin: 0; display: grid; place-items: center; }
    .card { background: #111827; border: 1px solid #1f2937; border-radius: 12px;
            padding: 32px 36px; max-width: 420px; text-align: center; }
    h1 { font-size: 18px; margin: 0 0 12px; }
    p { color: #94a3b8; margin: 0 0 20px; }
    a { display: inline-block; padding: 10px 18px; border-radius: 8px;
        background: #0891b2; color: white; text-decoration: none; font-weight: 600; }
    a:hover { background: #0e7490; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${msg}</p>
    <a href="/auth/google">Anmelden</a>
  </div>
</body>
</html>`;
}

// --- Server ----------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname;

    // Auth endpoints — always open.
    if (pathname === "/auth/google" && req.method === "GET") {
      return handleAuthStart(req, res);
    }
    if (pathname === "/auth/google/callback" && req.method === "GET") {
      return handleAuthCallback(req, res, url);
    }
    if (pathname === "/auth/logout" && req.method === "POST") {
      return handleLogout(req, res);
    }

    // Everything below requires a valid session.
    const session = getSession(req);
    if (!session) return denyUnauthenticated(req, res, url);

    if (pathname === "/api/me" && req.method === "GET") {
      return send(res, 200, JSON.stringify({ email: session.email }), {
        "Content-Type": MIME[".json"],
      });
    }
    if (pathname === "/api/plans" && req.method === "GET") {
      const data = await readPlansFile();
      return send(res, 200, data, { "Content-Type": MIME[".json"] });
    }
    if (pathname === "/api/plans" && req.method === "PUT") {
      const body = await readBody(req);
      try {
        JSON.parse(body);
      } catch {
        return send(res, 400, "invalid json");
      }
      const pretty = JSON.stringify(JSON.parse(body), null, 2);
      await writeAtomic(PLANS_FILE, pretty);
      return send(res, 204, "");
    }
    if (req.method !== "GET") return send(res, 405, "method not allowed");
    await serveStatic(req, res);
  } catch (err) {
    console.error(err);
    send(res, 500, "internal error");
  }
});

server.listen(PORT, () => {
  console.log(`trainingsplan running on http://localhost:${PORT}`);
});
