import type { Server } from "node:http";

export interface TestApp {
  baseUrl: string;
  /** fetch against the in-process API, e.g. api.request("/v1/status") */
  request(path: string, init?: RequestInit): Promise<Response>;
  close(): Promise<void>;
}

/**
 * Boots the real Express app in-process on an ephemeral port.
 *
 * Deliberately does NOT run src/index.ts: no background workers, no chain
 * clients, no crypto-service init. Phase handlers are registered so ramp
 * routes work. Call AFTER installing fakes so module singletons resolve to
 * the fake world.
 */
export async function startTestApp(): Promise<TestApp> {
  const { default: app } = await import("../config/express");
  const { default: registerPhaseHandlers } = await import("../api/services/phases/register-handlers");
  registerPhaseHandlers();

  const server: Server = await new Promise(resolve => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Test server did not bind to a port");
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close(error => (error ? reject(error) : resolve()));
      }),
    request: (path, init) => fetch(`${baseUrl}${path}`, init)
  };
}
