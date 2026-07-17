// Small browser-capability checks reused by both the notification service and
// the app bootstrap, so standalone/PWA detection stays in one place.
export function isStandalonePwa() {
  return window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true;
}

export function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
