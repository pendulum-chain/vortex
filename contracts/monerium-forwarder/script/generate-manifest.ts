#!/usr/bin/env bun
import { writeFileSync } from "node:fs";
import { Address, createPublicClient, http, isAddress, PublicClient } from "viem";
import {
  enumerateForwarders,
  MANIFEST_PURPOSE,
  MANIFEST_VERSION,
  Manifest,
  readCoreState,
  readForwarderEntry
} from "./manifest-core";

/**
 * Emits a versioned JSON config manifest for a VortexForwarderFactory deployment
 * (Monerium B2B onramp, implementation plan D3): factory + implementation runtime
 * bytecode hashes, all implementation-level immutables, and per-clone config with
 * deploy transaction provenance (ForwarderDeployed events).
 *
 * The manifest is CONSISTENCY EVIDENCE, NOT A TRUST ROOT (re-review R01): it is
 * produced by Vortex from the same chain state it attests to. Publishing it lets
 * third parties detect silent changes (via verify-manifest.ts) — it does not prove
 * the deployment was honest in the first place.
 *
 * Usage:
 *   bun script/generate-manifest.ts <factoryAddress> <rpcUrl> [outFile] [--logs-rpc <url>]
 *
 * Without [outFile] the manifest is printed to stdout (progress goes to stderr).
 * --logs-rpc: many free public RPCs refuse historical eth_getLogs ("archive" gating);
 * pass a logs-capable endpoint here for the ForwarderDeployed enumeration — every
 * other read still goes through <rpcUrl>.
 */

function parseArgs(argv: string[]): { factoryAddress: Address; logsRpcUrl?: string; outFile?: string; rpcUrl: string } {
  const positional: string[] = [];
  let logsRpcUrl: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--logs-rpc") {
      logsRpcUrl = argv[++i];
    } else {
      positional.push(argv[i]);
    }
  }
  const [factoryAddress, rpcUrl, outFile] = positional;
  if (!factoryAddress || !rpcUrl) {
    console.error("Usage: bun script/generate-manifest.ts <factoryAddress> <rpcUrl> [outFile] [--logs-rpc <url>]");
    process.exit(2);
  }
  if (!isAddress(factoryAddress)) {
    console.error(`error: ${factoryAddress} is not a valid address`);
    process.exit(2);
  }
  return { factoryAddress: factoryAddress as Address, logsRpcUrl, outFile, rpcUrl };
}

async function main(): Promise<void> {
  const { factoryAddress, logsRpcUrl, outFile, rpcUrl } = parseArgs(process.argv.slice(2));

  const client = createPublicClient({ transport: http(rpcUrl) });
  const logsClient: PublicClient = logsRpcUrl ? createPublicClient({ transport: http(logsRpcUrl) }) : client;

  console.error(`reading deployment state for factory ${factoryAddress} ...`);
  const core = await readCoreState(client, factoryAddress);
  const deployed = await enumerateForwarders(logsClient, factoryAddress);
  const forwarders = [];
  for (const { deploy, forwarder } of deployed) {
    forwarders.push(await readForwarderEntry(client, factoryAddress, forwarder, deploy));
  }
  const manifest: Manifest = {
    ...core,
    forwarders,
    generatedAt: new Date().toISOString(),
    manifestVersion: MANIFEST_VERSION,
    purpose: MANIFEST_PURPOSE
  };
  console.error(
    `chainId ${manifest.chainId}, implementation ${manifest.implementation.address}, ${manifest.forwarders.length} forwarder(s)`
  );

  const json = `${JSON.stringify(manifest, null, 2)}\n`;
  if (outFile) {
    writeFileSync(outFile, json);
    console.error(`manifest written to ${outFile}`);
  } else {
    process.stdout.write(json);
  }
}

main().catch(error => {
  console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
