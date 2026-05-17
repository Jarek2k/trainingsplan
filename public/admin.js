// Admin-Modal "Zugriff verwalten". Erreichbar nur für Allowlist-Admins,
// aufgerufen aus dem Profilmenü in app.js.

import { openModal, openConfirmModal } from "./modal.js";
import { escape } from "./util.js";

export function openAllowlistModal({ currentEmail }) {
  const body = document.createElement("div");
  body.className = "admin-body";
  body.innerHTML = `
    <p class="modal-hint">Wer hier eingetragen ist, darf sich mit seiner Google-Email einloggen. Klick auf einen Eintrag öffnet die Bearbeitung.</p>
    <p class="admin-count" hidden></p>
    <div class="admin-list" hidden></div>
    <div class="admin-add">
      <h3 class="admin-add-title">Neuen Zugriff hinzufügen</h3>
      <div class="admin-add-grid">
        <input type="email" class="admin-add-email" placeholder="email@example.com" autocomplete="off" aria-label="Email" />
        <input type="text" class="admin-add-name" placeholder="Anzeigename (optional)" maxlength="40" autocomplete="off" aria-label="Anzeigename" />
        <label class="admin-add-admin">
          <input type="checkbox" class="admin-add-admin-cb" />
          <span>Admin</span>
        </label>
        <button type="button" class="btn admin-add-btn">Hinzufügen</button>
      </div>
    </div>
    <p class="admin-error" hidden></p>
  `;

  const list = body.querySelector(".admin-list");
  const count = body.querySelector(".admin-count");
  const emailInp = body.querySelector(".admin-add-email");
  const nameInp = body.querySelector(".admin-add-name");
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
    list.innerHTML = "";
    for (const u of users) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "admin-row";
      const isSelf = u.email === currentEmail;
      const nameLine = u.displayName
        ? `<span class="admin-row-name">${escape(u.displayName)}</span>`
        : `<span class="admin-row-name is-empty">Kein Name</span>`;
      row.innerHTML = `
        <div class="admin-row-main">
          <div class="admin-row-text">
            ${nameLine}
            <span class="admin-row-email">${escape(u.email)}</span>
          </div>
          <div class="admin-row-badges">
            ${isSelf ? `<span class="admin-row-self">du</span>` : ""}
            ${u.isAdmin ? `<span class="admin-row-badge is-admin">Admin</span>` : ""}
          </div>
        </div>
      `;
      row.onclick = () => openEditDialog(u);
      list.appendChild(row);
    }
    list.hidden = false;

    const admins = users.filter((u) => u.isAdmin).length;
    const totalLabel = users.length === 1 ? "1 Berechtigte:r" : `${users.length} Berechtigte`;
    const adminLabel = admins === 1 ? "1 Admin" : `${admins} Admins`;
    count.textContent = `${totalLabel} · ${adminLabel}`;
    count.hidden = false;
  }

  function openEditDialog(user) {
    const isSelf = user.email === currentEmail;
    const body = document.createElement("div");
    body.className = "admin-edit-body";
    body.innerHTML = `
      <label class="admin-edit-field">
        <span class="admin-edit-label">Email</span>
        <input type="email" class="admin-edit-input admin-edit-email" autocomplete="off" />
        ${isSelf ? `<span class="admin-edit-hint">Eigene Email kann hier nicht geändert werden.</span>` : ""}
      </label>
      <label class="admin-edit-field">
        <span class="admin-edit-label">Anzeigename</span>
        <input type="text" class="admin-edit-input admin-edit-name" maxlength="40" autocomplete="off" placeholder="z. B. Tom" />
        <span class="admin-edit-hint">Wird statt der Email gezeigt, wenn der Nutzer Pläne öffentlich teilt.</span>
      </label>
      <label class="admin-edit-toggle">
        <input type="checkbox" class="admin-edit-admin-cb" />
        <span>Als Admin</span>
      </label>
      <p class="admin-edit-error" hidden></p>
      <div class="admin-edit-danger">
        <button type="button" class="btn-link admin-edit-remove">Aus Allowlist entfernen</button>
      </div>
    `;

    const emailIn = body.querySelector(".admin-edit-email");
    const nameIn = body.querySelector(".admin-edit-name");
    const adminCbEdit = body.querySelector(".admin-edit-admin-cb");
    const dlgErr = body.querySelector(".admin-edit-error");
    const removeBtn = body.querySelector(".admin-edit-remove");

    emailIn.value = user.email;
    nameIn.value = user.displayName || "";
    adminCbEdit.checked = !!user.isAdmin;
    if (isSelf) emailIn.disabled = true;

    function dlgShowError(msg) {
      dlgErr.textContent = msg;
      dlgErr.hidden = false;
    }
    function dlgClearError() {
      dlgErr.hidden = true;
      dlgErr.textContent = "";
    }

    const m = openModal({
      title: "Eintrag bearbeiten",
      body,
      confirmLabel: "Speichern",
      confirmDisabled: false,
      onConfirm: () => {
        dlgClearError();
        const newEmail = emailIn.value.trim().toLowerCase();
        if (!newEmail || !newEmail.includes("@")) {
          dlgShowError("Ungültige Email.");
          return false;
        }
        savePatch(user.email, {
          email: newEmail,
          displayName: nameIn.value,
          isAdmin: adminCbEdit.checked,
        }).then((ok) => {
          if (ok) m.close();
          else if (lastError) dlgShowError(lastError);
        });
        return false; // we close manually after async success
      },
    });

    removeBtn.onclick = () => {
      m.close();
      openConfirmModal({
        title: "Eintrag entfernen",
        message: `„${user.email}" verliert sofort den Zugriff. Eigene Pläne und Daten bleiben erhalten, sind aber nicht mehr erreichbar.`,
        confirmLabel: "Entfernen",
        onConfirm: () => removeUser(user.email),
      });
    };

    setTimeout(() => {
      if (!isSelf) emailIn.focus();
      else nameIn.focus();
    }, 0);
  }

  let lastError = null;
  async function savePatch(originalEmail, payload) {
    lastError = null;
    clearError();
    try {
      const res = await fetch(
        `/api/admin/allowlist/${encodeURIComponent(originalEmail)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Speichern.");
      renderList(data.users);
      return true;
    } catch (e) {
      lastError = e.message;
      return false;
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
        body: JSON.stringify({
          email,
          isAdmin: adminCb.checked,
          displayName: nameInp.value,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Hinzufügen.");
      emailInp.value = "";
      nameInp.value = "";
      adminCb.checked = false;
      renderList(data.users);
    } catch (e) {
      showError(e.message);
    }
  };

  for (const inp of [emailInp, nameInp]) {
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addBtn.click();
      }
    });
  }

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
