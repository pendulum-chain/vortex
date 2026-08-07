/**
 * Compare legacy-only Avenia accounts exported by export-unmigrated-avenia-customers.sql
 * with their current provider status. This script never opens a database connection.
 *
 * Usage:
 *   bun scripts/reconcile-unmigrated-avenia-status.ts \
 *     --file /secure/path/unmigrated-avenia.csv \
 *     --output /secure/path/unmigrated-avenia-status.csv
 *
 * BRLA_API_KEY, BRLA_PRIVATE_KEY, BRLA_BASE_URL, and SANDBOX_ENABLED are loaded from
 * apps/api/.env in the same way as other backend scripts. The output contains provider
 * identifiers and must be handled as restricted data.
 */
import { chmodSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(import.meta.dir, "../.env") });

const REQUIRED_HEADERS = [
  "legacy_tax_hash",
  "owner_status",
  "user_id",
  "account_type",
  "sub_account_id",
  "kyc_attempt",
  "legacy_status"
] as const;

type InputRow = Record<(typeof REQUIRED_HEADERS)[number], string>;

type Attempt = {
  id: string;
  status: string;
  result?: string;
  email?: string;
  updatedAt?: string;
  createdAt?: string;
};

type AveniaClient = {
  subaccountInfo(subAccountId: string): Promise<unknown>;
  getKycAttempts(subAccountId: string): Promise<unknown>;
  getKybAttemptStatus(attemptId: string): Promise<unknown>;
};

type Options = {
  file: string;
  output: string;
  delayMs: number;
  timeoutMs: number;
  retries: number;
};

const OUTPUT_HEADERS = [
  ...REQUIRED_HEADERS,
  "provider_account_type",
  "identity_status",
  "attempt_id",
  "attempt_status",
  "attempt_result",
  "normalized_status",
  "avenia_email",
  "avenia_name",
  "discrepancy",
  "checked_at",
  "error_status",
  "error_code"
] as const;

function readOption(name: string): string | undefined {
  const optionIndex = process.argv.indexOf(name);
  if (optionIndex === -1) return undefined;

  const value = process.argv[optionIndex + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function readPositiveInteger(name: string, fallback: number, allowZero = false): number {
  const raw = readOption(name);
  if (raw === undefined) return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || (allowZero ? value < 0 : value <= 0)) {
    throw new Error(`${name} must be ${allowZero ? "a non-negative" : "a positive"} integer`);
  }
  return value;
}

function parseOptions(): Options {
  const file = readOption("--file");
  const output = readOption("--output");
  if (!file || !output) {
    throw new Error("Usage: --file <input.csv> --output <output.csv> [--delay-ms 500] [--timeout-ms 20000] [--retries 2]");
  }

  const resolvedFile = path.resolve(file);
  const resolvedOutput = path.resolve(output);
  if (resolvedFile === resolvedOutput) throw new Error("Input and output paths must be different");

  return {
    delayMs: readPositiveInteger("--delay-ms", 500, true),
    file: resolvedFile,
    output: resolvedOutput,
    retries: readPositiveInteger("--retries", 2, true),
    timeoutMs: readPositiveInteger("--timeout-ms", 20_000)
  };
}

export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index++) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index++;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      if (field.length > 0) throw new Error("Invalid quote in CSV field");
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (character !== "\r") {
      field += character;
    }
  }

  if (quoted) throw new Error("Unterminated quoted CSV field");
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function readInputRows(input: string): InputRow[] {
  const parsed = parseCsv(input.replace(/^\uFEFF/, ""));
  const headers = parsed.shift();
  if (!headers) throw new Error("Input CSV is empty");

  for (const required of REQUIRED_HEADERS) {
    if (!headers.includes(required)) throw new Error(`Input CSV is missing required header: ${required}`);
  }

  return parsed
    .filter(values => values.some(value => value.length > 0))
    .map((values, rowIndex) => {
      if (values.length !== headers.length)
        throw new Error(`CSV row ${rowIndex + 2} has ${values.length} fields; expected ${headers.length}`);
      const valuesByHeader = Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""]));
      const row = Object.fromEntries(REQUIRED_HEADERS.map(header => [header, valuesByHeader[header] ?? ""])) as InputRow;
      validateInputRow(row, rowIndex + 2);
      return row;
    });
}

function validateInputRow(row: InputRow, rowNumber: number): void {
  if (!/^[0-9a-f]{64}$/.test(row.legacy_tax_hash)) throw new Error(`CSV row ${rowNumber} has an invalid legacy_tax_hash`);
  if (row.owner_status !== "OWNERLESS" && row.owner_status !== "USER_OWNED") {
    throw new Error(`CSV row ${rowNumber} has an invalid owner_status`);
  }
  if (row.account_type !== "INDIVIDUAL" && row.account_type !== "COMPANY") {
    throw new Error(`CSV row ${rowNumber} has an invalid account_type`);
  }
  if (!row.sub_account_id) throw new Error(`CSV row ${rowNumber} has no sub_account_id`);
  if (row.kyc_attempt && !/^[A-Za-z0-9_-]+$/.test(row.kyc_attempt)) {
    throw new Error(`CSV row ${rowNumber} has an unsafe kyc_attempt`);
  }
}

function csvCell(value: unknown): string {
  const raw = value === undefined || value === null ? "" : String(value);
  const text = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function serializeCsv(rows: Record<string, unknown>[]): string {
  return `${OUTPUT_HEADERS.join(",")}\n${rows.map(row => OUTPUT_HEADERS.map(header => csvCell(row[header])).join(",")).join("\n")}\n`;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

function parseAccountInfo(value: unknown): { accountType: string; identityStatus: string; name: string } {
  const accountInfo = asRecord(asRecord(value)?.accountInfo);
  if (
    !accountInfo ||
    (accountInfo.accountType !== "INDIVIDUAL" && accountInfo.accountType !== "COMPANY") ||
    (accountInfo.identityStatus !== "NOT-IDENTIFIED" && accountInfo.identityStatus !== "CONFIRMED")
  ) {
    throw new Error("Avenia returned malformed account information");
  }
  const individualName = typeof accountInfo.fullName === "string" ? accountInfo.fullName : "";
  const companyName = typeof accountInfo.name === "string" ? accountInfo.name : "";
  return {
    accountType: accountInfo.accountType,
    identityStatus: accountInfo.identityStatus,
    name: (accountInfo.accountType === "COMPANY" ? companyName || individualName : individualName || companyName).trim()
  };
}

function parseAttempt(value: unknown): Attempt {
  const attempt = asRecord(value);
  if (
    !attempt ||
    typeof attempt.id !== "string" ||
    !/^[A-Za-z0-9_-]+$/.test(attempt.id) ||
    !["PENDING", "PROCESSING", "COMPLETED", "EXPIRED"].includes(String(attempt.status)) ||
    (attempt.result !== undefined && attempt.result !== "APPROVED" && attempt.result !== "REJECTED")
  ) {
    throw new Error("Avenia returned a malformed verification attempt");
  }
  const submissionData = asRecord(attempt.submissionData);
  return {
    createdAt: typeof attempt.createdAt === "string" ? attempt.createdAt : undefined,
    email: typeof submissionData?.email === "string" ? submissionData.email.trim() : undefined,
    id: attempt.id,
    result: typeof attempt.result === "string" ? attempt.result : undefined,
    status: String(attempt.status),
    updatedAt: typeof attempt.updatedAt === "string" ? attempt.updatedAt : undefined
  };
}

function parseIndividualAttempt(value: unknown): Attempt | undefined {
  const attempts = asRecord(value)?.attempts;
  if (!Array.isArray(attempts)) throw new Error("Avenia returned a malformed KYC attempt list");

  return attempts.map(parseAttempt).sort((left, right) => {
    const rightTime = Date.parse(right.updatedAt ?? right.createdAt ?? "") || 0;
    const leftTime = Date.parse(left.updatedAt ?? left.createdAt ?? "") || 0;
    return rightTime - leftTime;
  })[0];
}

function parseCompanyAttempt(value: unknown, expectedId: string): Attempt {
  const attempt = parseAttempt(asRecord(value)?.attempt);
  if (attempt.id !== expectedId) throw new Error("Avenia returned a different KYB attempt ID");
  return attempt;
}

export function normalizeStatus(identityStatus: string, attempt: Attempt | undefined, accountType: string): string {
  if (identityStatus === "CONFIRMED") return "approved";
  if (!attempt) return "unknown_not_confirmed";
  if (attempt.status === "COMPLETED" && attempt.result === "APPROVED") return "approved";
  if (attempt.status === "COMPLETED" && attempt.result === "REJECTED") return "rejected";
  if (attempt.status === "PROCESSING") return "in_review";
  if (attempt.status === "PENDING") return "pending";
  if (attempt.status === "EXPIRED") return accountType === "COMPANY" ? "rejected" : "pending";
  return "unknown_not_confirmed";
}

function errorStatus(error: unknown): number | undefined {
  const status = asRecord(error)?.status;
  return typeof status === "number" ? status : undefined;
}

function isAuthenticationError(error: unknown): boolean {
  const status = errorStatus(error);
  return status === 401 || status === 403 || (error instanceof Error && error.message === "Authorization error.");
}

function isRetryable(error: unknown): boolean {
  const status = errorStatus(error);
  return status === 0 || status === 408 || status === 429 || (status !== undefined && status >= 500);
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function callWithRetry<T>(operation: () => Promise<T>, retries: number): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (isAuthenticationError(error) || !isRetryable(error) || attempt >= retries) throw error;
      await sleep(500 * 2 ** attempt + Math.floor(Math.random() * 250));
    }
  }
}

export async function reconcileRow(row: InputRow, client: AveniaClient, retries: number): Promise<Record<string, unknown>> {
  const checkedAt = new Date().toISOString();
  try {
    const account = parseAccountInfo(await callWithRetry(() => client.subaccountInfo(row.sub_account_id), retries));
    let attempt: Attempt | undefined;
    let discrepancy = account.accountType === row.account_type ? "" : "account_type_mismatch";
    let enrichmentErrorStatus: number | string = "";
    let enrichmentErrorCode = "";

    if (account.identityStatus !== "CONFIRMED") {
      if (row.account_type === "COMPANY") {
        if (row.kyc_attempt) {
          attempt = parseCompanyAttempt(
            await callWithRetry(() => client.getKybAttemptStatus(row.kyc_attempt), retries),
            row.kyc_attempt
          );
        } else {
          discrepancy = [discrepancy, "missing_company_attempt"].filter(Boolean).join(";");
        }
      } else {
        attempt = parseIndividualAttempt(await callWithRetry(() => client.getKycAttempts(row.sub_account_id), retries));
      }
    } else if (row.account_type === "INDIVIDUAL") {
      try {
        attempt = parseIndividualAttempt(await callWithRetry(() => client.getKycAttempts(row.sub_account_id), retries));
      } catch (error) {
        if (isAuthenticationError(error)) throw error;
        enrichmentErrorStatus = errorStatus(error) ?? "";
        enrichmentErrorCode =
          error instanceof Error && error.message.startsWith("Avenia returned")
            ? "basic_info_malformed_response"
            : "basic_info_request_failed";
      }
    }

    const normalizedStatus = normalizeStatus(account.identityStatus, attempt, row.account_type);
    const includeBasicInfo = normalizedStatus === "approved" || normalizedStatus === "rejected";

    return {
      ...row,
      attempt_id: attempt?.id ?? "",
      attempt_result: attempt?.result ?? "",
      attempt_status: attempt?.status ?? "",
      avenia_email: includeBasicInfo ? (attempt?.email ?? "") : "",
      avenia_name: includeBasicInfo ? account.name : "",
      checked_at: checkedAt,
      discrepancy,
      error_code: enrichmentErrorCode,
      error_status: enrichmentErrorStatus,
      identity_status: account.identityStatus,
      normalized_status: normalizedStatus,
      provider_account_type: account.accountType
    };
  } catch (error) {
    if (isAuthenticationError(error)) throw error;
    return {
      ...row,
      attempt_id: "",
      attempt_result: "",
      attempt_status: "",
      avenia_email: "",
      avenia_name: "",
      checked_at: checkedAt,
      discrepancy: "",
      error_code:
        error instanceof Error && error.message.startsWith("Avenia returned")
          ? "malformed_response"
          : "provider_request_failed",
      error_status: errorStatus(error) ?? "",
      identity_status: "",
      normalized_status: "unresolved",
      provider_account_type: ""
    };
  }
}

async function main(): Promise<void> {
  const options = parseOptions();
  if (!process.env.BRLA_API_KEY || !process.env.BRLA_PRIVATE_KEY) {
    throw new Error("BRLA_API_KEY and BRLA_PRIVATE_KEY must be set in apps/api/.env");
  }

  const rows = readInputRows(readFileSync(options.file, "utf8"));
  if (rows.length === 0) throw new Error("Input CSV contains no unmigrated Avenia rows");

  const originalFetch = globalThis.fetch;
  const nativeFetch = originalFetch.bind(globalThis);
  globalThis.fetch = Object.assign(
    (input: Parameters<typeof fetch>[0], init: Parameters<typeof fetch>[1] = {}) =>
      nativeFetch(input, { ...init, signal: AbortSignal.timeout(options.timeoutMs) }),
    { preconnect: originalFetch.preconnect }
  );

  const { BRLA_BASE_URL, BrlaApiService, setLogger } = await import("@vortexfi/shared");
  const discardLog = (..._values: unknown[]) => undefined;
  setLogger({ debug: discardLog, error: discardLog, info: discardLog, warn: discardLog });
  console.log(`Checking ${rows.length} legacy-only Avenia account(s) against ${new URL(BRLA_BASE_URL).origin}`);

  const client = BrlaApiService.getInstance();
  const results: Record<string, unknown>[] = [];
  for (const [index, row] of rows.entries()) {
    results.push(await reconcileRow(row, client, options.retries));
    console.log(`Checked ${index + 1}/${rows.length}`);
    if (options.delayMs > 0 && index < rows.length - 1) await sleep(options.delayMs);
  }

  const temporaryOutput = `${options.output}.tmp-${process.pid}`;
  try {
    writeFileSync(temporaryOutput, serializeCsv(results), { encoding: "utf8", mode: 0o600 });
    renameSync(temporaryOutput, options.output);
    chmodSync(options.output, 0o600);
  } catch (error) {
    try {
      unlinkSync(temporaryOutput);
    } catch {
      // Preserve the original output-write failure.
    }
    throw error;
  }

  const unresolved = results.filter(row => row.normalized_status === "unresolved").length;
  const errors = results.filter(row => row.error_code).length;
  console.log(`Wrote ${results.length} result(s) to ${options.output}; unresolved: ${unresolved}; errors: ${errors}`);
  if (unresolved > 0 || errors > 0) process.exitCode = 2;
}

if (import.meta.main) {
  main().catch(error => {
    console.error("Avenia reconciliation failed:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
