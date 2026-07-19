import { APP_CONFIG } from "../../config.js";
import { t } from "../../i18n/i18n.js";
import { trackEvent } from "../../services/analytics.js";

// A small referral/share feature: a floating action button that opens a
// confirmation modal, then hands off to the device's native share sheet
// (Messages/Mail/WhatsApp/Discord/etc.), falling back to clipboard copy when
// native sharing isn't available.
export function initShareFab() {
  const fab = createShareFab();
  const modal = createShareModal();

  // Mounted directly on <body>, not inside .app-shell: a position:fixed
  // descendant is only guaranteed to stay fixed to the viewport if no
  // ancestor establishes its own containing block (transform/filter/
  // perspective/will-change/contain). Mounting at the body root sidesteps
  // that risk entirely instead of relying on .app-shell never adding one.
  document.body.append(fab, modal);

  fab.addEventListener("click", () => openShareModal(modal));
  modal.querySelector(".share-modal-cancel").addEventListener("click", () => closeShareModal(modal));
  modal.querySelector(".share-modal-backdrop").addEventListener("click", () => closeShareModal(modal));
  modal.querySelector(".share-modal-confirm").addEventListener("click", () => handleShareConfirm(modal));

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) {
      closeShareModal(modal);
    }
  });
}

function createShareFab() {
  const button = document.createElement("button");

  button.type = "button";
  button.className = "share-fab";
  button.setAttribute("aria-label", t("share.ariaLabel", { appName: APP_CONFIG.appName }));
  button.innerHTML = shareIconSvg();

  return button;
}

function createShareModal() {
  const overlay = document.createElement("div");

  overlay.className = "share-modal-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="share-modal-backdrop"></div>
    <div class="share-modal" role="dialog" aria-modal="true" aria-labelledby="shareModalTitle">
      <p class="kicker">${escapeHtml(t("share.kicker"))}</p>
      <h2 id="shareModalTitle" class="share-modal-title">${escapeHtml(t("share.title", { appName: APP_CONFIG.appName }))}</h2>
      <p class="share-modal-body">${escapeHtml(t("share.body", { appName: APP_CONFIG.appName }))}</p>
      <p class="share-modal-message" aria-live="polite"></p>
      <div class="share-modal-actions">
        <button type="button" class="secondary-action share-modal-cancel">${escapeHtml(t("common.cancel"))}</button>
        <button type="button" class="primary-action share-modal-confirm">${escapeHtml(t("common.share"))}</button>
      </div>
    </div>
  `;

  return overlay;
}

function openShareModal(modal) {
  modal.querySelector(".share-modal-message").textContent = "";
  modal.hidden = false;
  trackEvent("share_opened", {});
}

function closeShareModal(modal) {
  modal.hidden = true;
}

async function handleShareConfirm(modal) {
  const confirmButton = modal.querySelector(".share-modal-confirm");
  const messageEl = modal.querySelector(".share-modal-message");
  const shareText = buildShareMessage();

  confirmButton.disabled = true;

  try {
    if (navigator.share) {
      await navigator.share({
        title: APP_CONFIG.appName,
        text: shareText
      });
      trackEvent("share_completed", { method: "native" });
      closeShareModal(modal);
      return;
    }

    await copyShareTextToClipboard(shareText);
    trackEvent("share_completed", { method: "clipboard" });
    messageEl.textContent = t("share.linkCopied");
  } catch (error) {
    if (error?.name === "AbortError") {
      // The user cancelled the native share sheet; treat this the same as
      // closing the modal, not as a failure.
      closeShareModal(modal);
      return;
    }

    try {
      await copyShareTextToClipboard(shareText);
      trackEvent("share_completed", { method: "clipboard_fallback" });
      messageEl.textContent = t("share.linkCopied");
    } catch (clipboardError) {
      messageEl.textContent = shareText;
    }
  } finally {
    confirmButton.disabled = false;
  }
}

async function copyShareTextToClipboard(text) {
  if (!navigator.clipboard?.writeText) {
    throw new Error("Clipboard is not available.");
  }

  await navigator.clipboard.writeText(text);
}

// The app link is always the current origin rather than a hardcoded domain:
// Render and Cloudflare Pages deployments are different origins, and the only
// correct "app link" is wherever the person sharing is actually running it.
function buildShareMessage() {
  return t("share.message", {
    appName: APP_CONFIG.appName,
    link: window.location.origin
  });
}

function shareIconSvg() {
  return `
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="18" cy="5" r="3"></circle>
      <circle cx="6" cy="12" r="3"></circle>
      <circle cx="18" cy="19" r="3"></circle>
      <line x1="8.6" y1="10.6" x2="15.4" y2="6.4"></line>
      <line x1="8.6" y1="13.4" x2="15.4" y2="17.6"></line>
    </svg>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
