// Bootstrap. Renders either the read-only Viewer (default) or the Builder
// (edit mode), based on state.mode. Mode is in-memory only — every reload
// starts in "view" so the training screen is what's visible.

import {
  getTheme,
  loadPlans,
  onSaveStatus,
  setMode,
  setTheme,
  state,
} from "./state.js";
import { escape } from "./util.js";
import * as builderView from "./views/builder.js";
import * as viewerView from "./views/viewer.js";

function wireSaveStatus() {
  const el = document.getElementById("save-status");
  onSaveStatus((text, cls) => {
    el.textContent = text;
    el.className = `save-status ${cls || ""}`;
  });
}

function wireThemeToggle() {
  const btn = document.getElementById("theme-toggle");
  const refresh = () => {
    const light = getTheme() === "light";
    btn.textContent = light ? "☾" : "☀";
    btn.setAttribute(
      "aria-label",
      light ? "Zu Dunkelmodus wechseln" : "Zu Hellmodus wechseln",
    );
    btn.title = btn.getAttribute("aria-label");
  };
  btn.addEventListener("click", () => {
    setTheme(getTheme() === "light" ? "dark" : "light");
    refresh();
  });
  refresh();
}

function wireLogout() {
  const btn = document.getElementById("logout");
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      await fetch("/auth/logout", { method: "POST" });
    } catch {
      // ignore — reload either way drops the session client-side.
    }
    window.location.assign("/?logged_out=1");
  });
}

// Single render entry point. Views call this (via setMode + render) to swap
// between viewer and builder. The view itself paints any mode-specific
// header controls into #mode-actions.
export function render() {
  const main = document.getElementById("main");
  const modeActions = document.getElementById("mode-actions");
  modeActions.innerHTML = "";
  if (state.mode === "edit") {
    document.body.dataset.mode = "edit";
    builderView.render(main, { modeActions, switchMode });
  } else {
    document.body.dataset.mode = "view";
    viewerView.render(main, { modeActions, switchMode });
  }
}

function switchMode(next) {
  setMode(next);
  render();
}

wireThemeToggle();
wireLogout();

loadPlans()
  .then(() => {
    wireSaveStatus();
    render();
  })
  .catch((err) => {
    console.error(err);
    document.getElementById("main").innerHTML =
      `<p class="error">Konnte Pläne nicht laden: ${escape(err.message)}</p>`;
  });
