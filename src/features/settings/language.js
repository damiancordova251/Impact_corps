import { elements } from "../../dom/elements.js";
import { getLocale, setLocale, SUPPORTED_LOCALES, t } from "../../i18n/i18n.js";
import { trackEvent } from "../../services/analytics.js";

// Switching languages reloads the page rather than live re-rendering every
// feature module in place. With ~10 independent feature modules each owning
// their own DOM rendering and no reactivity framework, a full pub/sub
// re-render bus would be a lot of new surface area for a vanilla-JS app; a
// reload is simpler, guarantees no stray untranslated text lingers on
// screen, and is fast since everything is served locally/cached by the
// service worker.
export function initLanguageSetting() {
  if (!elements.languageSelect) {
    return;
  }

  elements.languageSelect.innerHTML = SUPPORTED_LOCALES.map((locale) => (
    `<option value="${locale}">${locale === "es" ? t("settings.languageSpanish") : t("settings.languageEnglish")}</option>`
  )).join("");
  elements.languageSelect.value = getLocale();

  elements.languageSelect.addEventListener("change", () => {
    const nextLocale = elements.languageSelect.value;
    const previousLocale = getLocale();

    if (!setLocale(nextLocale) || nextLocale === previousLocale) {
      return;
    }

    trackEvent("language_changed", { from: previousLocale, to: nextLocale });
    window.location.reload();
  });
}
