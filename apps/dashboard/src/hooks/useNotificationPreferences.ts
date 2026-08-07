import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type EmailNotificationCategory,
  isCategoryEnabled,
  type NotificationPreferencesDto,
  NotificationPreferencesService,
  prefsWithCategory
} from "@/services/api/notification-preferences.service";

export const NOTIFICATION_PREFERENCES_QUERY_KEY = ["notification-preferences"] as const;

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
    mutationFn: NotificationPreferencesService.updatePrefs,
    onError: (_error, _prefs, previous) => {
      if (previous) {
        queryClient.setQueryData(NOTIFICATION_PREFERENCES_QUERY_KEY, previous);
      }
    },
    onMutate: async prefs => {
      await queryClient.cancelQueries({ queryKey: NOTIFICATION_PREFERENCES_QUERY_KEY });
      const previous = queryClient.getQueryData<NotificationPreferencesDto>(NOTIFICATION_PREFERENCES_QUERY_KEY);
      if (previous) {
        queryClient.setQueryData<NotificationPreferencesDto>(NOTIFICATION_PREFERENCES_QUERY_KEY, { ...previous, prefs });
      }
      return previous;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: NOTIFICATION_PREFERENCES_QUERY_KEY })
  });

  const categoryEnabled = (category: EmailNotificationCategory): boolean =>
    query.data ? isCategoryEnabled(query.data.prefs, category) : true;

  const setCategoryEnabled = (category: EmailNotificationCategory, enabled: boolean): void => {
    mutation.mutate(prefsWithCategory(query.data?.prefs ?? {}, category, enabled));
  };

  return { categoryEnabled, isLoading: query.isLoading, setCategoryEnabled };
}
