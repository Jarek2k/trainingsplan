# Trainingsplan — Hinweise für Claude

Lokale Single-User-Web-App zum Erstellen und Verwalten wöchentlicher Trainingspläne. Ein Plan = eine Trainingswoche mit bis zu 7 Trainingstagen.

## Tech-Stack

- **Frontend:** Vanilla HTML / CSS / JS als ES-Module. Kein Framework, kein Build-Step, kein Bundler.
- **Backend:** Node.js native `http`. Einzige Dependency: `arctic` (Google OAuth).
- **Persistenz:** JSON-Datei (`server/data/plans.json`), atomar geschrieben via `PUT /api/plans`.
- **Auth:** Google OAuth gated den gesamten Zugriff. Allowlist via `ALLOWED_EMAILS` in `.env`. Session = HMAC-signiertes Cookie (30 Tage).

## Architektur

```
public/                      Statisches Frontend (kein Build-Step)
├── index.html              Shell (Header + main)
├── style.css               CSS-Variablen, Dark + Light Theme
├── app.js                  Bootstrap (lädt plans.json, rendert Builder)
├── state.js                Globaler State + Save-Pattern (Debounce + atomic PUT)
├── util.js                 Helper (escape, parseNum, fmt)
└── views/builder.js        Builder-View: Sidebar + Plan-Editor + DnD

server/                      Autarkes Backend-Sub-Projekt (eigene package.json)
├── src/
│   ├── index.js            Auth-Gate + Static-Fileserver + /api/plans GET/PUT
│   └── auth.js             Google OAuth + HMAC-Session-Cookie + Cookie-Helper
├── data/
│   ├── plans.json          Live-Daten (Pläne, Library, Muskelgruppen)
│   └── plan.json           Read-only Seed für die initiale Library
├── .env                    Lokal, gitignored (siehe .env.example)
└── package.json            Server-Deps (arctic)

deploy/                      Production-Deploy-Artefakte (Hetzner + Caddy + systemd)
├── setup.md                Schritt-für-Schritt-Anleitung
├── Caddyfile               Reverse-Proxy-Block für trainingsplan.karateabfahrt.de
└── trainingsplan.service   systemd-Unit
```

Es gibt nur **eine** View (`builder`). Kein Router.

## Datenmodell (`data/plans.json`)

```json
{
  "plans": [
    {
      "id": "p_<random>",
      "name": "Push/Pull/Beine",
      "createdAt": "ISO-Datum",
      "updatedAt": "ISO-Datum",
      "days": [
        {
          "id": "d_<random>",
          "name": "Push",
          "exercises": [
            {
              "id": "e_<random>",
              "name": "Bankdrücken",
              "muscleGroup": "Brust",
              "sets": null,        // number | null
              "reps": null,        // string | null  (z.B. "8-10")
              "weight": null       // string | null  (z.B. "80")
            }
          ]
        }
      ]
    }
  ],
  "exerciseLibrary": [{ "name": "...", "muscleGroup": "..." }],
  "muscleGroups":    [{ "name": "Brust" }]
}
```

Wenn `plans.json` fehlt, seedet der Server `exerciseLibrary` + `muscleGroups` aus `server/data/plan.json` und legt eine leere `plans`-Liste an.

## Konventionen

- **Identifier im Code englisch**, **UI-Texte deutsch**.
- **Dependencies sparsam** — aktuell nur `arctic`. Neue Deps nur nach Rücksprache.
- **Save-Pattern:** State in-place mutieren, dann `scheduleSavePlans()` (Debounce 600 ms).
- **IDs:** kurze Random-Strings via `shortId(prefix)` aus `state.js` (`p_`, `d_`, `e_`).
- **Drag & Drop:** native HTML5, kein SortableJS.
- **Mobile:** nicht der primäre Use-Case. Desktop-First.
- **Muskelgruppen-Farben:** in `style.css` als `data-mg="<Name>"`-Selektoren (exakte Namen aus `muscleGroups`).

## Setup / Run

Alle Server-Kommandos laufen aus `server/`:

```sh
cd server
cp .env.example .env   # Werte eintragen (Google Client + ALLOWED_EMAILS + SESSION_SECRET)
npm install
npm run dev            # node --env-file=.env --watch src/index.js
npm start              # plain run
# -> http://localhost:5173
```

Google OAuth: in der Cloud Console eine OAuth-Client-ID (Web application) anlegen, Redirect-URI `http://localhost:5173/auth/google/callback` eintragen.

## Out of scope (bis weitere Anweisung)

- Mehrwöchige Pläne / Akkumulationsblöcke
- Mobile-optimiertes Drag & Drop (Touch)
- Multi-User (Auth ist nur Zugangs-Gate, keine User-spezifischen Daten)
- Build-Pipeline / Bundler

## Deploy

Hetzner-Server (geteilt mit elle-eats), Caddy als Reverse-Proxy, systemd als Service-Manager. Domain: `trainingsplan.karateabfahrt.de`. Anleitung: [`deploy/setup.md`](deploy/setup.md).
