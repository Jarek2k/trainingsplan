// Bootstrap. The app is the Builder — no routing, no other views.

import { loadPlans, onSaveStatus } from "./state.js";
import { escape } from "./util.js";
import * as builderView from "./views/builder.js";

function wireSaveStatus() {
  const el = document.getElementById("save-status");
  onSaveStatus((text, cls) => {
    el.textContent = text;
    el.className = `save-status ${cls || ""}`;
  });
}

loadPlans()
  .then(() => {
    wireSaveStatus();
    builderView.render(document.getElementById("main"));
  })
  .catch((err) => {
    console.error(err);
    document.getElementById("main").innerHTML =
      `<p class="error">Konnte Pläne nicht laden: ${escape(err.message)}</p>`;
  });
