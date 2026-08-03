import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * SSRF protection for webhook callback URLs.
 *
 * `assertAllowedWebhookUrl` runs at registration: HTTPS only, no embedded
 * credentials, and no IP-literal host in a non-public range.
 * `assertResolvesToPublicAddress` runs before every delivery: the hostname is
 * resolved fresh and every returned address must be public, so a DNS record
 * cannot be re-pointed at internal infrastructure after registration. A
 * resolve-then-connect race remains (fetch resolves independently); redirects
 * are disabled at the fetch call so a public host cannot bounce the request
 * to a private one.
 */

// IANA IPv4 Special-Purpose Address Registry. Anything listed there is not publicly
// routable, so a webhook pointing at one either reaches internal infrastructure or can
// never deliver; both are rejected.
function isPublicIPv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  const [a, b, c] = octets;
  if (a === 0 || a === 10 || a === 127) return false; // "this" network, private, loopback
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT 100.64/10
  if (a === 169 && b === 254) return false; // link-local
  if (a === 172 && b >= 16 && b <= 31) return false; // private 172.16/12
  if (a === 192 && b === 0 && c === 0) return false; // IETF protocol assignments 192.0.0.0/24
  if (a === 192 && b === 0 && c === 2) return false; // TEST-NET-1 192.0.2.0/24
  if (a === 192 && b === 88 && c === 99) return false; // 6to4 relay anycast (deprecated)
  if (a === 192 && b === 168) return false; // private
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking 198.18/15
  if (a === 198 && b === 51 && c === 100) return false; // TEST-NET-2 198.51.100.0/24
  if (a === 203 && b === 0 && c === 113) return false; // TEST-NET-3 203.0.113.0/24
  if (a >= 224) return false; // multicast + reserved 224/4, 240/4, broadcast
  return true;
}

// IANA IPv6 Special-Purpose Address Registry equivalent of the IPv4 check above.
function isPublicIPv6(address: string): boolean {
  const lower = address.toLowerCase();
  // IPv4-mapped/translated (::ffff:a.b.c.d) — judge the embedded IPv4.
  const v4Match = lower.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4Match) return isPublicIPv4(v4Match[1]);
  if (lower === "::" || lower === "::1") return false; // unspecified, loopback
  const firstHextet = Number.parseInt(lower.split(":").find(part => part !== "") ?? "0", 16);
  if ((firstHextet & 0xfe00) === 0xfc00) return false; // unique-local fc00::/7
  if ((firstHextet & 0xffc0) === 0xfe80) return false; // link-local fe80::/10
  if ((firstHextet & 0xffc0) === 0xfec0) return false; // site-local fec0::/10 (deprecated, still routed in some networks)
  if ((firstHextet & 0xff00) === 0xff00) return false; // multicast ff00::/8
  if (firstHextet === 0x0100 && lower.startsWith("100:")) return false; // discard-only 100::/64
  if (firstHextet === 0x2001) {
    if (lower.startsWith("2001:db8")) return false; // documentation 2001:db8::/32
    if (lower.startsWith("2001:2:")) return false; // benchmarking 2001:2::/48
    if (lower.startsWith("2001:10:") || lower.startsWith("2001:20:")) return false; // ORCHID/ORCHIDv2
    if (lower.startsWith("2001:0:") || lower === "2001::") return false; // Teredo 2001::/32
  }
  if (firstHextet === 0x2002) return false; // 6to4 2002::/16 (deprecated)
  if (firstHextet === 0x3fff) return false; // documentation 3fff::/20
  if ((firstHextet & 0xfffe) === 0x0064 && lower.startsWith("64:ff9b")) return false; // NAT64 well-known prefix
  return true;
}

export function isPublicIpAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPublicIPv4(address);
  if (version === 6) return isPublicIPv6(address);
  return false;
}

/** Syntactic checks at registration time. Returns an error message, or null if allowed. */
export function getWebhookUrlViolation(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return "Invalid URL format";
  }
  if (url.protocol !== "https:") {
    return "Webhook URL must use HTTPS";
  }
  if (url.username || url.password) {
    return "Webhook URL must not contain credentials";
  }
  // Bracketed IPv6 literals arrive as "[::1]" — strip for isIP.
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) !== 0 && !isPublicIpAddress(host)) {
    return "Webhook URL must not point to a private or reserved address";
  }
  return null;
}

export type HostResolution =
  | { kind: "public" }
  | { kind: "non-public"; hostname: string; address: string }
  | { kind: "unresolved"; hostname: string; reason: string };

/**
 * Resolve the URL's hostname and classify it. IP literals are judged directly without a
 * DNS lookup. The three outcomes are deliberately distinct because registration and
 * delivery treat "did not resolve" differently — see the two callers below.
 */
export async function resolveHostPolicy(rawUrl: string): Promise<HostResolution> {
  const hostname = new URL(rawUrl).hostname.replace(/^\[|\]$/g, "");
  let addresses: { address: string }[];
  try {
    addresses = isIP(hostname) !== 0 ? [{ address: hostname }] : await lookup(hostname, { all: true, verbatim: true });
  } catch (error) {
    return { hostname, kind: "unresolved", reason: error instanceof Error ? error.message : String(error) };
  }
  if (addresses.length === 0) {
    return { hostname, kind: "unresolved", reason: "no addresses returned" };
  }
  for (const { address } of addresses) {
    if (!isPublicIpAddress(address)) {
      return { address, hostname, kind: "non-public" };
    }
  }
  return { kind: "public" };
}

/**
 * Registration-time check. Rejects only a host that actually resolves somewhere we refuse
 * to talk to. A host that does not resolve yet is allowed — DNS is often provisioned after
 * the integration is set up, and every delivery re-resolves and re-validates regardless.
 * Returns a violation message, or null if allowed.
 */
export async function getResolvedUrlViolation(rawUrl: string): Promise<string | null> {
  const resolution = await resolveHostPolicy(rawUrl);
  if (resolution.kind === "non-public") {
    return `Webhook host ${resolution.hostname} resolves to non-public address ${resolution.address}`;
  }
  return null;
}

/**
 * Delivery-time check: fails closed on both non-public and unresolvable hosts, since
 * neither can produce a legitimate delivery. Called before every attempt so a DNS record
 * re-pointed after registration is still caught.
 */
export async function assertResolvesToPublicAddress(rawUrl: string): Promise<void> {
  const resolution = await resolveHostPolicy(rawUrl);
  if (resolution.kind === "non-public") {
    throw new Error(`Webhook host ${resolution.hostname} resolves to non-public address ${resolution.address}`);
  }
  if (resolution.kind === "unresolved") {
    throw new Error(`Webhook host ${resolution.hostname} did not resolve: ${resolution.reason}`);
  }
}
