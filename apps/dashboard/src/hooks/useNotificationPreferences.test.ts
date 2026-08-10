import { QueryClient } from "@tanstack/react-query";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NotificationPreferencesDto } from "@/services/api/notification-preferences.service";
import { createPreferencesMutationHandlers, NOTIFICATION_PREFERENCES_QUERY_KEY } from "./useNotificationPreferences";

const SAVED: NotificationPreferencesDto = { emailEnabled: true, prefs: { ramp_completed: true, verification_approved: true } };

function clientWith(data: NotificationPreferencesDto | undefined) {
  const queryClient = new QueryClient();
  if (data) {
    queryClient.setQueryData(NOTIFICATION_PREFERENCES_QUERY_KEY, data);
  }
  return queryClient;
}

function cached(queryClient: QueryClient): NotificationPreferencesDto | undefined {
  return queryClient.getQueryData<NotificationPreferencesDto>(NOTIFICATION_PREFERENCES_QUERY_KEY);
}

describe("preferences mutation handlers", () => {
  it("optimistically applies the update and returns the snapshot", async () => {
    const queryClient = clientWith(SAVED);
    const handlers = createPreferencesMutationHandlers(queryClient);

    const context = await handlers.onMutate({ prefs: { ...SAVED.prefs, ramp_completed: false } });

    assert.deepEqual(context.previous, SAVED);
    assert.deepEqual(cached(queryClient), {
      emailEnabled: true,
      prefs: { ramp_completed: false, verification_approved: true }
    });
  });

  it("carries a lifted master switch into the optimistic cache", async () => {
    const queryClient = clientWith({ emailEnabled: false, prefs: {} });
    const handlers = createPreferencesMutationHandlers(queryClient);

    await handlers.onMutate({ emailEnabled: true, prefs: { ramp_completed: true } });

    assert.equal(cached(queryClient)?.emailEnabled, true);
  });

  it("rolls the cache back when the PUT fails", async () => {
    const queryClient = clientWith(SAVED);
    const handlers = createPreferencesMutationHandlers(queryClient);

    const context = await handlers.onMutate({ prefs: { ramp_completed: false } });
    handlers.onError(new Error("PUT failed"), { prefs: { ramp_completed: false } }, context);

    assert.deepEqual(cached(queryClient), SAVED);
  });

  it("does not fabricate cache state when nothing was loaded", async () => {
    const queryClient = clientWith(undefined);
    const handlers = createPreferencesMutationHandlers(queryClient);

    const context = await handlers.onMutate({ prefs: { ramp_completed: false } });
    handlers.onError(new Error("PUT failed"), { prefs: { ramp_completed: false } }, context);

    assert.equal(context.previous, undefined);
    assert.equal(cached(queryClient), undefined);
  });
});
