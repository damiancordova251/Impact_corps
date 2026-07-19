// Documentation-grade type declarations for analytics.js. This project has no
// build step/TypeScript by design; this file is never imported or compiled —
// it exists purely so editors can surface the event-payload shape when
// working across the client/server boundary. Keep in sync with the
// ALLOWED_EVENT_NAMES set in analytics.js, server/analyticsService.js, and
// functions/_shared/analytics.js by hand.

export type AnalyticsEventName =
  | "app_installation_seen"
  | "session_started"
  | "session_ended"
  | "language_changed"
  | "share_opened"
  | "share_completed"
  | "install_instructions_viewed"
  | "notification_scheduled"
  | "notification_opened"
  | "notification_dismissed"
  | "notification_opt_in"
  | "notification_opt_out"
  | "recommendation_generated"
  | "recommendation_feedback"
  | "checklist_completed"
  | "referral_link_visited"
  | "feedback_prompt_shown"
  | "feedback_prompt_postponed"
  | "feedback_prompt_dismissed"
  | "feedback_submitted"
  | "client_error"
  | "api_performance";

// Values are bounded to string (<=120 chars), finite number, or boolean —
// anything else is dropped client-side by sanitizeMetadata() before it is
// ever sent.
export type AnalyticsEventMetadata = Record<string, string | number | boolean>;

export function trackEvent(eventName: AnalyticsEventName, metadata?: AnalyticsEventMetadata): void;

// The JSON body POSTed to /api/analytics/events by trackEvent(). occurredAt
// is set client-side to the moment trackEvent() was called, not send time.
export interface AnalyticsEventRequestBody {
  installationId: string;
  eventName: AnalyticsEventName;
  language: string;
  metadata: AnalyticsEventMetadata;
  occurredAt: string;
}
