# Trainingsplan — Hinweise für Claude

Lokale Single-User-Web-App zum Erstellen und Verwalten wöchentlicher Trainingspläne. Ein Plan = eine Trainingswoche mit bis zu 7 Trainingstagen.

## Tech-Stack

- **Frontend:** Vanilla HTML / CSS / JS als ES-Module. Kein Framework, kein Build-Step, kein Bundler.
- **Backend:** Node.js native `http`. Zero Dependencies.
- **Persistenz:** JSON-Datei (`data/plans.json`), atomar geschrieben via `PUT /api/plans`.

## Architektur

```
server.js                    Static-Fileserver + /api/plans GET/PUT
data/
├── plans.json              Live-Daten (Pläne, Library, Muskelgruppen)
└── plan.json               Read-only Seed für die initiale Library
public/
├── index.html              Shell (Header + main)
├── style.css               Dark-Theme, CSS-Variablen
├── app.js                  Bootstrap (lädt plans.json, rendert Builder)
├── state.js                Globaler State + Save-Pattern (Debounce + atomic PUT)
├── util.js                 Helper (escape, parseNum, fmt)
└── views/builder.js        Builder-View: Sidebar + Plan-Editor + DnD
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

Wenn `plans.json` fehlt, seedet `server.js` `exerciseLibrary` + `muscleGroups` aus `data/plan.json` und legt eine leere `plans`-Liste an.

## Konventionen

- **Identifier im Code englisch**, **UI-Texte deutsch**.
- **Keine Dependencies** — wenn etwas nicht ohne lib geht, vorher fragen.
- **Save-Pattern:** State in-place mutieren, dann `scheduleSavePlans()` (Debounce 600 ms).
- **IDs:** kurze Random-Strings via `shortId(prefix)` aus `state.js` (`p_`, `d_`, `e_`).
- **Drag & Drop:** native HTML5, kein SortableJS.
- **Mobile:** nicht der primäre Use-Case. Desktop-First.
- **Muskelgruppen-Farben:** in `style.css` als `data-mg="<Name>"`-Selektoren (exakte Namen aus `muscleGroups`).

## Setup / Run

```sh
npm run dev    # node --watch — Auto-Reload bei Code-Änderung
npm start      # plain run
# -> http://localhost:5173
```

## Out of scope (bis weitere Anweisung)

- Mehrwöchige Pläne / Akkumulationsblöcke
- Mobile-optimiertes Drag & Drop (Touch)
- Auth / Multi-User
- Build-Pipeline / Bundler
- Hosting / Deployment
