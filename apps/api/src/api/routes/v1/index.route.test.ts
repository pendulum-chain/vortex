import { describe, expect, it } from "bun:test";
import express from "express";
import type { AddressInfo } from "node:net";
import routes from ".";

describe("v1 corridor route aliases", () => {
  it("mounts the Alfredpay and BRL routers at both new and legacy paths", async () => {
    const app = express();
    app.use(express.json());
    app.use("/v1", routes);
    const server = app.listen(0);
    await new Promise<void>(resolve => server.once("listening", resolve));

    try {
      const { port } = server.address() as AddressInfo;

      for (const path of ["mx", "co", "ar", "alfredpay"]) {
        const response = await fetch(`http://127.0.0.1:${port}/v1/${path}/alfredpayStatus`);
        expect(response.status).toBe(401);
      }

      for (const path of ["brl", "brla"]) {
        const response = await fetch(`http://127.0.0.1:${port}/v1/${path}/getKycStatus`);
        expect(response.status).toBe(401);
      }
    } finally {
      server.close();
    }
  });
});
