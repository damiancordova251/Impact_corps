import {
  empty,
  removeSubscription,
  subscriptionStoreErrorResponse
} from "../../../_shared/backend.js";

// Removes a saved subscription so scheduled reminders stop immediately. This
// is what "turn reminders off" in the app actually calls; mirrors the Express
// DELETE /api/push/subscriptions/:id route.
export async function onRequestDelete({ params, env }) {
  try {
    await removeSubscription(params.id, env);

    return empty({ status: 204 });
  } catch (error) {
    return subscriptionStoreErrorResponse(error);
  }
}
