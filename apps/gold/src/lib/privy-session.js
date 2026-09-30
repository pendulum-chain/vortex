// Privy stores its session as privy:[<namespace>:]token, and a Google sign-in returns to the page with
// privy_oauth_code in the URL before that key exists. Either way the dashboard is about to load, so the
// landing must not flash by first.
export function hasPrivySession(storageKeys, search) {
  return storageKeys.some((key) => /^privy:(.+:)?(refresh_)?token$/.test(key)) || new URLSearchParams(search).has("privy_oauth_code");
}
