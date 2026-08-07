import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type EmailNotificationCategory,
  isCategoryEnabled,
  type NotificationPreferencesDto,
  NotificationPreferencesService,
  type NotificationPreferencesUpdate,
  preferencesUpdateFor
} from "@/services/api/notification-preferences.service";

export const NOTIFICATION_PREFERENCES_QUERY_KEY = ["notification-preferences"] as const;

/**
 * Optimistic-update handlers for the preferences mutation, extracted so the cache and
 * rollback semantics are testable against a real QueryClient without rendering React.
 */
export function createPreferencesMutationHandlers(queryClient: QueryClient) {
  return {
    onError: (
      _error: unknown,
      _update: NotificationPreferencesUpdate,
      context: { previous: NotificationPreferencesDto | undefined } | undefined
    ) => {
      if (context?.previous) {
        queryClient.setQueryData(NOTIFICATION_PREFERENCES_QUERY_KEY, context.previous);
      }
    },
    onMutate: async (update: NotificationPreferencesUpdate) => {
      await queryClient.cancelQueries({ queryKey: NOTIFICATION_PREFERENCES_QUERY_KEY });
      const previous = queryClient.getQueryData<NotificationPreferencesDto>(NOTIFICATION_PREFERENCES_QUERY_KEY);
      if (previous) {
        queryClient.setQueryData<NotificationPreferencesDto>(NOTIFICATION_PREFERENCES_QUERY_KEY, {
          emailEnabled: update.emailEnabled ?? previous.emailEnabled,
          prefs: update.prefs
        });
      }
      return { previous };
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: NOTIFICATION_PREFERENCES_QUERY_KEY })
  };
}

/**
 * The user's email notification opt-outs, exposed as per-category toggles.
 * Toggles apply optimistically — a checkbox that lags its click reads as broken —
 * and roll back if the PUT fails.
 */
export function useNotificationPreferences() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryFn: NotificationPreferencesService.get,
    queryKey: NOTIFICATION_PREFERENCES_QUERY_KEY
  });

  const mutation = useMutation({
    mutationFn: NotificationPreferencesService.update,
    ...createPreferencesMutationHandlers(queryClient)
  });

  const categoryEnabled = (category: EmailNotificationCategory): boolean =>
    query.data ? isCategoryEnabled(query.data, category) : true;

  // Never PUT before the GET has resolved: the update is a full document, so a body
  // built from a fallback would replace the saved preferences and wipe keys this page
  // does not own.
  const setCategoryEnabled = (category: EmailNotificationCategory, enabled: boolean): void => {
    if (!query.data) {
      return;
    }
    mutation.mutate(preferencesUpdateFor(query.data, category, enabled));
  };

  return {
    categoryEnabled,
    // Interactive only with loaded data and no PUT in flight: overlapping full-document
    // PUTs can complete out of order, with the older snapshot winning.
    controlsDisabled: query.data === undefined || mutation.isPending,
    setCategoryEnabled
  };
}
