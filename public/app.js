// Bootstrap. The app is the Builder — no routing, no other views.

import { getTheme, loadPlans, onSaveStatus, setTheme } from "./state.js";
import { escape } from "./util.js";
import * as builderView from "./views/builder.js";

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
    // Glyph shows the *target* mode: sun when current is dark, moon when light.
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

wireThemeToggle();
wireLogout();

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
