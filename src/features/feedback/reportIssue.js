import { elements } from "../../dom/elements.js";
import { getLocale, t } from "../../i18n/i18n.js";
import { APP_CONFIG } from "../../config.js";
import { INSTALLATION_ID_STORAGE_KEY } from "../../constants/storageKeys.js";
import { trackEvent } from "../../services/analytics.js";

// An always-available "Report a problem" entry point in Settings, distinct
// from feedbackPrompt.js's 3-day-gated satisfaction prompt: this is for
// day-one bug reports, with no cooldown and no rating, reachable any time.
// Reuses the same POST /api/feedback endpoint and feedback_submissions
// table, tagged with category "issue_report" so it can be told apart from
// the scheduled prompt in analytics queries.
export function initReportIssue() {
  if (!elements.reportIssueButton) {
    return;
  }

  const modal = createReportIssueModal();

  document.body.append(modal);
  elements.reportIssueButton.addEventListener("click", () => openModal(modal));
}

function createReportIssueModal() {
  const overlay = document.createElement("div");

  overlay.className = "share-modal-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="share-modal-backdrop"></div>
    <div class="share-modal" role="dialog" aria-modal="true" aria-labelledby="reportIssueModalTitle">
      <p class="kicker">${escapeHtml(t("reportIssue.kicker"))}</p>
      <h2 id="reportIssueModalTitle" class="share-modal-title">${escapeHtml(t("reportIssue.title"))}</h2>
      <p class="share-modal-body">${escapeHtml(t("reportIssue.body"))}</p>
      <label class="feedback-comment-label" for="reportIssueMessage">${escapeHtml(t("reportIssue.messageLabel"))}</label>
      <textarea id="reportIssueMessage" class="feedback-comment" rows="4" placeholder="${escapeHtml(t("reportIssue.messagePlaceholder"))}"></textarea>
      <p class="share-modal-message report-issue-message" aria-live="polite"></p>
      <div class="share-modal-actions">
        <button type="button" class="secondary-action report-issue-cancel">${escapeHtml(t("reportIssue.cancel"))}</button>
        <button type="button" class="primary-action report-issue-submit">${escapeHtml(t("reportIssue.submit"))}</button>
      </div>
    </div>
  `;

  overlay.querySelector(".report-issue-cancel").addEventListener("click", () => closeModal(overlay));
  overlay.querySelector(".share-modal-backdrop").addEventListener("click", () => closeModal(overlay));
  overlay.querySelector(".report-issue-submit").addEventListener("click", () => handleSubmit(overlay));

  return overlay;
}

function openModal(modal) {
  modal.querySelector(".report-issue-message").textContent = "";
  modal.querySelector("#reportIssueMessage").value = "";
  modal.hidden = false;
}

function closeModal(modal) {
  modal.hidden = true;
}

async function handleSubmit(overlay) {
  const submitButton = overlay.querySelector(".report-issue-submit");
  const messageEl = overlay.querySelector(".report-issue-message");
  const textarea = overlay.querySelector("#reportIssueMessage");
  const comment = textarea.value.trim().slice(0, 2000);

  if (!comment) {
    messageEl.textContent = t("reportIssue.emptyMessage");
    return;
  }

  submitButton.disabled = true;

  try {
    await postIssueReport(comment);
    trackEvent("feedback_submitted", { source: "settings_report_issue" });
    messageEl.textContent = t("reportIssue.thanks");
    window.setTimeout(() => closeModal(overlay), 1200);
  } catch (error) {
    messageEl.textContent = t("reportIssue.submitFailed");
  } finally {
    submitButton.disabled = false;
  }
}

async function postIssueReport(comment) {
  const installationId = getInstallationId();
  const response = await fetch(apiUrl("/api/feedback"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      installationId,
      rating: null,
      comment,
      category: "issue_report",
      language: getLocale(),
      appVersion: APP_CONFIG.appVersion,
      fromScheduledPrompt: false
    })
  });

  if (!response.ok) {
    throw new Error(`Report request failed with ${response.status}`);
  }
}

function getInstallationId() {
  try {
    return window.localStorage.getItem(INSTALLATION_ID_STORAGE_KEY);
  } catch (error) {
    return null;
  }
}

function apiUrl(path) {
  const baseUrl = APP_CONFIG.pushApiBaseUrl || window.location.origin;

  return new URL(path, baseUrl).toString();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
