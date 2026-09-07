// Only membership invitation links need a login return destination. An allowlist
// avoids external redirects, encoded separators, and recursive login redirects.
export function safeLoginReturnTo(value: unknown): string | undefined {
  return typeof value === "string" &&
    value === value.trim() &&
    /^\/member-invitations\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value
    : undefined;
}
