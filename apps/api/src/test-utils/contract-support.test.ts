import { expect, test } from "bun:test";
import { z } from "zod";
import { runLive } from "./contract-support";

test("runLive fails a contract response that violates its Zod schema", async () => {
  await expect(
    runLive("schema drift", async () => z.object({ required: z.string() }).parse({}))
  ).rejects.toBeInstanceOf(z.ZodError);
});
