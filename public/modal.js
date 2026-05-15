// Shared modal dialog. Used by builder and manage views.

import { escape } from "./util.js";

export function openModal({
  title,
  body,
  onConfirm,
  confirmLabel = "OK",
  confirmDisabled = true,
}) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });

  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `
    <h2>${escape(title)}</h2>
    <div class="modal-body"></div>
    <div class="modal-actions">
      <button class="btn secondary" data-cancel>Abbrechen</button>
      <button class="btn" data-confirm ${confirmDisabled ? "disabled" : ""}>${escape(confirmLabel)}</button>
    </div>
  `;
  modal.querySelector(".modal-body").appendChild(body);
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  const confirmBtn = modal.querySelector("[data-confirm]");
  const setConfirmEnabled = (enabled) => {
    confirmBtn.disabled = !enabled;
  };

  confirmBtn.onclick = () => {
    if (onConfirm() !== false) close();
  };
  modal.querySelector("[data-cancel]").onclick = close;

  const escClose = (e) => {
    if (e.key === "Escape") close();
  };
  document.addEventListener("keydown", escClose);

  function close() {
    backdrop.remove();
    document.removeEventListener("keydown", escClose);
  }

  return { close, setConfirmEnabled, modal };
}

export function openConfirmModal({ title, message, confirmLabel = "Löschen", onConfirm }) {
  const body = document.createElement("div");
  const p = document.createElement("p");
  p.className = "modal-hint";
  p.textContent = message;
  body.appendChild(p);
  const m = openModal({
    title,
    body,
    confirmLabel,
    confirmDisabled: false,
    onConfirm,
  });
  m.modal.querySelector("[data-confirm]").classList.add("danger");
  return m;
}

export function openAlertModal({ title, message, confirmLabel = "OK" }) {
  const body = document.createElement("div");
  const p = document.createElement("p");
  p.className = "modal-hint";
  p.textContent = message;
  body.appendChild(p);
  const m = openModal({
    title,
    body,
    confirmLabel,
    confirmDisabled: false,
    onConfirm: () => {},
  });
  const cancel = m.modal.querySelector("[data-cancel]");
  if (cancel) cancel.style.display = "none";
  return m;
}
