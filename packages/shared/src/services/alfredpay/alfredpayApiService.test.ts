import { afterEach, beforeEach, describe, expect, test } from "bun:test";

process.env.ALFREDPAY_API_KEY ||= "test-key";
process.env.ALFREDPAY_API_SECRET ||= "test-secret";

const { AlfredpayApiService, toAsciiFileName } = await import("./alfredpayApiService");
const { AlfredpayKybRelatedPersonFileType, AlfredpayKycFileType, AlfredpayKybFileType } = await import("./types");

describe("toAsciiFileName", () => {
  test("transliterates accents and keeps the extension", () => {
    expect(toAsciiFileName("acentuación.png")).toBe("acentuacion.png");
    expect(toAsciiFileName("ñandú.png")).toBe("nandu.png");
  });

  /**
   * The production failure. macOS separates the time from AM/PM with U+202F (narrow no-break
   * space), so every screenshot a user uploads carries a non-ASCII byte in a name that looks
   * entirely ASCII — `Screenshot 2026-07-09 at 12.23.56 PM.png` is rejected while the same name
   * retyped with an ordinary space is accepted. Escaped on purpose: the literal character is
   * invisible in a diff and an editor may silently normalize it away.
   */
  test("replaces the U+202F in a macOS screenshot name", () => {
    expect(toAsciiFileName("Screenshot 2026-07-09 at 12.23.56\u202fPM.png")).toBe("Screenshot_2026-07-09_at_12.23.56_PM.png");
  });

  test("leaves names Alfredpay already accepts alone", () => {
    expect(toAsciiFileName("plain.png")).toBe("plain.png");
    expect(toAsciiFileName("with space.png")).toBe("with_space.png");
    expect(toAsciiFileName("IMG_1234.png")).toBe("IMG_1234.png");
    expect(toAsciiFileName("scan-2.pdf")).toBe("scan-2.pdf");
  });

  test("replaces everything else outside [A-Za-z0-9._-]", () => {
    expect(toAsciiFileName("emoji😀.png")).toBe("emoji__.png");
    expect(toAsciiFileName("参考.png")).toBe("__.png");
  });

  test("never yields a name without a single alphanumeric", () => {
    expect(toAsciiFileName("😀")).toBe("upload__");
    expect(toAsciiFileName("")).toBe("upload");
  });
});

/**
 * The regression these guard: Alfredpay's relate-person upload returns a 5xx with
 * `{"errorCode":111301,"errorMessage":"UNKNOWN_ERROR"}` when the multipart filename carries a
 * non-ASCII byte, so the name that goes on the wire must be sanitized — not just sanitizable.
 * Drop the third `append` argument and these fail while `toAsciiFileName`'s own tests still pass.
 */
describe("uploads send an ASCII multipart filename", () => {
  let requests: FormData[];
  const realFetch = globalThis.fetch;
  const accentedPng = () => new File([new Uint8Array([1])], "Identificación oficial.png", { type: "image/png" });

  beforeEach(() => {
    requests = [];
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      requests.push(init.body as FormData);
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  function sentFileName(field: string): string {
    return (requests[0]?.get(field) as File).name;
  }

  test("relate-person upload — the one Alfredpay rejects", async () => {
    await AlfredpayApiService.getInstance().submitKybRelatedPersonFiles(
      "cust-1",
      "person-1",
      AlfredpayKybRelatedPersonFileType.DOC_FRONT,
      accentedPng()
    );
    expect(sentFileName("rawBody")).toBe("Identificacion_oficial.png");
  });

  test("KYB company-document upload", async () => {
    await AlfredpayApiService.getInstance().submitKybFiles("cust-1", "sub-1", AlfredpayKybFileType.PROOF_ADDRESS, accentedPng());
    expect(sentFileName("rawBody")).toBe("Identificacion_oficial.png");
  });

  test("KYC document upload", async () => {
    await AlfredpayApiService.getInstance().submitKycFile("cust-1", "sub-1", AlfredpayKycFileType.DOC_FRONT, accentedPng());
    expect(sentFileName("fileBody")).toBe("Identificacion_oficial.png");
  });
});
