// Minimal static + JSON API server, gated by Google OAuth.
//
// Routes:
//   GET  /auth/google           -> start OAuth, set state+verifier cookies, redirect
//   GET  /auth/google/callback  -> finish OAuth, set session cookie, redirect to /
//   POST /auth/logout           -> clear session cookie
//   GET  /api/me                -> { email }
//   GET  /api/plans             -> data/users/<hash>.json for the logged-in user
//                                  (auto-seeded from data/template.json on first request)
//   PUT  /api/plans             -> overwrite that file (atomic via tmp+rename,
//                                  serialized per-user via withUserLock)
//   GET  /*                     -> serve files from public/
//
// All routes except /auth/* require a valid session cookie AND a still-
// allowlisted email. Unauthenticated HTML/static requests redirect to
// /auth/google; API requests get 401.
//
// data/template.json is a read-only seed for exerciseLibrary + muscleGroups
// that gets copied into every new user's file on first login.

const http = require("http");
const fsp = require("fs/promises");
const path = require("path");
const { createHash } = require("node:crypto");
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
const DATA_DIR = path.join(SERVER_ROOT, "data");
const USERS_DIR = path.join(DATA_DIR, "users");
const TEMPLATE_FILE = path.join(DATA_DIR, "template.json");
// Legacy paths — kept only for the one-shot boot migration.
const LEGACY_TEMPLATE_FILE = path.join(DATA_DIR, "plan.json");
const LEGACY_PLANS_FILE = path.join(DATA_DIR, "plans.json");
const MIGRATION_OWNER_EMAIL = (
  process.env.MIGRATION_OWNER_EMAIL || "jarekgster@googlemail.com"
).toLowerCase();

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

function userKey(email) {
  return createHash("sha256")
    .update(String(email || "").toLowerCase())
    .digest("hex")
    .slice(0, 16);
}

function userFilePath(email) {
  return path.join(USERS_DIR, `${userKey(email)}.json`);
}

// Per-user serial write queue: prevents two tabs of the same user from
// racing on writeAtomic of the same file. Different users still write in
// parallel.
const userWriteQueue = new Map();
function withUserLock(key, fn) {
  const prev = userWriteQueue.get(key) || Promise.resolve();
  const next = prev.then(fn, fn);
  userWriteQueue.set(
    key,
    next.finally(() => {
      if (userWriteQueue.get(key) === next) userWriteQueue.delete(key);
    }),
  );
  return next;
}

// Default color-key mapping for the historic 11 muscle-group names. New groups
// fall back to "rose" — the user picks a different slot in the CMS.
const DEFAULT_MG_COLOR = {
  "Brust": "rose",
  "Rücken": "blue",
  "Mittlere Schulter": "amber",
  "Hintere Schulter": "ochre",
  "Trapez": "violet",
  "Bizeps": "magenta",
  "Trizeps": "pink",
  "Quads": "green",
  "Hamstrings": "mint",
  "Waden": "lime",
  "Bauch": "orange",
};

function rid(prefix) {
  return prefix + Math.random().toString(36).slice(2, 10);
}

// One-shot, idempotent migration so old plans.json files keep working.
// Returns { data, changed }.
function migratePlans(parsed) {
  let changed = false;
  const data = { ...parsed };
  if (!Array.isArray(data.plans)) { data.plans = []; changed = true; }
  if (!Array.isArray(data.exerciseLibrary)) { data.exerciseLibrary = []; changed = true; }
  if (!Array.isArray(data.muscleGroups)) { data.muscleGroups = []; changed = true; }
  if (!Array.isArray(data.logs)) { data.logs = []; changed = true; }
  if (data.activePlanId === undefined) { data.activePlanId = null; changed = true; }

  // Muscle groups: add id + colorKey if missing.
  for (const mg of data.muscleGroups) {
    if (!mg.id) { mg.id = rid("mg_"); changed = true; }
    if (!mg.colorKey) { mg.colorKey = DEFAULT_MG_COLOR[mg.name] || "rose"; changed = true; }
  }

  // Build name → id map for resolving legacy `muscleGroup: "Brust"` references.
  const mgByName = new Map(data.muscleGroups.map((m) => [m.name, m.id]));

  // Exercise library: add id + muscleGroupId, drop legacy `muscleGroup` name.
  for (const ex of data.exerciseLibrary) {
    if (!ex.id) { ex.id = rid("le_"); changed = true; }
    if (!("muscleGroupId" in ex)) {
      ex.muscleGroupId = ex.muscleGroup ? mgByName.get(ex.muscleGroup) || null : null;
      changed = true;
    }
    if ("muscleGroup" in ex) { delete ex.muscleGroup; changed = true; }
  }

  // Plan exercises: same — replace `muscleGroup` name with `muscleGroupId`.
  for (const plan of data.plans) {
    if (!Array.isArray(plan.days)) continue;
    for (const day of plan.days) {
      if (!Array.isArray(day.exercises)) continue;
      for (const ex of day.exercises) {
        if (!("muscleGroupId" in ex)) {
          ex.muscleGroupId = ex.muscleGroup ? mgByName.get(ex.muscleGroup) || null : null;
          changed = true;
        }
        if ("muscleGroup" in ex) { delete ex.muscleGroup; changed = true; }
      }
    }
  }

  return { data, changed };
}

async function readUserPlans(email) {
  const file = userFilePath(email);
  let raw;
  try {
    raw = await fsp.readFile(file, "utf8");
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }

  if (raw) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Corrupt file — better to fail loud than silently overwrite.
      throw new Error(`${path.basename(file)} is not valid JSON`);
    }
    const { data, changed } = migratePlans(parsed);
    if (!changed) return raw;
    const pretty = JSON.stringify(data, null, 2);
    await fsp.mkdir(USERS_DIR, { recursive: true });
    await writeAtomic(file, pretty);
    return pretty;
  }

  // No file yet — seed from data/template.json.
  let exerciseLibrary = [];
  let muscleGroups = [];
  try {
    const seedRaw = await fsp.readFile(TEMPLATE_FILE, "utf8");
    const seedParsed = JSON.parse(seedRaw);
    if (Array.isArray(seedParsed.exerciseLibrary)) exerciseLibrary = seedParsed.exerciseLibrary;
    if (Array.isArray(seedParsed.muscleGroups)) {
      muscleGroups = seedParsed.muscleGroups.map((m) => ({ name: m.name }));
    }
  } catch {
    // No template — start empty.
  }
  const now = new Date().toISOString();
  const seed = {
    email,
    createdAt: now,
    updatedAt: now,
    plans: [],
    activePlanId: null,
    exerciseLibrary,
    muscleGroups,
    logs: [],
  };
  const { data } = migratePlans(seed);
  const pretty = JSON.stringify(data, null, 2);
  await fsp.mkdir(USERS_DIR, { recursive: true });
  await writeAtomic(file, pretty);
  return pretty;
}

async function writeUserPlans(email, body) {
  const parsed = JSON.parse(body);
  parsed.email = email;
  parsed.updatedAt = new Date().toISOString();
  const pretty = JSON.stringify(parsed, null, 2);
  await fsp.mkdir(USERS_DIR, { recursive: true });
  await writeAtomic(userFilePath(email), pretty);
}

// One-shot bootstrap migration from the single-tenant layout:
//   data/plans.json     → data/users/<owner-hash>.json (stamped with email)
//   data/plan.json      → data/template.json
// Idempotent: if the user file or template already exist, the corresponding
// step is skipped.
async function migrateToPerUser() {
  await fsp.mkdir(USERS_DIR, { recursive: true });

  // Rename legacy seed to template.
  try {
    await fsp.access(TEMPLATE_FILE);
  } catch {
    try {
      await fsp.rename(LEGACY_TEMPLATE_FILE, TEMPLATE_FILE);
      console.log("Migration: data/plan.json → data/template.json");
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
  }

  // Move legacy plans.json to the owner's per-user file.
  const ownerFile = userFilePath(MIGRATION_OWNER_EMAIL);
  try {
    await fsp.access(ownerFile);
    return; // owner already has a per-user file — nothing to migrate
  } catch {
    // not yet — try to copy from legacy
  }
  let raw;
  try {
    raw = await fsp.readFile(LEGACY_PLANS_FILE, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return; // fresh install
    throw err;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("legacy plans.json is not valid JSON — refusing migration");
  }
  parsed.email = MIGRATION_OWNER_EMAIL;
  if (!parsed.createdAt) parsed.createdAt = new Date().toISOString();
  parsed.updatedAt = new Date().toISOString();
  await writeAtomic(ownerFile, JSON.stringify(parsed, null, 2));
  await fsp.unlink(LEGACY_PLANS_FILE);
  console.log(
    `Migration: data/plans.json → data/users/${userKey(MIGRATION_OWNER_EMAIL)}.json`,
  );
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

    // Everything below requires a valid session AND a still-allowlisted email.
    // Defense-in-depth: allowlist is checked at OAuth callback, but old cookies
    // would otherwise remain valid for 30 days after a user is revoked.
    const session = getSession(req);
    if (!session || !auth.isAllowed(session.email)) {
      return denyUnauthenticated(req, res, url);
    }

    if (pathname === "/api/me" && req.method === "GET") {
      return send(res, 200, JSON.stringify({ email: session.email }), {
        "Content-Type": MIME[".json"],
      });
    }
    if (pathname === "/api/plans" && req.method === "GET") {
      const data = await readUserPlans(session.email);
      return send(res, 200, data, { "Content-Type": MIME[".json"] });
    }
    if (pathname === "/api/plans" && req.method === "PUT") {
      const body = await readBody(req);
      try {
        JSON.parse(body);
      } catch {
        return send(res, 400, "invalid json");
      }
      await withUserLock(userKey(session.email), () =>
        writeUserPlans(session.email, body),
      );
      return send(res, 204, "");
    }
    if (req.method !== "GET") return send(res, 405, "method not allowed");
    await serveStatic(req, res);
  } catch (err) {
    console.error(err);
    send(res, 500, "internal error");
  }
});

migrateToPerUser()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`trainingsplan running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Migration fehlgeschlagen:", err);
    process.exit(1);
  });
