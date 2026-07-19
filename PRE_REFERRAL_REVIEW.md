# Pre-Referral Review

Written as if Ready is about to go out to a small group of friends for real-world testing.
Covers onboarding, install, clarity, reliability, mobile/accessibility, error/empty/loading
states, privacy, analytics, notifications, recommendations, referral, feedback, and trust.

Each item: the issue, why it matters, rough complexity, any cost/paid-service exposure, and
whether it needs a product decision before building.

---

## 1. Must fix before sharing

**Analytics/feedback endpoints don't exist yet.**
`src/services/analytics.js` and the new feedback prompt both POST to `/api/analytics/events` and
`/api/feedback`, which return 404 today. Analytics fails silently (fire-and-forget, by design);
feedback shows a friendly "could not be sent" message instead of crashing — so nothing is
*broken* for the user, but none of the new instrumentation is actually recording anything yet.
This is the deferred Supabase work discussed separately, not an oversight, but it means: **do not
share the app expecting analytics/feedback data to show up** until that lands.
*Complexity: tracked separately (Supabase phase). Needs: the Supabase/forecast discussion already
scheduled.*

**A privacy claim I almost shipped that wasn't true yet — now fixed.**
While building the notification-content work, I drafted Settings copy claiming "Ready shares your
approximate area... so reminders can mention rain, cold, or heat" — but the actual coarse-location
sending is part of the deferred Supabase work, not yet implemented. Shipping that copy would have
been a false privacy claim the moment a Spanish- or English-reading tester opened Settings. I
reverted it back to the accurate, current-behavior copy ("Location stays on this device") before
finishing this round. Flagging it here because it's exactly the kind of trust-eroding mistake that
matters more with real outside testers than with just you — worth double-checking any future
privacy-copy change against what's *actually* implemented, not what's planned.
*Complexity: none — already fixed.*

**Origin-bound push subscriptions during the Render → Cloudflare migration.**
Per the postmortem, this migration is still in progress. If a friend installs from one origin and
you later point people at the other, their reminders silently stop with no error shown to them —
they'd just never get a notification again. Confirm which URL you're actually sending friends
before this round ships, and if you switch origins later, plan to tell testers to reinstall.
*Complexity: none to fix (it's inherent to how Web Push works) — just a rollout-sequencing risk to
manage.*

**No account/auth — clearing Safari data silently wipes everything.**
Language preference, clothing preferences, saved location, and expected-time-away all live in
localStorage. A tester who clears Safari site data (or uninstalls/reinstalls the Home Screen app
without realizing that resets things) loses their whole setup with no warning or recovery path.
Worth a one-line heads-up when you hand testers the link ("don't clear Safari data for this site").
*Complexity: trivial (a sentence in your test instructions); a proper fix (server-side identity)
is out of scope for a pilot.*

---

## 2. Strongly recommended

**Backend error messages can still leak through untranslated.**
I closed the two biggest gaps (location/weather service errors) by routing them through translated
fallback text instead of the raw `error.message`. But a few notification-flow failure paths
(`notifications.turnOffFailed`, `notifications.permissionGrantedNotSaved`, the local test-send
failure) still interpolate the *raw* error string from the backend (e.g. "VAPID keys are not
configured on the reminder server.") into an otherwise-translated sentence. These only surface on
genuine backend failures (not the happy path), but a Spanish-reading tester who hits one would see
a sentence that's part Spanish, part English.
*Complexity: low-medium — either localize the handful of backend error strings (requires the
backend to know the caller's language) or have the client show a fully generic translated message
instead of interpolating the raw text. No product decision needed, just an implementation choice.*

**Test on real iPhone hardware before wider sharing.**
Everything in this round was verified with headless Chrome (real navigation, real Supabase calls,
real screenshots) — that's solid coverage for logic and layout, but it can't fully replicate iOS
Safari's Home Screen install quirks (icon caching, PWA naming, notification permission prompts
tied to a real user gesture). Do one full manual pass on an actual iPhone — onboarding, install,
notifications, share — before the first friend gets the link.
*Complexity: none to build, just time. No cost.*

**Onboarding's "reminders" step doesn't mention what enabling reminders actually does.**
It currently just says Ready can send a daily reminder. Once the coarse-location notification
feature (deferred) actually ships, that step should be updated to disclose it inline, not rely on
testers finding the Settings paragraph after the fact. Noting it now so it isn't forgotten when
that feature lands.
*Complexity: low (one string change) once the underlying feature exists. Needs: to happen in the
same change as the deferred coarse-location work, not before.*

**Rate of analytics events is unmoderated.**
Once the analytics endpoint exists, `trackEvent()` fires fairly liberally (every checklist
generation, every screen view, every settings change). Fine at pilot scale on Supabase's free
tier, but worth a glance at Supabase's dashboard after the first week to confirm nothing is
generating surprising row counts.
*Complexity: none now — just something to watch. Cost: stays on Supabase Free unless usage is
unexpectedly high.*

**The referral share message and Open Graph image use a relative path.**
`og:image`/`twitter:image` point at `icons/app-icon-512.png` (relative), which most modern link
previews resolve fine against the page URL, but isn't strictly spec-compliant (some
preview-generation tools expect an absolute URL). Low risk given there's no single canonical
domain yet (Render vs. Cloudflare Pages), but worth revisiting once a stable URL exists.
*Complexity: trivial once there's one settled domain to hardcode, or could be built dynamically
via a tiny Cloudflare Pages Function that injects `window.location.origin` — more effort than it's
worth right now.*

---

## 3. Useful later

- **PWA manifest isn't localized.** `manifest.webmanifest` (app name/description shown at install
  time) is static and always English — genuinely hard to do properly without server-side content
  negotiation, and low value for a two-language pilot. Documented limitation, not a blocker.
- **No dedicated iOS splash-screen assets** (`apple-touch-startup-image`) — Safari synthesizes one
  from the manifest/icon, which is fine for a pilot; true splash assets need a matrix of
  device-specific image sizes, disproportionate effort right now.
- **No `favicon.ico` fallback** — the SVG `<link rel="icon">` covers every modern browser; a few
  very old crawlers/tools that hit `/favicon.ico` directly by convention would 404. Low value.
- **Old `trackPilotEvent()` calls aren't consolidated into the new `trackEvent()` service.** Both
  work independently today (by design, to avoid touching working code) — worth merging once the
  new analytics table has proven itself, so there's only one instrumentation path long-term.
- **No automated iOS/Android device-lab testing** — currently manual. Fine at pilot scale; would
  matter more before a larger public launch.
- **Consider a lightweight "what's new" note** when you bump `sw.js`'s `APP_VERSION` — testers
  currently just see an "Update available" banner with no explanation of what changed, which is a
  bit opaque for non-technical friends.

---

## 4. Experimental ideas

- **In-app locale auto-refresh without a full reload** — the current design intentionally reloads
  the page on language switch for simplicity/safety (see the language feature's own comments). A
  live re-render bus is possible but is real new architecture for a vanilla-JS app with no
  reactivity framework — not worth it unless language-switching turns out to be a frequent,
  friction-causing action for real users.
- **A/B testing different notification message variants** — the new `server/notificationCopy.js`
  module already separates variant *selection* from variant *text*, which would make this
  straightforward to add later, but it's speculative until there's enough usage data to justify it.

---

## Forecast-learning idea — assessment

Held for the dedicated discussion (per your request), but the short version: the right shape for
this is **data collection and evaluation first, production changes never automatic.** Concretely
that means: log every prediction alongside its actual outcome, compute accuracy metrics on a
schedule, and have any proposed rule/threshold change land in a reviewable table (proposed →
approved/rejected → applied, with a rollback path) rather than the scheduler or recommendation
engine ever rewriting its own thresholds based on what it observes. This is exactly the pattern the
original spec asked for, and it's the only version of "location + training" I'd build regardless
of how the location-tracking questions get answered — the open questions are about *what* location
granularity to collect and *how* a per-location signal should factor into recommendations, not
*whether* changes get reviewed before shipping. Saved for the dedicated conversation.
