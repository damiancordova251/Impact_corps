import {
  json
} from "../../_shared/backend.js";

// Pages Functions save subscriptions, while real push sending stays in the
// dedicated Cron Worker to keep this bundle free of Node-only Web Push code.
export async function onRequestPost() {
  return json({
    error: "Cloudflare Pages test push is not enabled yet; scheduled push is handled by the Cron Worker."
  }, { status: 501 });
}
