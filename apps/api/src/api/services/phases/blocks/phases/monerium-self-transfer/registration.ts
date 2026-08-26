import { EphemeralAccountType } from "@vortexfi/shared";
import { isAddress } from "viem";
import type { RegisterCtx, RegistrationResult } from "../../core/types";
import type { MoneriumIssueRegistrationFacts } from "../monerium-issue/registration";
import { isMoneriumIssueNetwork, MONERIUM_EURE } from "../monerium-issue/simulation";
import type { MoneriumSelfTransferMetadata } from "./simulation";

export type MoneriumSelfTransferRegistrationFacts = Pick<
  MoneriumIssueRegistrationFacts,
  "amountRaw" | "chain" | "owner" | "token"
>;

function readMoneriumIssueFacts(
  priorFacts: Readonly<Record<string, unknown>> | undefined
): MoneriumSelfTransferRegistrationFacts {
  const facts = priorFacts?.moneriumIssue;
  if (!facts || typeof facts !== "object" || Array.isArray(facts)) {
    throw new Error("MoneriumSelfTransfer requires trusted moneriumIssue registration facts");
  }
  const { amountRaw, chain, owner, token } = facts as Record<string, unknown>;
  if (typeof amountRaw !== "string" || !/^\d+$/.test(amountRaw) || BigInt(amountRaw) <= 0n) {
    throw new Error("MoneriumSelfTransfer received an invalid issued amount");
  }
  if (!isMoneriumIssueNetwork(chain) || token !== MONERIUM_EURE || typeof owner !== "string" || !isAddress(owner)) {
    throw new Error("MoneriumSelfTransfer received invalid Monerium issue ownership facts");
  }
  return { amountRaw, chain, owner, token };
}

export async function registerMoneriumSelfTransfer(
  ctx: RegisterCtx<MoneriumSelfTransferMetadata>
): Promise<RegistrationResult<MoneriumSelfTransferRegistrationFacts, MoneriumSelfTransferMetadata>> {
  const facts = readMoneriumIssueFacts(ctx.priorRegistrationFacts);
  const ephemeral = ctx.signingAccounts.find(account => account.type === EphemeralAccountType.EVM);
  if (!ephemeral) {
    throw new Error("MoneriumSelfTransfer requires an EVM ephemeral account");
  }
  if (ephemeral.address.toLowerCase() === facts.owner.toLowerCase()) {
    throw new Error("MoneriumSelfTransfer owner must differ from the EVM ephemeral account");
  }
  if (facts.amountRaw !== ctx.metadata.amountRaw || facts.chain !== ctx.metadata.chain || facts.token !== ctx.metadata.token) {
    throw new Error("MoneriumSelfTransfer issue facts do not match the quoted transfer");
  }
  return { facts: { amountRaw: facts.amountRaw, chain: facts.chain, owner: facts.owner, token: facts.token } };
}
