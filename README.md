# Trainingsplan

Lokale Web-App zum Erstellen und Verwalten wöchentlicher Trainingspläne.

Ein Plan besteht aus bis zu 7 Trainingstagen (nicht an Kalendertage gebunden). Pro Tag eine Liste von Übungen mit Sätzen, Wiederholungen und Gewicht — alle Felder optional. Mehrere Pläne nebeneinander speicherbar, kopierbar, löschbar.

## Stack

- **Frontend:** Vanilla HTML / CSS / JS (ES-Module). Kein Framework, kein Build-Step.
- **Backend:** Node.js native `http`, zero dependencies.
- **Speicher:** `data/plans.json`, atomar gespeichert via `PUT /api/plans`.

## Run

```sh
npm run dev      # node --watch — Auto-Reload bei Code-Änderung
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

`data/plans.json`:

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

`data/plan.json` ist ein read-only Seed: fehlt `plans.json`, wird die Library + Muskelgruppen daraus initialisiert.

## Layout

```
server.js                Static-Fileserver + /api/plans
data/plans.json          Live-Daten
data/plan.json           Seed (read-only)
public/
├── index.html
├── style.css
├── app.js               Bootstrap
├── state.js             Globaler State + Save-Pattern
├── util.js              Helper
└── views/builder.js     Builder-View (Sidebar + Editor + DnD)
```

## Stand

Single-User, lokal. Kein Auth, kein Hosting, keine Mehrwochen-Pläne. Mobile-Bedienung ist nicht primärer Fokus — Desktop-First.
