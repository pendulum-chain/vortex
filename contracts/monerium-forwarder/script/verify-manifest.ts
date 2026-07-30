#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { Address, createPublicClient, Hex, http, keccak256, PublicClient } from "viem";
import {
  eip1167RuntimeCode,
  enumerateForwarders,
  ForwarderManifestEntry,
  MANIFEST_VERSION,
  Manifest,
  readCoreState,
  readForwarderEntry,
  resolveDeployProvenance
} from "./manifest-core";

/**
 * Re-checks every field of a published config manifest against live chain state and
 * exits nonzero with a field-level diff on mismatch. Self-contained: needs only this
 * repo checkout (`bun install` once for viem), the manifest file, and any public RPC —
 * runnable by third parties:
 *
 *   bun script/verify-manifest.ts <manifestFile> <rpcUrl> [--logs-rpc <url>]
 *
 * Deploy provenance is verified from each forwarder's deploy transaction RECEIPT (the
 * receipt must contain the factory's ForwarderDeployed event), which works on any full
 * node. Only the completeness check — "no forwarders were deployed that the manifest
 * does not list" — needs historical eth_getLogs; many free RPCs gate that behind
 * archive plans, so pass --logs-rpc with a logs-capable endpoint or accept a NOTICE
 * that completeness was not checked.
 *
 * What a PASS means — and what it does not (re-review R01): the manifest is
 * CONSISTENCY EVIDENCE, NOT A TRUST ROOT. A pass proves the deployment still matches
 * what Vortex published, i.e. nothing changed silently. It does NOT prove the
 * published configuration was correct or honest — for that, read the verified
 * contract source on a block explorer.
 *
 * Severity classes:
 *   FAIL                 immutable/bytecode/deploy-provenance mismatch -> exit 1
 *   EXPECTED-TRANSITION  clientMutable fields (destination/fallbackAddress) changed by
 *                        the client's own fallbackAddress (`onlyFallback` in the
 *                        contract). Owner-authorized, not an incident (re-review R07);
 *                        regenerate + republish the manifest. exit 0
 *   NOTICE               guardian-tunable operational parameters, a stale forwarder
 *                        list (new deployments since publication), or a skipped
 *                        completeness check. exit 0
 */

type Severity = "FAIL" | "EXPECTED-TRANSITION" | "NOTICE";

interface Diff {
  actual: string;
  expected: string;
  path: string;
  severity: Severity;
}

function flatten(value: unknown, prefix: string, out: Map<string, string>): void {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, out);
    }
    return;
  }
  out.set(prefix, String(value));
}

function severityFor(path: string): Severity {
  if (path.includes(".clientMutable.")) return "EXPECTED-TRANSITION";
  if (path.includes(".operational.")) return "NOTICE";
  return "FAIL";
}

function diffSection(path: string, expected: unknown, actual: unknown, diffs: Diff[]): void {
  const expectedFlat = new Map<string, string>();
  const actualFlat = new Map<string, string>();
  flatten(expected, path, expectedFlat);
  flatten(actual, path, actualFlat);
  for (const key of new Set([...expectedFlat.keys(), ...actualFlat.keys()])) {
    const expectedValue = expectedFlat.get(key) ?? "<missing>";
    const actualValue = actualFlat.get(key) ?? "<missing>";
    if (expectedValue !== actualValue) {
      diffs.push({ actual: actualValue, expected: expectedValue, path: key, severity: severityFor(key) });
    }
  }
}

async function verifyForwarder(
  client: PublicClient,
  manifest: Manifest,
  entry: ForwarderManifestEntry,
  expectedCloneHash: Hex,
  diffs: Diff[]
): Promise<void> {
  const factory = manifest.factory.address as Address;
  const forwarder = entry.address as Address;
  let live: ForwarderManifestEntry;
  try {
    // Provenance from the deploy tx receipt: must contain the factory's
    // ForwarderDeployed event for this forwarder (works on any full node).
    const provenance = await resolveDeployProvenance(client, factory, forwarder, entry.deploy.txHash);
    live = await readForwarderEntry(client, factory, forwarder, provenance);
  } catch (error) {
    diffs.push({
      actual: `<${error instanceof Error ? error.message : String(error)}>`,
      expected: "verifiable forwarder",
      path: `forwarders.${entry.address}`,
      severity: "FAIL"
    });
    return;
  }
  diffSection(`forwarders.${entry.address}`, entry, live, diffs);
  if (live.runtimeBytecodeHash.toLowerCase() !== expectedCloneHash.toLowerCase()) {
    diffs.push({
      actual: live.runtimeBytecodeHash,
      expected: expectedCloneHash,
      path: `forwarders.${entry.address}.runtimeBytecodeHash (EIP-1167 for implementation)`,
      severity: "FAIL"
    });
  }
}

async function checkCompleteness(logsClient: PublicClient, manifest: Manifest, diffs: Diff[]): Promise<void> {
  try {
    const deployed = await enumerateForwarders(logsClient, manifest.factory.address as Address);
    const listed = new Set(manifest.forwarders.map(entry => entry.address.toLowerCase()));
    for (const { forwarder } of deployed) {
      if (!listed.has(forwarder.toLowerCase())) {
        // Deployed after publication: stale manifest, not tampering — regenerate.
        diffs.push({ actual: forwarder, expected: "<not in manifest>", path: `forwarders.${forwarder}`, severity: "NOTICE" });
      }
    }
  } catch {
    diffs.push({
      actual: "<skipped: RPC does not serve historical eth_getLogs — pass --logs-rpc with a logs-capable endpoint>",
      expected: "ForwarderDeployed enumeration",
      path: "forwarders.<completeness>",
      severity: "NOTICE"
    });
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const positional: string[] = [];
  let logsRpcUrl: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--logs-rpc") {
      logsRpcUrl = argv[++i];
    } else {
      positional.push(argv[i]);
    }
  }
  const [manifestFile, rpcUrl] = positional;
  if (!manifestFile || !rpcUrl) {
    console.error("Usage: bun script/verify-manifest.ts <manifestFile> <rpcUrl> [--logs-rpc <url>]");
    process.exit(2);
  }

  const manifest = JSON.parse(readFileSync(manifestFile, "utf8")) as Manifest;
  if (manifest.manifestVersion !== MANIFEST_VERSION) {
    console.error(`error: manifest version ${manifest.manifestVersion} is not supported (expected ${MANIFEST_VERSION})`);
    process.exit(1);
  }

  const client = createPublicClient({ transport: http(rpcUrl) });
  const logsClient: PublicClient = logsRpcUrl ? createPublicClient({ transport: http(logsRpcUrl) }) : client;

  console.error(`re-reading live state for factory ${manifest.factory.address} ...`);
  const core = await readCoreState(client, manifest.factory.address as Address);

  const diffs: Diff[] = [];
  diffSection("chainId", manifest.chainId, core.chainId, diffs);
  diffSection("factory", manifest.factory, core.factory, diffs);
  diffSection("implementation", manifest.implementation, core.implementation, diffs);

  // Every clone's runtime code must be the EIP-1167 proxy for the published
  // implementation — checked against live state below.
  const expectedCloneHash = keccak256(eip1167RuntimeCode(manifest.implementation.address as Address));
  for (const entry of manifest.forwarders) {
    await verifyForwarder(client, manifest, entry, expectedCloneHash, diffs);
  }
  await checkCompleteness(logsClient, manifest, diffs);

  for (const diff of diffs) {
    console.log(`[${diff.severity}] ${diff.path}: manifest=${diff.expected} live=${diff.actual}`);
  }

  const failures = diffs.filter(diff => diff.severity === "FAIL").length;
  const transitions = diffs.filter(diff => diff.severity === "EXPECTED-TRANSITION").length;
  const notices = diffs.filter(diff => diff.severity === "NOTICE").length;

  if (failures > 0) {
    console.log(`VERIFICATION FAILED: ${failures} mismatch(es), ${transitions} expected transition(s), ${notices} notice(s)`);
    process.exit(1);
  }
  if (transitions > 0 || notices > 0) {
    console.log(
      `VERIFICATION PASSED with ${transitions} owner-authorized transition(s) and ${notices} notice(s) — ` +
        "regenerate and republish the manifest to fold them in (consistency evidence only, NOT a trust root — R01)"
    );
    return;
  }
  console.log(
    `VERIFICATION PASSED: all ${manifest.forwarders.length} forwarder(s), implementation and factory match the manifest ` +
      "(consistency evidence only, NOT a trust root — R01)"
  );
}

main().catch(error => {
  console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
