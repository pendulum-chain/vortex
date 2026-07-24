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

function isPublicIPv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  const [a, b] = octets;
  if (a === 0 || a === 10 || a === 127) return false; // "this" network, private, loopback
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT 100.64/10
  if (a === 169 && b === 254) return false; // link-local
  if (a === 172 && b >= 16 && b <= 31) return false; // private 172.16/12
  if (a === 192 && b === 168) return false; // private
  if (a === 192 && b === 0 && octets[2] === 0) return false; // IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking 198.18/15
  if (a >= 224) return false; // multicast + reserved 224/4, 240/4, broadcast
  return true;
}

function isPublicIPv6(address: string): boolean {
  const lower = address.toLowerCase();
  // IPv4-mapped/translated (::ffff:a.b.c.d) — judge the embedded IPv4.
  const v4Match = lower.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4Match) return isPublicIPv4(v4Match[1]);
  if (lower === "::" || lower === "::1") return false; // unspecified, loopback
  const firstHextet = Number.parseInt(lower.split(":").find(part => part !== "") ?? "0", 16);
  if ((firstHextet & 0xfe00) === 0xfc00) return false; // unique-local fc00::/7
  if ((firstHextet & 0xffc0) === 0xfe80) return false; // link-local fe80::/10
  if ((firstHextet & 0xff00) === 0xff00) return false; // multicast ff00::/8
  if (firstHextet === 0x2001 && lower.startsWith("2001:db8")) return false; // documentation
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

/** Resolves the URL's hostname and throws if any address is non-public. Called before every delivery. */
export async function assertResolvesToPublicAddress(rawUrl: string): Promise<void> {
  const hostname = new URL(rawUrl).hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(hostname) !== 0 ? [{ address: hostname }] : await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0) {
    throw new Error(`Webhook host ${hostname} did not resolve to any address`);
  }
  for (const { address } of addresses) {
    if (!isPublicIpAddress(address)) {
      throw new Error(`Webhook host ${hostname} resolves to non-public address ${address}`);
    }
  }
}
