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
import { openAllowlistModal } from "./admin.js";
import * as builderView from "./views/builder.js";
import * as manageView from "./views/manage.js";
import * as viewerView from "./views/viewer.js";

function wireSaveStatus() {
  const el = document.getElementById("save-status");
  onSaveStatus((text, cls) => {
    el.textContent = text;
    el.className = `save-status ${cls || ""}`;
  });
}

async function wireProfileMenu() {
  const btn = document.getElementById("profile-avatar");
  let email = "";
  let isAdmin = false;
  try {
    const res = await fetch("/api/me");
    if (!res.ok) return;
    const data = await res.json();
    email = data.email || "";
    isAdmin = !!data.isAdmin;
  } catch {
    return;
  }
  if (!email) return;

  btn.textContent = email.charAt(0).toUpperCase();
  btn.title = email;
  btn.hidden = false;

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (document.querySelector(".profile-popover")) {
      closeProfilePopover();
      return;
    }
    openProfileMenu(btn, email, isAdmin);
  });
}

function openProfileMenu(anchor, email, isAdmin) {
  closeProfilePopover();
  const pop = document.createElement("div");
  pop.className = "popover profile-popover";
  const r = anchor.getBoundingClientRect();
  pop.style.top = `${r.bottom + 6}px`;
  pop.style.left = `${Math.max(8, r.right - 220)}px`;

  const header = document.createElement("div");
  header.className = "popover-header";
  header.textContent = email;
  header.title = email;
  pop.appendChild(header);

  const themeBtn = document.createElement("button");
  themeBtn.type = "button";
  themeBtn.className = "popover-item";
  const refreshThemeLabel = () => {
    const targetDark = getTheme() === "light";
    themeBtn.innerHTML = `
      <svg class="popover-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        ${targetDark
          ? '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'
          : '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>'}
      </svg>
      <span>${targetDark ? "Dunkel" : "Hell"}</span>
    `;
  };
  refreshThemeLabel();
  themeBtn.onclick = () => {
    setTheme(getTheme() === "light" ? "dark" : "light");
    refreshThemeLabel();
  };
  pop.appendChild(themeBtn);

  if (isAdmin) {
    const adminBtn = document.createElement("button");
    adminBtn.type = "button";
    adminBtn.className = "popover-item";
    adminBtn.innerHTML = `
      <svg class="popover-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
      <span>Zugriff verwalten</span>
    `;
    adminBtn.onclick = () => {
      closeProfilePopover();
      openAllowlistModal({ currentEmail: email });
    };
    pop.appendChild(adminBtn);
  }

  const sep = document.createElement("div");
  sep.className = "popover-separator";
  pop.appendChild(sep);

  const logoutBtn = document.createElement("button");
  logoutBtn.type = "button";
  logoutBtn.className = "popover-item danger";
  logoutBtn.innerHTML = `
    <svg class="popover-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
      <path d="M12 2v10"/>
    </svg>
    <span>Abmelden</span>
  `;
  logoutBtn.onclick = async () => {
    logoutBtn.disabled = true;
    try {
      await fetch("/auth/logout", { method: "POST" });
    } catch {
      // ignore — reload either way drops the session client-side.
    }
    window.location.assign("/?logged_out=1");
  };
  pop.appendChild(logoutBtn);

  document.body.appendChild(pop);

  const outside = (e) => {
    if (pop.contains(e.target) || anchor.contains(e.target)) return;
    closeProfilePopover();
  };
  const esc = (e) => {
    if (e.key === "Escape") closeProfilePopover();
  };
  setTimeout(() => {
    document.addEventListener("click", outside, true);
    document.addEventListener("keydown", esc);
  }, 0);
  pop._cleanup = () => {
    document.removeEventListener("click", outside, true);
    document.removeEventListener("keydown", esc);
  };
}

function closeProfilePopover() {
  const pop = document.querySelector(".profile-popover");
  if (!pop) return;
  if (pop._cleanup) pop._cleanup();
  pop.remove();
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
  } else if (state.mode === "manage") {
    document.body.dataset.mode = "manage";
    manageView.render(main, { modeActions, switchMode });
  } else {
    document.body.dataset.mode = "view";
    viewerView.render(main, { modeActions, switchMode });
  }
}

function switchMode(next) {
  setMode(next);
  render();
}

wireProfileMenu();

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
