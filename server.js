// Minimal static + JSON API server. No deps.
//
// Routes:
//   GET  /api/plans    -> data/plans.json (auto-seeded from data/plan.json on first read)
//   PUT  /api/plans    -> overwrite data/plans.json (atomic via tmp+rename)
//   GET  /*            -> serve files from public/
//
// data/plan.json is kept around as a read-only seed for the exercise library
// and muscle-group list when plans.json is first created.

const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const PORT = process.env.PORT || 5173;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_FILE = path.join(ROOT, "data", "plan.json");
const PLANS_FILE = path.join(ROOT, "data", "plans.json");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Cache-Control": "no-store", ...headers });
  res.end(body);
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

// Reads data/plans.json. If missing, seeds it from data/plan.json's
// exerciseLibrary + muscleGroups (so the user starts with a usable library).
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
  const seed = { plans: [], exerciseLibrary, muscleGroups };
  const pretty = JSON.stringify(seed, null, 2);
  await writeAtomic(PLANS_FILE, pretty);
  return pretty;
}

async function serveStatic(req, res) {
  // Strip query, normalize, prevent path traversal.
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

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === "/api/plans" && req.method === "GET") {
      const data = await readPlansFile();
      return send(res, 200, data, { "Content-Type": MIME[".json"] });
    }
    if (req.url === "/api/plans" && req.method === "PUT") {
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
