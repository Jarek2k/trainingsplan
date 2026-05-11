# Trainingsplan

Lokale Web-App zum Erstellen und Verwalten wöchentlicher Trainingspläne.

Ein Plan besteht aus bis zu 7 Trainingstagen (nicht an Kalendertage gebunden). Pro Tag eine Liste von Übungen mit Sätzen, Wiederholungen und Gewicht — alle Felder optional. Mehrere Pläne nebeneinander speicherbar, kopierbar, löschbar.

## Stack

- **Frontend:** Vanilla HTML / CSS / JS (ES-Module). Kein Framework, kein Build-Step.
- **Backend:** Node.js native `http`, einzige Dependency: `arctic` (Google OAuth).
- **Speicher:** `server/data/plans.json`, atomar gespeichert via `PUT /api/plans`.
- **Auth:** Google OAuth gated den Zugang; Allowlist per `ALLOWED_EMAILS` in `server/.env`.

## Setup

Alle Server-Kommandos laufen aus `server/`:

```sh
cd server
cp .env.example .env
# .env füllen: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SESSION_SECRET (z. B. openssl rand -hex 32), ALLOWED_EMAILS
npm install
```

Google Cloud Console → OAuth-Client-ID (Web application), Redirect-URI `http://localhost:5173/auth/google/callback`.

## Run

```sh
cd server
npm run dev      # node --env-file=.env --watch — Auto-Reload bei Code-Änderung
npm start        # einfach starten
# -> http://localhost:5173
```

## Features

- **Plan-Verwaltung:** Pläne anlegen, umbenennen, kopieren, löschen (Sidebar links).
- **Tag-Spalten:** Tage nebeneinander als Agenda. Pro Tag eine Liste Übungs-Kästen.
- **Übungen:** Aus vorgepflegter Library auswählen (Suche + Muskelgruppen-Filter) oder eigene anlegen — neue Library-Einträge bleiben verfügbar.
- **Farbcodierung:** Übungs-Kästen sind nach Muskelgruppe eingefärbt (Brust, Rücken, Schulter, Bizeps, Trizeps, Beine, Bauch, …).
- **Drag & Drop:** Übungen innerhalb eines Tages umsortieren oder in einen anderen Tag verschieben.

## Datenmodell

`server/data/plans.json`:

```json
{
  "plans": [
    {
      "id": "p_...",
      "name": "Push/Pull/Beine",
      "createdAt": "ISO-Datum",
      "updatedAt": "ISO-Datum",
      "days": [
        {
          "id": "d_...",
          "name": "Push",
          "exercises": [
            { "id": "e_...", "name": "Bankdrücken", "muscleGroup": "Brust",
              "sets": 3, "reps": "8-10", "weight": "80" }
          ]
        }
      ]
    }
  ],
  "exerciseLibrary": [{ "name": "...", "muscleGroup": "..." }],
  "muscleGroups":    [{ "name": "Brust" }]
}
```

`server/data/plan.json` ist ein read-only Seed: fehlt `plans.json`, wird die Library + Muskelgruppen daraus initialisiert.

## Layout

```
public/                  Statisches Frontend (kein Build-Step)
├── index.html
├── style.css
├── app.js               Bootstrap
├── state.js             Globaler State + Save-Pattern
├── util.js              Helper
└── views/builder.js     Builder-View (Sidebar + Editor + DnD)

server/                  Autarkes Backend-Sub-Projekt
├── src/
│   ├── index.js         Auth-Gate + Static-Fileserver + /api/plans
│   └── auth.js          Google OAuth + Session-Cookie + Cookie-Helper
├── data/
│   ├── plans.json       Live-Daten
│   └── plan.json        Seed (read-only)
├── .env                 Lokale Secrets (gitignored, siehe .env.example)
└── package.json
```

## Stand

Lokal, Single-User-Daten hinter Google-Login-Gate. Kein Hosting, keine Mehrwochen-Pläne. Mobile-Bedienung ist nicht primärer Fokus — Desktop-First.
