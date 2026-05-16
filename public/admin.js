// Admin-Modal "Zugriff verwalten". Erreichbar nur für Allowlist-Admins,
// aufgerufen aus dem Profilmenü in app.js.

import { openModal } from "./modal.js";
import { escape } from "./util.js";

export function openAllowlistModal({ currentEmail }) {
  const body = document.createElement("div");
  body.className = "admin-body";
  body.innerHTML = `
    <p class="modal-hint">Wer hier eingetragen ist, darf sich mit seiner Google-Email einloggen. Admins können diese Liste pflegen.</p>
    <p class="admin-count" hidden></p>
    <div class="admin-list" hidden></div>
    <div class="admin-add">
      <input type="email" class="admin-add-email" placeholder="freund@example.com" autocomplete="off" />
      <label class="admin-add-admin">
        <input type="checkbox" class="admin-add-admin-cb" />
        <span>Als Admin</span>
      </label>
      <button type="button" class="btn admin-add-btn">Hinzufügen</button>
    </div>
    <p class="admin-error" hidden></p>
  `;

  const list = body.querySelector(".admin-list");
  const count = body.querySelector(".admin-count");
  const emailInp = body.querySelector(".admin-add-email");
  const adminCb = body.querySelector(".admin-add-admin-cb");
  const addBtn = body.querySelector(".admin-add-btn");
  const errEl = body.querySelector(".admin-error");

  function showError(msg) {
    errEl.textContent = msg;
    errEl.hidden = false;
  }
  function clearError() {
    errEl.hidden = true;
    errEl.textContent = "";
  }

  async function loadUsers() {
    try {
      const res = await fetch("/api/admin/allowlist");
      if (!res.ok) throw new Error("Liste konnte nicht geladen werden.");
      const { users } = await res.json();
      renderList(users);
    } catch (e) {
      showError(e.message);
    }
  }

  function renderList(users) {
    closeRowMenu();
    list.innerHTML = "";
    for (const u of users) {
      const row = document.createElement("div");
      row.className = "admin-row";
      const isSelf = u.email === currentEmail;
      row.innerHTML = `
        <div class="admin-row-main">
          <span class="admin-row-email">${escape(u.email)}</span>
          ${isSelf ? `<span class="admin-row-self">du</span>` : ""}
          ${u.isAdmin ? `<span class="admin-row-badge is-admin">Admin</span>` : ""}
        </div>
        <button type="button" class="admin-row-menu" aria-label="Aktionen" title="Aktionen">⋯</button>
      `;
      const menuBtn = row.querySelector(".admin-row-menu");
      menuBtn.onclick = (e) => {
        e.stopPropagation();
        if (document.querySelector(".admin-row-popover")) {
          closeRowMenu();
          return;
        }
        openRowMenu(menuBtn, u);
      };
      list.appendChild(row);
    }
    list.hidden = false;

    const admins = users.filter((u) => u.isAdmin).length;
    const totalLabel = users.length === 1 ? "1 Berechtigte:r" : `${users.length} Berechtigte`;
    const adminLabel = admins === 1 ? "1 Admin" : `${admins} Admins`;
    count.textContent = `${totalLabel} · ${adminLabel}`;
    count.hidden = false;
  }

  function openRowMenu(anchor, user) {
    closeRowMenu();
    const pop = document.createElement("div");
    pop.className = "popover admin-row-popover";
    const r = anchor.getBoundingClientRect();
    pop.style.top = `${r.bottom + 4}px`;
    pop.style.left = `${Math.max(8, r.right - 220)}px`;

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "popover-item";
    toggleBtn.innerHTML = `
      <svg class="popover-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
      <span>${user.isAdmin ? "Admin-Rolle entziehen" : "Zum Admin machen"}</span>
    `;
    toggleBtn.onclick = () => {
      closeRowMenu();
      patchAdmin(user.email, !user.isAdmin);
    };
    pop.appendChild(toggleBtn);

    const sep = document.createElement("div");
    sep.className = "popover-separator";
    pop.appendChild(sep);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "popover-item danger";
    removeBtn.innerHTML = `
      <svg class="popover-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
      </svg>
      <span>Entfernen</span>
    `;
    removeBtn.onclick = () => {
      closeRowMenu();
      removeUser(user.email);
    };
    pop.appendChild(removeBtn);

    document.body.appendChild(pop);

    const outside = (e) => {
      if (pop.contains(e.target) || anchor.contains(e.target)) return;
      closeRowMenu();
    };
    const esc = (e) => {
      if (e.key === "Escape") closeRowMenu();
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

  function closeRowMenu() {
    const pop = document.querySelector(".admin-row-popover");
    if (!pop) return;
    if (pop._cleanup) pop._cleanup();
    pop.remove();
  }

  async function patchAdmin(email, isAdmin) {
    clearError();
    try {
      const res = await fetch(
        `/api/admin/allowlist/${encodeURIComponent(email)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isAdmin }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Aktualisieren.");
      renderList(data.users);
    } catch (e) {
      showError(e.message);
    }
  }

  async function removeUser(email) {
    clearError();
    try {
      const res = await fetch(
        `/api/admin/allowlist/${encodeURIComponent(email)}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Entfernen.");
      renderList(data.users);
    } catch (e) {
      showError(e.message);
    }
  }

  addBtn.onclick = async () => {
    clearError();
    const email = emailInp.value.trim();
    if (!email) return;
    try {
      const res = await fetch("/api/admin/allowlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, isAdmin: adminCb.checked }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Hinzufügen.");
      emailInp.value = "";
      adminCb.checked = false;
      renderList(data.users);
    } catch (e) {
      showError(e.message);
    }
  };

  emailInp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addBtn.click();
    }
  });

  const m = openModal({
    title: "Zugriff verwalten",
    body,
    confirmLabel: "Schließen",
    confirmDisabled: false,
    onConfirm: () => {},
  });
  m.modal.classList.add("admin-modal");
  // No primary action in this modal — relabel cancel as Schließen, hide confirm.
  m.modal.querySelector("[data-confirm]").style.display = "none";
  const cancelBtn = m.modal.querySelector("[data-cancel]");
  cancelBtn.textContent = "Schließen";

  loadUsers();
}
