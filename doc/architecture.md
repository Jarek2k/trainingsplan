# Architecture — Ist-Stand

Snapshot des aktuellen Aufbaus. Stand: 2026-05-16.

## Überblick

Multi-User-Web-App zum Erstellen, Verwalten und Vergleichen wöchentlicher Trainingspläne. Jeder Google-authentifizierte Nutzer aus der Allowlist hat seinen eigenen Datenraum. Vanilla-Frontend ohne Build-Step, Node-`http`-Backend ohne Framework, Persistenz als atomar geschriebene JSON-Dateien pro Nutzer.

```
public/   →  Statisches Frontend (ES-Module, kein Bundler)
server/   →  Node-Backend (auth.js + allowlist.js + index.js, einzige Dep: arctic)
deploy/   →  Hetzner + Caddy + systemd
doc/      →  Diese Dokumentation
```

## Tech-Stack

| Layer       | Stack                                                              |
|-------------|--------------------------------------------------------------------|
| Frontend    | HTML, CSS, Vanilla-JS ES-Module, kein Build-Step                   |
| Backend     | Node.js native [`http`](server/src/index.js) (kein Express)        |
| OAuth       | [`arctic`](https://github.com/pilcrowOnPaper/arctic) (Google)      |
| Session     | HMAC-signiertes Cookie (SHA-256, `SESSION_SECRET`)                 |
| Persistenz  | JSON-Datei pro Nutzer in `server/data/users/`, atomic write        |
| Allowlist   | `server/data/allowlist.json`, In-Memory-Cache + Mutex              |
| Deployment  | Hetzner-VPS, Caddy als Reverse-Proxy, systemd-Unit                 |

## Repo-Layout

```
public/
├── index.html                  Shell (Header mit Mode-Actions + Profile-Avatar)
├── app.js                      Bootstrap: /api/me + Profile-Menu + lädt Plans + rendert View
├── state.js                    Globaler State + Save-Pattern (Debounce + Atomic PUT)
├── modal.js                    openModal / openConfirmModal / openAlertModal
├── admin.js                    "Zugriff verwalten"-Modal (Allowlist-Pflege)
├── palette.js                  34 Muskelgruppen-Farben (hue sweep)
├── util.js                     escape, parseNum, fmt, findMg
├── style.css                   CSS-Vars, Dark + Light Theme
└── views/
    ├── builder.js              Plan-Editor (Sidebar + Day-Columns + DnD + Vergleich + Export + Import-Tab)
    ├── viewer.js               Read-only Trainingsansicht + Set-Tracking
    └── manage.js               CMS für Muskelgruppen + Exercise-Library

server/
├── src/
│   ├── index.js                HTTP-Server, Routen, Per-User-Storage, Bootstrap-Migration
│   ├── auth.js                 OAuth-Wrapper + Session-Sign/Verify + Cookies
│   └── allowlist.js            Allowlist-Modul (File-backed, Cache, Mutex, Admin-Rolle)
├── data/
│   ├── template.json           Read-only Seed-Template (Default-Library + MGs) für neue Nutzer
│   ├── allowlist.json          Allowlist (gitignored, runtime-state)
│   └── users/                  Per-User-Daten <sha256(email)[:16]>.json (gitignored)
├── .env.example                GOOGLE_CLIENT_ID/SECRET, SESSION_SECRET, ALLOWED_EMAILS (Seed)
└── package.json                Einzige Dep: arctic

deploy/
├── setup.md                    Server-Setup, Update-Befehle
├── Caddyfile                   Reverse-Proxy-Block
└── trainingsplan.service       systemd-Unit
```

## Datenmodell

Pro Nutzer eine eigene Datei `server/data/users/<sha256(email)[:16]>.json`. Top-Level-Felder `email` + `createdAt` + `updatedAt` für Debugging/Ownership; der Rest sind die App-Daten dieses Nutzers.

```jsonc
{
  "email": "owner@example.com",
  "createdAt": "ISO",
  "updatedAt": "ISO",                 // wird beim Save server-seitig gestempelt

  "plans": [                          // Trainingspläne (mehrere möglich)
    {
      "id": "p_<8 chars>",
      "name": "Push/Pull/Beine",
      "createdAt": "ISO",
      "updatedAt": "ISO",
      "trainingsPerWeek": 4,          // optional; im Builder & Vergleich genutzt
      "days": [
        {
          "id": "d_<8 chars>",
          "name": "Push",
          "exercises": [
            {
              "id": "e_<8 chars>",
              "name": "Bankdrücken",
              "muscleGroupId": "mg_<8>",
              "sets": 3,                // number | null
              "reps": "8-10",           // string | null
              "weight": "80"            // string | null
            }
          ]
        }
      ]
    }
  ],

  "exerciseLibrary": [                // Übungs-Pool, von dem in Pläne ausgewählt wird
    { "id": "le_<8>", "name": "Bankdrücken", "muscleGroupId": "mg_<8>" }
  ],

  "muscleGroups": [                   // Farb- und Namensregister
    { "id": "mg_<8>", "name": "Brust", "colorKey": "rose" }
  ],

  "activePlanId": "p_<8>",            // aktuell trainierter Plan (Viewer-Default)

  "logs": [                           // Set-Tracking pro Übung pro Tag pro Datum
    {
      "id": "l_<8>",
      "planId": "p_<8>",
      "dayId": "d_<8>",
      "exerciseId": "e_<8>",
      "date": "YYYY-MM-DD",
      "sets": [{ "reps": "8", "weight": "80" }]
    }
  ]
}
```

### Konventionen

- **Identifier:** `shortId(prefix)` aus [public/state.js](public/state.js) — Präfix + 8 random chars (`p_`, `d_`, `e_`, `le_`, `mg_`, `l_`).
- **Logs additive:** Plan bleibt unangetastet beim Tracken. Scope eines Log-Eintrags = `(planId, dayId, exerciseId, date)` — pro Übung und Tag genau einer, beim erneuten Öffnen weiter editiert.
- **muscleGroupId referenziell:** `exerciseLibrary` und `plans[].days[].exercises[]` halten beide eine `muscleGroupId`. Sync zwischen Library und Plan-Instanzen passiert bei Library-Änderungen in [public/views/manage.js](public/views/manage.js) via `syncPlanInstancesMg`.
- **Per-User-Isolation:** Es gibt keinen geteilten globalen State zwischen Nutzern. Jeder hat seine eigene Library + MGs + Pläne + Logs; geseedet aus `template.json` beim ersten Login.

### Migrations-Logik

[server/src/index.js](server/src/index.js):
- **`migratePlans(parsed)`** läuft idempotent bei jedem Read pro User-File. Trägt fehlende Top-Level-Arrays nach, vergibt fehlende IDs, übersetzt Legacy-`muscleGroup`-Namensreferenzen in `muscleGroupId`.
- **`migrateToPerUser()`** läuft einmalig beim Server-Start: verschiebt vorhandene Legacy-`data/plans.json` → `data/users/<owner-hash>.json` (Owner per `MIGRATION_OWNER_EMAIL`-Env, default `jarekgster@googlemail.com`), benennt `data/plan.json` → `data/template.json`. Idempotent.

## Auth-Flow

1. Unauth-Request auf `/` → Redirect `/auth/google`.
2. `arctic` baut Google-Auth-URL, setzt `oauth_state` + `oauth_verifier` als kurzlebige Cookies, redirected zu Google.
3. Google ruft `/auth/google/callback?code=…&state=…` ab.
4. Server vergleicht `state`, ruft `arctic.validateAuthorizationCode()`, decodiert `id_token` → `email`.
5. **Allowlist-Check** über `allowlist.isAllowed(email)`. Nicht-Allowlisted → Interstitial.
6. Bei OK: HMAC-signiertes Session-Cookie `session=<base64url(email|expiry)>.<sig>` mit 30-Tage-TTL, `HttpOnly` + `SameSite=Lax`.

Logout: `POST /auth/logout` → Cookie-Cleanup mit `Max-Age=0`.

**Per-Request-Gate:** Jeder Request auf `/*` (außer `/auth/*`) verifiziert über `getSession()` HMAC + Expiry und prüft zusätzlich `allowlist.isAllowed(session.email)`. Kein gültiges Cookie oder Email nicht mehr in Allowlist → 401 für `/api/*`, sonst Redirect zu `/auth/google`. Defense-in-Depth: ein bestehendes Session-Cookie eines entfernten Nutzers schlägt sofort fehl, nicht erst nach 30 Tagen.

## Allowlist

`server/data/allowlist.json`:

```jsonc
{
  "users": [
    { "email": "owner@…", "isAdmin": true, "addedAt": "ISO", "addedBy": "env" },
    { "email": "friend@…", "isAdmin": false, "addedAt": "ISO", "addedBy": "owner@…" }
  ]
}
```

Seeding: wenn die Datei fehlt, wird sie beim ersten Read aus `ALLOWED_EMAILS`-Env initialisiert (alle Emails als Admin). Danach ist die Env irrelevant — Pflege ausschließlich via UI.

`isAllowed`/`isAdmin`-Checks laden mit In-Memory-Cache, Schreibvorgänge serialisiert über Promise-Chain-Mutex. Letzter Admin kann sich nicht selbst entfernen oder degradieren (Server gibt 400 mit klarer Fehlermeldung). Admin-Pflege via „Zugriff verwalten"-Modal im Profilmenü (siehe UI-Komponenten).

## API

Alle `/api/*` benötigen ein gültiges Session-Cookie + Allowlist-Hit.

| Method   | Pfad                                | Antwort / Auth                                                                 |
|----------|-------------------------------------|--------------------------------------------------------------------------------|
| `GET`    | `/api/me`                           | `{ email, isAdmin }`                                                           |
| `GET`    | `/api/plans`                        | Vollständige User-Datei (`data/users/<hash>.json`) als JSON                    |
| `PUT`    | `/api/plans`                        | Body = vollständiger neuer Blob, `email` + `updatedAt` server-seitig gestempelt, atomar geschrieben, per-User-Mutex. Antwort `204` |
| `GET`    | `/api/admin/allowlist`              | `{ users: [...] }` — **admin-only**, 403 sonst                                 |
| `POST`   | `/api/admin/allowlist`              | Body `{ email, isAdmin }` — fügt neuen User hinzu — **admin-only**             |
| `DELETE` | `/api/admin/allowlist/<email>`      | Entfernt User (last-admin-Schutz) — **admin-only**                             |
| `PATCH`  | `/api/admin/allowlist/<email>`      | Body `{ isAdmin }` — Rolle umschalten (last-admin-Schutz) — **admin-only**     |
| `POST`   | `/auth/logout`                      | Cookie-Cleanup, `{ ok: true }`                                                 |

`GET /*` liefert Files aus `public/` (Path-Traversal blockiert via `path.startsWith(PUBLIC_DIR)`).

## Save-Pattern

Komplett full-blob pro Save-Tick, kein Delta.

1. UI-Handler mutiert `state.plans` in-place.
2. Ruft [`scheduleSavePlans()`](public/state.js) auf.
3. Debounce 600 ms.
4. Bei Tick: `PUT /api/plans` mit `JSON.stringify(state.plans)`.
5. Server resolved `session.email` → User-File, schreibt durch `withUserLock(userKey)` atomar (`temp file + rename`). Cross-User-Writes laufen parallel; Same-User-Writes seriell.
6. Während ein PUT läuft markiert sich ein folgender Tick als `pendingSave`; nach Abschluss läuft genau ein weiterer.
7. Save-Status-Banner (`Änderungen…` / `speichert…` / `gespeichert` / `Fehler`) via Mini-Pub/Sub in `state.js`.

Vorteile: trivial, keine Konflikte mit eigenen vorherigen Saves; Per-User-Mutex schützt vor Phone+Laptop-Races. Nachteil: konkurrierende Tabs **desselben Nutzers** sehen Last-Write-Wins (akzeptabel solo).

## Views

Eine SPA, kein Router. Drei Mode-Strings in `state.mode`:

- `view` — [public/views/viewer.js](public/views/viewer.js): read-only Trainings-Ansicht, Sets pro Übung tracken.
- `edit` — [public/views/builder.js](public/views/builder.js): Plan-Editor mit Sidebar (Plan-Liste, Vergleichen-Button) und Day-Columns (DnD horizontal für Tage, vertikal für Übungen).
- `manage` — [public/views/manage.js](public/views/manage.js): CMS für Muskelgruppen + Exercise-Library.

Mode-Wechsel über die runden Icon-Buttons im Header (Cog für Verwaltung, Check/Pencil für View↔Edit).

## UI-Komponenten

- **Modal-System** ([public/modal.js](public/modal.js)): `openModal({ title, body, onConfirm, confirmLabel })` plus `openConfirmModal` (Danger-Button) und `openAlertModal` (OK-only).
- **Profile-Menu** ([public/app.js](public/app.js)): rundes Avatar-Element rechts im Header (Initiale aus Email). Klick öffnet Popover mit Email-Header, Theme-Toggle (Sun/Moon + „Hell"/„Dunkel"), für Admins „Zugriff verwalten", Separator, „Abmelden" (rot).
- **Allowlist-Admin** ([public/admin.js](public/admin.js)): Modal mit Counter-Zeile, User-Liste (Row pro User: Email + „du"-Pille + Admin-Badge + Kebab-Menü mit Admin-Toggle und Entfernen), Add-Form unten.
- **Drag & Drop:** native HTML5, kein SortableJS. Drag-Handle (`⋮⋮`), `state.builderDragging = { type: 'exercise' | 'day', … }`. Auto-Scroll-Loop für Day-Columns (vertikal) + Builder-Board (horizontal).
- **Volumen-Bar:** im Builder oberhalb der Days. Summiert Sätze pro MG, normalisiert nach `trainingsPerWeek / planDays`.
- **Plan-Vergleich:** Modal aus Sidebar, multi-Plan-Auswahl, Tabelle MG × Plan, Diff-Hervorhebung höher/niedriger.
- **Plan-Export:** Modal aus Plan-Menü, Tabs WhatsApp / Markdown / JSON; Clipboard + Download als `.txt`/`.md`/`.json`.
- **Plan-Import:** zweiter Tab im „+ Neuer Plan"-Dialog. Validierung gegen `kind: "trainingsplan/plan/v1"`, Name-Match-Resolver für Muskelgruppen (unbekannte werden neu angelegt mit korrektem `colorKey`, Library bleibt unverändert).
- **Farb-System:** [public/palette.js](public/palette.js) definiert 34 hue-sortierte Keys. CSS-Selektoren `[data-mg-color="<key>"]` in [public/style.css](public/style.css) für Dark- und Light-Theme.

## Konfiguration (`.env`)

```env
GOOGLE_CLIENT_ID=…
GOOGLE_CLIENT_SECRET=…
GOOGLE_REDIRECT_URI=http://localhost:5173/auth/google/callback
SESSION_SECRET=<random ≥32 chars>
ALLOWED_EMAILS=jarekgster@googlemail.com,friend@example.com
COOKIE_SECURE=false   # in production unset → default true
PORT=5173             # optional
MIGRATION_OWNER_EMAIL=… # optional, default jarekgster@googlemail.com
```

`ALLOWED_EMAILS` ist nur der **Seed**: wenn `server/data/allowlist.json` fehlt, wird sie aus dieser Variable initialisiert (alle Emails als Admin). Danach wird die Datei zum Source-of-Truth, gepflegt via „Zugriff verwalten"-Modal im Profilmenü; die Env-Variable ist dann irrelevant.

## Deployment

Domain `trainingsplan.karateabfahrt.de` auf einem Hetzner-VPS (geteilt mit elle-eats), Caddy als TLS-terminierender Reverse-Proxy, systemd-Unit `trainingsplan.service` als Service-User `trainingsplan`. Datenpfad: `/srv/trainingsplan/app/server/data/users/` (+ `allowlist.json` + `template.json`). Updates: siehe [deploy/setup.md](../deploy/setup.md).

---

# Künftige Ideen / TODOs

Geordnete Backlog-Liste. Nicht alle Punkte werden umgesetzt — die Liste hält Optionen sichtbar.

## Mittelfristig

### Workout-History / Logs-Auswertung
Die `logs[]`-Daten werden heute nur für die „letztes Mal"-Anzeige im Viewer genutzt. Mögliche Auswertungen:
- Volumen-Trend pro Muskelgruppe über Wochen (Sparkline pro MG).
- PR-Tracking: max `weight × reps` pro Übung, Anzeige im Builder neben dem Eingabefeld.
- Trainings-Frequenz: wie oft wurde Plan X tatsächlich gemacht (vs `trainingsPerWeek`).
- Heatmap-Kalender der trainierten Tage.

Mit JSON pro Nutzer reicht clientseitige Filterung; ab spürbarem Lag → SQLite.

### SQLite-Migration
Wenn Cross-Time-Queries auf Logs ausbremsen oder ein Mehrwert klar wird (Reporting, Cross-User-Stats, Backup-Recovery-Komfort). Plan: `better-sqlite3` (single native binary, gut maintained), Schema in `server/src/db/schema.sql`, Migration-Skript liest alle `users/*.json` und füllt Tabellen `users / muscle_groups / exercise_library / plans / days / exercises / logs`. Frontend wechselt von „PUT ganzer Blob" auf REST-Endpunkte pro Entität (`PATCH /api/plans/:id`, `POST /api/logs`, …). Größenordnung 1-2 PRs.

### Plan-Sharing v2
MVP heute = Export-JSON kopieren + Import. Echte Share-Links wären:
- Owner generiert einen Token (`POST /api/plans/:id/share`) → URL `https://…/share/<token>`.
- Empfänger öffnet Link → sieht read-only Vorschau, kann „in meine Pläne klonen".
- Token-Tabelle/Datei mit Owner, planId, expiresAt.
- Optional: per-Token Sicht-Permissions (nur Plan vs. Plan + bisherige Logs).

Erst sinnvoll wenn echte Nutzer-Community besteht.

### Account-Selfservice
- „Meine Daten exportieren" → ZIP aller User-JSON-Dateien (DSGVO-freundlich).
- „Account löschen" → File-Delete `users/<hash>.json` + Logout. Mit Bestätigungs-Dialog.

### Self-Service-Request-Flow für die Allowlist
Statt Email-Adressen manuell eintragen: Friends versuchen Login → „Zugriff angefordert"-Screen. Admins sehen Pending-Requests im Admin-UI und approven per Klick. Reduziert Hürde, Friend muss dir nicht erst die Email durchgeben.

### Touch-DnD für Mobile
HTML5-DnD funktioniert nicht auf Touch-Devices. Aktuell ist die App desktop-first. Wenn Mobile relevant wird: Pointer-Events-basierter Custom-DnD oder eine bestehende Lib (SortableJS). Aus dem CLAUDE.md-Out-of-Scope rausnehmen.

## Klein & Nice-to-have

- **Pre-Fill der letzten Werte beim Tracken:** ist teilweise da; klar machen welche Quelle.
- **Bulk-Edit im Manage-View:** mehrere Library-Übungen einer Muskelgruppe zuweisen.
- **Plan-Snapshots / Versionen:** „Plan einfrieren als v1.0" für Vergleiche über Trainings-Blöcke hinweg.
- **Akkumulationsblöcke / Periodisierung:** mehrere Wochen-Pläne hintereinander schalten. (CLAUDE.md aktuell out-of-scope.)
- **Übungs-Notes:** Freitext-Feld pro Übung (Setup-Hinweise, Tempo, etc.).
- **Backup-Job:** systemd-timer der `data/users/` täglich tar+gz nach einem Backup-Pfad rotiert.

## Hygiene

- Logs-Rotation / Größen-Monitoring sobald History-Feature live ist.
- Legacy `server/data/plans.json` final aus dem git-Tracking nehmen (`git rm`) sobald alle Deploys verifiziert migriert sind.
