// Email-Allowlist als JSON-File mit Admin-Rolle.
//
// Datei: server/data/allowlist.json
// Schema:
//   {
//     "users": [
//       { "email": "...", "isAdmin": true, "addedAt": "ISO", "addedBy": "env" | "<email>" }
//     ]
//   }
//
// Beim ersten Start wird die Datei aus der ALLOWED_EMAILS-Env-Variable
// geseedet (alle dort gelisteten Emails als Admin). Danach ist die Env
// irrelevant — Pflege via API/UI.

const fsp = require("fs/promises");

let CONFIG = null; // { file, seedEmails }
let cache = null;
let mutex = Promise.resolve();

function configure({ file, envEmails }) {
  CONFIG = {
    file,
    seedEmails: (envEmails || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  };
  cache = null;
}

function withLock(fn) {
  const next = mutex.then(fn, fn);
  mutex = next.catch(() => {});
  return next;
}

async function readData() {
  if (cache) return cache;
  try {
    const raw = await fsp.readFile(CONFIG.file, "utf8");
    cache = JSON.parse(raw);
    if (!Array.isArray(cache.users)) cache.users = [];
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
    const now = new Date().toISOString();
    cache = {
      users: CONFIG.seedEmails.map((email) => ({
        email,
        isAdmin: true,
        addedAt: now,
        addedBy: "env",
      })),
    };
    await writeData(cache);
  }
  return cache;
}

async function writeData(data) {
  const tmp = `${CONFIG.file}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2));
  await fsp.rename(tmp, CONFIG.file);
  cache = data;
}

const norm = (s) => String(s || "").trim().toLowerCase();

async function list() {
  return (await readData()).users;
}

async function isAllowed(email) {
  const data = await readData();
  return data.users.some((u) => u.email === norm(email));
}

async function isAdmin(email) {
  const data = await readData();
  const e = norm(email);
  return data.users.some((u) => u.email === e && u.isAdmin);
}

function add(email, asAdmin, addedBy) {
  return withLock(async () => {
    const data = await readData();
    const e = norm(email);
    if (!e || !e.includes("@")) throw new Error("Ungültige Email.");
    if (data.users.find((u) => u.email === e)) throw new Error("Email ist bereits in der Liste.");
    data.users.push({
      email: e,
      isAdmin: !!asAdmin,
      addedAt: new Date().toISOString(),
      addedBy: norm(addedBy),
    });
    await writeData(data);
    return data.users;
  });
}

function remove(email) {
  return withLock(async () => {
    const data = await readData();
    const e = norm(email);
    const u = data.users.find((x) => x.email === e);
    if (!u) throw new Error("Email nicht in der Liste.");
    if (u.isAdmin) {
      const admins = data.users.filter((x) => x.isAdmin);
      if (admins.length === 1) throw new Error("Letzter Admin kann nicht entfernt werden.");
    }
    data.users = data.users.filter((x) => x.email !== e);
    await writeData(data);
    return data.users;
  });
}

function setAdmin(email, isAdminFlag) {
  return withLock(async () => {
    const data = await readData();
    const e = norm(email);
    const u = data.users.find((x) => x.email === e);
    if (!u) throw new Error("Email nicht in der Liste.");
    if (u.isAdmin && !isAdminFlag) {
      const admins = data.users.filter((x) => x.isAdmin);
      if (admins.length === 1) throw new Error("Letzter Admin kann nicht degradiert werden.");
    }
    u.isAdmin = !!isAdminFlag;
    await writeData(data);
    return data.users;
  });
}

module.exports = { configure, list, isAllowed, isAdmin, add, remove, setAdmin };
