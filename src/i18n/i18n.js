import { LANGUAGE_STORAGE_KEY } from "../constants/storageKeys.js";
import { en } from "./translations/en.js";
import { es } from "./translations/es.js";

export const SUPPORTED_LOCALES = ["en", "es"];
const DEFAULT_LOCALE = "en";
const DICTIONARIES = { en, es };

let currentLocale = resolveInitialLocale();

// Dot-path lookup with {param} substitution, e.g. t("onboarding.step", {n: 3}).
// Falls back to the English string, then to the raw key, so a missing
// translation never crashes rendering.
export function t(key, params = {}) {
  const template = lookup(DICTIONARIES[currentLocale], key)
    ?? lookup(DICTIONARIES[DEFAULT_LOCALE], key)
    ?? key;

  return substitute(template, params);
}

export function getLocale() {
  return currentLocale;
}

export function setLocale(locale) {
  if (!SUPPORTED_LOCALES.includes(locale)) {
    return false;
  }

  currentLocale = locale;

  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, locale);
  } catch (error) {
    // Best-effort persistence; the in-memory locale still applies this load.
  }

  return true;
}

// Applies every static, never-dynamically-rendered piece of markup text in
// index.html: elements are marked with data-i18n="namespace.key" (textContent)
// or data-i18n-aria="namespace.key" (aria-label). This lets new static copy
// be translated by adding an attribute, without touching JS, satisfying "new
// translations can be added without major restructuring."
export function applyStaticTranslations(root = document) {
  if (root === document) {
    document.documentElement.lang = currentLocale;
  }

  root.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });

  root.querySelectorAll("[data-i18n-aria]").forEach((element) => {
    element.setAttribute("aria-label", t(element.dataset.i18nAria));
  });

  root.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    element.setAttribute("placeholder", t(element.dataset.i18nPlaceholder));
  });
}

// Locale-aware wrappers so date/time formatting follows the app's selected
// language rather than only the browser's own locale, which can differ (e.g.
// a browser set to en-US with Spanish picked in-app).
export function formatDate(value, options = {}) {
  return new Intl.DateTimeFormat(currentLocale, options).format(new Date(value));
}

export function formatTime(value, options = { hour: "numeric", minute: "2-digit" }) {
  return new Intl.DateTimeFormat(currentLocale, options).format(new Date(value));
}

function resolveInitialLocale() {
  try {
    const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);

    if (SUPPORTED_LOCALES.includes(saved)) {
      return saved;
    }
  } catch (error) {
    return DEFAULT_LOCALE;
  }

  const browserLanguages = Array.isArray(navigator.languages) && navigator.languages.length > 0
    ? navigator.languages
    : [navigator.language];
  const detected = browserLanguages
    .map((lang) => String(lang).slice(0, 2).toLowerCase())
    .find((lang) => SUPPORTED_LOCALES.includes(lang));

  return detected ?? DEFAULT_LOCALE;
}

function lookup(dictionary, key) {
  return key.split(".").reduce((value, part) => (
    value && typeof value === "object" ? value[part] : undefined
  ), dictionary);
}

function substitute(template, params) {
  if (typeof template !== "string") {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (match, name) => (
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
  ));
}
