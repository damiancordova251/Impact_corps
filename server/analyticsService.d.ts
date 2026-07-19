// Documentation-grade type declarations for analyticsService.js. Never
// imported or compiled (this project has no TypeScript build step) — exists
// only so editors can surface the storage-layer shapes. Keep in sync with
// analyticsService.js, functions/_shared/analytics.js, and the request-body
// shapes parsed in server/index.js / functions/api/analytics/events.js /
// functions/api/feedback.js by hand.

import type { AnalyticsEventMetadata, AnalyticsEventName } from "../src/services/analytics.d.ts";

export function isAnalyticsStoreConfigured(): boolean;

export interface RecordAnalyticsEventInput {
  installationId: string;
  eventName: AnalyticsEventName;
  category: string | null;
  language: string | null;
  metadata: AnalyticsEventMetadata;
  occurredAt: string;
}

export function recordAnalyticsEvent(input: RecordAnalyticsEventInput): Promise<void>;

export interface RecordFeedbackSubmissionInput {
  installationId: string;
  rating: number | null;
  comment: string | null;
  // Answer to "what other clothing options would you like to see?" — a
  // separate free-text field from the general comment box.
  clothingSuggestions: string | null;
  category: string | null;
  appVersion: string | null;
  language: string | null;
  fromScheduledPrompt: boolean;
  allowFollowUp: boolean;
}

export function recordFeedbackSubmission(input: RecordFeedbackSubmissionInput): Promise<void>;

// Thrown by both functions above on any Supabase error or missing
// configuration. Callers (server/index.js route handlers) always catch this
// and soft-fail the request rather than let it surface as a 500 — analytics
// and feedback storage must never break the app for the user.
export class AnalyticsStoreError extends Error {
  name: "AnalyticsStoreError";
}
