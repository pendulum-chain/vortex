import { describe, expect, it } from "bun:test";
import {
  ALFREDPAY_ANONYMOUS_CUSTOMER_ID,
  resolveAlfredpayQuoteCustomerId
} from "../../../quote/alfredpay-customer";

describe("Alfredpay block quote auth", () => {
  it("keeps quote discovery anonymous without a user", async () => {
    expect(await resolveAlfredpayQuoteCustomerId("MXN", undefined)).toBe(ALFREDPAY_ANONYMOUS_CUSTOMER_ID);
  });
});
