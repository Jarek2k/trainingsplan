# Architecture — Ist-Stand

Snapshot des aktuellen Aufbaus. Stand: 2026-05-15.

## Überblick

Lokale Single-User-Web-App zum Erstellen, Verwalten und Vergleichen wöchentlicher Trainingspläne. Vanilla-Frontend ohne Build-Step, Node-`http`-Backend ohne Framework, Persistenz als atomar geschriebene JSON-Datei. Zugang per Google OAuth gegen eine Allowlist.

```
public/   →  Statisches Frontend (ES-Module, kein Bundler)
server/   →  Node-Backend (auth.js + index.js, einzige Dep: arctic)
deploy/   →  Hetzner + Caddy + systemd
doc/      →  Diese Dokumentation
```

## Tech-Stack

| Layer       | Stack                                                        |
|-------------|--------------------------------------------------------------|
| Frontend    | HTML, CSS, Vanilla-JS ES-Module, kein Build-Step             |
| Backend     | Node.js native [`http`](server/src/index.js) (kein Express)  |
| OAuth       | [`arctic`](https://github.com/pilcrowOnPaper/arctic) (Google) |
| Session     | HMAC-signiertes Cookie (SHA-256, `SESSION_SECRET`)           |
| Persistenz  | JSON-Datei `server/data/plans.json`, atomic write            |
| Deployment  | Hetzner-VPS, Caddy als Reverse-Proxy, systemd-Unit           |

## Repo-Layout

```
public/
├── index.html                  Shell (Header + main)
├── app.js                      Bootstrap: lädt Plans + rendert View
├── state.js                    Globaler State + Save-Pattern
├── modal.js                    openModal / openConfirmModal / openAlertModal
├── palette.js                  34 Muskelgruppen-Farben (hue sweep)
├── util.js                     escape, parseNum, fmt, findMg
├── style.css                   CSS-Vars, Dark + Light Theme
└── views/
    ├── builder.js              Plan-Editor (Sidebar + Day-Columns + DnD)
    ├── viewer.js               Read-only Trainingsansicht + Set-Tracking
    └── manage.js               CMS für Muskelgruppen + Exercise-Library

server/
├── src/
│   ├── index.js                HTTP-Server, Routen, Auth-Gate, JSON-IO
│   └── auth.js                 OAuth-Wrapper + Session-Sign/Verify + Cookies
├── data/
│   ├── plans.json              Live-Daten (Pläne + Library + MGs + Logs)
│   └── plan.json               Read-only Seed-Template (Default-Library)
├── .env.example                GOOGLE_CLIENT_ID/SECRET, SESSION_SECRET, ALLOWED_EMAILS
└── package.json                Einzige Dep: arctic

deploy/
├── setup.md                    Server-Setup, Update-Befehle
├── Caddyfile                   Reverse-Proxy-Block
└── trainingsplan.service       systemd-Unit
```

## Datenmodell

Eine flache JSON-Datei. Alle Top-Level-Keys sind global, kein User-Scope.

```jsonc
{
  "plans": [                     // Trainingspläne (mehrere möglich)
    {
      "id": "p_<8 chars>",
      "name": "Push/Pull/Beine",
      "createdAt": "ISO",
      "updatedAt": "ISO",
      "trainingsPerWeek": 4,     // optional; im Builder & Vergleich genutzt
      "days": [
        {
          "id": "d_<8 chars>",
          "name": "Push",
          "exercises": [
            {
              "id": "e_<8 chars>",
              "name": "Bankdrücken",
              "muscleGroupId": "mg_<8>",
              "sets": 3,           // number | null
              "reps": "8-10",      // string | null
              "weight": "80"       // string | null
            }
          ]
        }
      ]
    }
  ],

  "exerciseLibrary": [           // Übungs-Pool, von dem in Pläne ausgewählt wird
    {
      "id": "le_<8>",
      "name": "Bankdrücken",
      "muscleGroupId": "mg_<8>"   // nullable
    }
  ],

  "muscleGroups": [              // Farb- und Namensregister
    {
      "id": "mg_<8>",
      "name": "Brust",
      "colorKey": "rose"          // Schlüssel aus public/palette.js
    }
  ],

  "activePlanId": "p_<8>",       // der aktuell trainierte Plan (Viewer-Default)

  "logs": [                      // Set-Tracking pro Übung pro Tag pro Datum
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

### Migrations-Logik

[server/src/index.js](server/src/index.js) — `migratePlans()` läuft idempotent bei jedem Read. Trägt fehlende Top-Level-Arrays nach, vergibt fehlende IDs, übersetzt Legacy-`muscleGroup`-Namensreferenzen in `muscleGroupId`. Bei erstem Start ohne `plans.json` wird aus `plan.json` (Library + MGs) geseedet.

## Auth-Flow

1. Unauth-Request auf `/` → Redirect `/auth/google` ([server/src/index.js:309](server/src/index.js)).
2. `arctic` baut Google-Auth-URL, setzt `oauth_state` + `oauth_verifier` als kurzlebige Cookies, redirected zu Google.
3. Google ruft `/auth/google/callback?code=…&state=…` ab.
4. Server vergleicht `state`, ruft `arctic.validateAuthorizationCode()`, decodiert `id_token` → `email`.
5. **Allowlist-Check** (siehe Abschnitt unten). Nicht-Allowlisted → Interstitial.
6. Bei OK: HMAC-signiertes Session-Cookie `session=<base64url(email|expiry)>.<sig>` mit 30-Tage-TTL, `HttpOnly` + `SameSite=Lax`.

Logout: `POST /auth/logout` → Cookie-Cleanup mit `Max-Age=0`.

**Per-Request-Gate:** [server/src/index.js:368](server/src/index.js) — `getSession()` verifiziert HMAC + Expiry. Kein gültiges Cookie → 401 für `/api/*`, sonst Redirect zu `/auth/google`.

Der Allowlist-Check läuft sowohl am OAuth-Callback als auch auf **jedem** `/api/*`-Call (Defense-in-Depth). Ein bestehendes Session-Cookie eines aus der Allowlist entfernten Nutzers schlägt sofort fehl, nicht erst nach 30 Tagen.

## API

Alle `/api/*` benötigen ein gültiges Session-Cookie.

| Method | Pfad                  | Antwort                                              |
|--------|-----------------------|------------------------------------------------------|
| `GET`  | `/api/me`             | `{ email }`                                          |
| `GET`  | `/api/plans`          | Vollständiger Inhalt von `data/plans.json` (JSON)    |
| `PUT`  | `/api/plans`          | Body = vollständige neue `plans.json`, atomar geschrieben. Antwort `204 No Content` |
| `POST` | `/auth/logout`        | Cookie-Cleanup, `{ ok: true }`                       |

`GET /*` liefert Files aus `public/` (Path-Traversal blockiert via `path.startsWith(PUBLIC_DIR)`).

## Save-Pattern

Komplett full-blob, kein Delta.

1. UI-Handler mutiert `state.plans` in-place.
2. Ruft [`scheduleSavePlans()`](public/state.js) auf.
3. Debounce 600 ms.
4. Bei Tick: `PUT /api/plans` mit `JSON.stringify(state.plans)`.
5. Server überschreibt `plans.json` atomar (`temp file + rename`).
6. Während ein PUT läuft markiert sich ein folgender Tick als `pendingSave`; nach Abschluss läuft genau ein weiterer.
7. Save-Status-Banner (`Änderungen…` / `speichert…` / `gespeichert` / `Fehler`) via Mini-Pub/Sub in `state.js`.

Vorteile: trivial, keine Konflikte mit eigenen vorherigen Saves. Nachteil: konkurrierende Tabs überschreiben sich gegenseitig (Last-Write-Wins).

## Views

Eine SPA, kein Router. Drei Mode-Strings in `state.mode`:

- `view` — [public/views/viewer.js](public/views/viewer.js): read-only Trainings-Ansicht, Sets pro Übung tracken.
- `edit` — [public/views/builder.js](public/views/builder.js): Plan-Editor mit Sidebar (Plan-Liste, Vergleichen-Button) und Day-Columns (DnD horizontal für Tage, vertikal für Übungen).
- `manage` — [public/views/manage.js](public/views/manage.js): CMS für Muskelgruppen + Exercise-Library.

Mode-Wechsel über die runden Icon-Buttons im Header (Cog / Pencil / Check).

## UI-Komponenten

- **Modal-System** ([public/modal.js](public/modal.js)): `openModal({ title, body, onConfirm, confirmLabel })` plus zwei Helpers `openConfirmModal` (Danger-Button) und `openAlertModal` (OK-only).
- **Drag & Drop:** native HTML5, kein SortableJS. Drag-Handle (`⋮⋮`), `state.builderDragging = { type: 'exercise' | 'day', … }`. Auto-Scroll-Loop für Day-Columns (vertikal) + Builder-Board (horizontal).
- **Volumen-Bar:** im Builder oberhalb der Days. Summiert Sätze pro MG, normalisiert nach `trainingsPerWeek / planDays`.
- **Plan-Vergleich:** Modal aus Sidebar, multi-Plan-Auswahl, Tabelle MG × Plan, Diff-Hervorhebung höher/niedriger.
- **Plan-Export:** Modal aus Plan-Menü, Tabs WhatsApp / Markdown / JSON; Clipboard + Download als `.txt`/`.md`/`.json`.
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
```

`ALLOWED_EMAILS` ist nur der Seed: wenn `server/data/allowlist.json` fehlt, wird sie aus dieser Variable initialisiert (alle Emails als Admin). Danach wird die Datei zum Source-of-Truth, gepflegt via „Zugriff verwalten"-Modal im Profilmenü; die Env-Variable ist dann irrelevant.

## Allowlist

```jsonc
// server/data/allowlist.json
{
  "users": [
    { "email": "owner@…", "isAdmin": true, "addedAt": "ISO", "addedBy": "env" },
    { "email": "friend@…", "isAdmin": false, "addedAt": "ISO", "addedBy": "owner@…" }
  ]
}
```

`isAllowed`/`isAdmin`-Checks laden mit In-Memory-Cache, Schreibvorgänge serialisiert über Promise-Chain-Mutex. Letzter Admin kann sich nicht selbst löschen oder degradieren. API: `GET/POST/DELETE/PATCH /api/admin/allowlist[/<email>]`, alle admin-gated.

## Deployment

Domain `trainingsplan.karateabfahrt.de` auf einem Hetzner-VPS (geteilt mit elle-eats), Caddy als TLS-terminierender Reverse-Proxy, systemd-Unit `trainingsplan.service` als Service-User `trainingsplan`. Datenpfad: `/srv/trainingsplan/app/server/data/plans.json`. Updates: siehe [deploy/setup.md](../deploy/setup.md).

---

# Künftige Ideen / TODOs

Geordnete Backlog-Liste. Nicht alle Punkte werden umgesetzt — die Liste hält Optionen sichtbar.

## Demnächst (im Plan)

### Multi-User-Migration (PR 1)
Datei pro Nutzer unter `server/data/users/<sha256(email)[:16]>.json`. Session-Email zu UserKey auflösen, Per-User-Write-Mutex (Map<userKey, Promise>) gegen Race Conditions in konkurrierenden Tabs desselben Nutzers. Neuer Nutzer → Seed aus `server/data/template.json` (Default-Library + Default-MGs). Allowlist-Defense-in-Depth: jeder API-Call validiert die Session-Email zusätzlich gegen `ALLOWED_EMAILS`. Migration einmalig: bestehende `plans.json` → `users/<owner-hash>.json`, `plan.json` → `template.json`. Frontend unverändert.

### Plan-Import (PR 2)
Gegenstück zu Export. Modal aus Sidebar-Plan-Menü ("Importieren"). Textarea + Datei-Upload. Validierung gegen `kind: "trainingsplan/plan/v1"`. Name-Match-Resolver für Muskelgruppen (case-insensitive trim): existiert beim Empfänger eine MG mit gleichem Namen → reuse `mg.id`; sonst neu anlegen mit importiertem `name` + `colorKey`. Plan/Tage/Übungen mit frischen `shortId`s. Library bleibt unangetastet.

### User-Indikator im Header (PR 3)
Aktuell eingeloggter Account ist im UI unsichtbar. Avatar/Email-Pille + Logout im Header — wichtig sobald mehrere Nutzer auf demselben Browser umschalten.

## Mittelfristig

### Workout-History / Logs-Auswertung
Die `logs[]`-Daten werden heute nur für die "letztes Mal"-Anzeige im Viewer genutzt. Mögliche Auswertungen:
- Volumen-Trend pro Muskelgruppe über Wochen (Sparkline pro MG).
- PR-Tracking: max `weight × reps` pro Übung, Anzeige im Builder neben dem Eingabefeld.
- Trainings-Frequenz: wie oft wurde Plan X tatsächlich gemacht (vs `trainingsPerWeek`).
- Heatmap-Kalender der trainierten Tage.

Mit JSON pro Nutzer reicht clientseitige Filterung; ab spürbarem Lag → SQLite.

### SQLite-Migration (PR 4)
Wenn Cross-Time-Queries auf Logs ausbremsen oder ein Mehrwert klar wird (Reporting, Cross-User-Stats, Backup-Recovery-Komfort). Plan: `better-sqlite3` (single native binary, gut maintained), Schema in `server/src/db/schema.sql`, Migration-Skript liest alle `users/*.json` und füllt Tabellen `users / muscle_groups / exercise_library / plans / days / exercises / logs`. Frontend wechselt von "PUT ganzer Blob" auf REST-Endpunkte pro Entität (`PATCH /api/plans/:id`, `POST /api/logs`, …). Größenordnung 1-2 PRs.

### Plan-Sharing v2
MVP heute = Export-JSON kopieren + Import. Echte Share-Links wären:
- Owner generiert einen Token (`POST /api/plans/:id/share`) → URL `https://…/share/<token>`.
- Empfänger öffnet Link → sieht read-only Vorschau, kann "in meine Pläne klonen".
- Token-Tabelle/Datei mit Owner, planId, expiresAt.
- Optional: per-Token Sicht-Permissions (nur Plan vs. Plan + bisherige Logs).

Erst sinnvoll wenn echte Nutzer-Community besteht.

### Account-Selfservice
- "Meine Daten exportieren" → ZIP aller User-JSON-Dateien (DSGVO-freundlich).
- "Account löschen" → File-Delete `users/<hash>.json` + Logout. Mit Bestätigungs-Dialog.

### Touch-DnD für Mobile
HTML5-DnD funktioniert nicht auf Touch-Devices. Aktuell ist die App desktop-first. Wenn Mobile relevant wird: Pointer-Events-basierter Custom-DnD oder eine bestehende Lib (SortableJS). Aus dem CLAUDE.md-Out-of-Scope rausnehmen.

## Klein & Nice-to-have

- **Pre-Fill der letzten Werte beim Tracken:** ist teilweise da; klar machen welche Quelle.
- **Bulk-Edit im Manage-View:** mehrere Library-Übungen einer Muskelgruppe zuweisen.
- **Plan-Snapshots / Versionen:** "Plan einfrieren als v1.0" für Vergleiche über Trainings-Blöcke hinweg.
- **Akkumulationsblöcke / Periodisierung:** mehrere Wochen-Pläne hintereinander schalten. (CLAUDE.md aktuell out-of-scope.)
- **Übungs-Notes:** Freitext-Feld pro Übung (Setup-Hinweise, Tempo, etc.).
- **Backup-Job:** systemd-timer der `data/users/` täglich tar+gz nach einem Backup-Pfad rotiert.

## Hygiene

- `deploy/setup.md` updaten sobald Datenpfad pro Nutzer aufgeteilt ist (Backup-Hinweis).
- Logs-Rotation / Größen-Monitoring sobald History-Feature live ist.
