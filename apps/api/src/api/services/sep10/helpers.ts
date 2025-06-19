import { TOKEN_CONFIG } from "@packages/shared";
import { Operation, Transaction } from "stellar-sdk";

interface TokenConfig {
  tomlFileUrl: string;
  homeDomain: string;
  clientDomainEnabled: boolean;
  memoEnabled: boolean;
}

export const getOutToken = (outToken: keyof typeof TOKEN_CONFIG): TokenConfig => TOKEN_CONFIG[outToken] as TokenConfig;

export const validateTransaction = (transaction: Transaction, anchorSigningKey: string, memo: string | null) => {
  if (transaction.source !== anchorSigningKey) {
    throw new Error(`Invalid source account: ${transaction.source}`);
  }
  if (transaction.sequence !== "0") {
    throw new Error(`Invalid sequence number: ${transaction.sequence}`);
  }
  if (transaction.memo.value !== memo) {
    throw new Error("Memo does not match with specified user signature or address. Could not validate.");
  }
};

export const validateFirstOperation = (
  operation: Operation,
  clientPublicKey: string,
  homeDomain: string,
  memo: string | null,
  memoEnabled: boolean,
  masterPublicKey: string
) => {
  if (operation.type !== "manageData") {
    throw new Error("The first operation should be manageData");
  }

  if (operation.source !== clientPublicKey) {
    throw new Error("First manageData operation must have the client account as the source");
  }

  if (memo !== null && memoEnabled) {
    if (operation.source !== masterPublicKey) {
      throw new Error("First manageData operation must have the master signing key as the source when memo is being used.");
    }
  }

  if (operation.name !== `${homeDomain} auth`) {
    throw new Error(`First manageData operation should have key '${homeDomain} auth'`);
  }
  if (!operation.value || operation.value.length !== 64) {
    throw new Error("First manageData operation should have a 64-byte random nonce as value");
  }
};

export const validateRemainingOperations = (
  operations: Operation[],
  anchorSigningKey: string,
  clientDomainPublicKey: string,
  clientDomainEnabled: boolean
) => {
  let hasWebAuthDomain = false;
  let hasClientDomain = false;

  for (let i = 1; i < operations.length; i++) {
    const op = operations[i];

    if (op.type !== "manageData") {
      throw new Error("All operations should be manage_data operations");
    }

    if (op.name === "web_auth_domain") {
      hasWebAuthDomain = true;
      if (op.source !== anchorSigningKey) {
        throw new Error("web_auth_domain manage_data operation must have the server account as the source");
      }
    }

    if (op.name === "client_domain") {
      hasClientDomain = true;
      if (op.source !== clientDomainPublicKey) {
        throw new Error("client_domain manage_data operation must have the client domain account as the source");
      }
    }
  }

  if (!hasWebAuthDomain) {
    throw new Error("Transaction must contain a web_auth_domain manageData operation");
  }
  if (!hasClientDomain && clientDomainEnabled) {
    throw new Error("Transaction must contain a client_domain manageData operation");
  }
};
