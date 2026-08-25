import type { AuthTokens } from "./auth";

const TOKEN_REFRESH_SKEW_MS = 60 * 1000;
const TOKEN_REFRESH_RETRY_MS = 30 * 1000;

type Timer = ReturnType<typeof setTimeout>;
type TimerCallback = () => void | Promise<void>;

interface TokenRefreshOptions {
  clearTimer?: (timer: Timer) => void;
  getExpiryMs: () => number | null;
  now?: () => number;
  onInvalid: () => void;
  refresh: () => Promise<AuthTokens | null>;
  setTimer?: (callback: TimerCallback, delay: number) => Timer;
}

export function startTokenRefresh({
  clearTimer = clearTimeout,
  getExpiryMs,
  now = Date.now,
  onInvalid,
  refresh,
  setTimer = setTimeout
}: TokenRefreshOptions): () => void {
  let cancelled = false;
  let timer: Timer | undefined;

  const scheduleNext = () => {
    if (cancelled) return;

    const expiryMs = getExpiryMs();
    const delay = expiryMs === null ? TOKEN_REFRESH_RETRY_MS : Math.max(expiryMs - now() - TOKEN_REFRESH_SKEW_MS, 0);

    if (expiryMs === null) {
      timer = setTimer(scheduleNext, delay);
      return;
    }

    timer = setTimer(async () => {
      if (cancelled) return;

      try {
        const refreshed = await refresh();
        if (cancelled) return;

        if (refreshed) {
          scheduleNext();
        } else {
          onInvalid();
        }
      } catch {
        if (!cancelled) {
          timer = setTimer(scheduleNext, TOKEN_REFRESH_RETRY_MS);
        }
      }
    }, delay);
  };

  scheduleNext();

  return () => {
    cancelled = true;
    if (timer) clearTimer(timer);
  };
}
