import type { IncomingMessage, ServerResponse } from "node:http";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { verifyCdpOwnership } from "./server/verifyOwnership";

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}

function ownershipProbe(mode: string): Plugin {
  const environment = loadEnv(mode, process.cwd(), "");
  const handler = async (request: IncomingMessage, response: ServerResponse) => {
    if (request.method !== "POST") {
      sendJson(response, 405, { error: "Method not allowed" });
      return;
    }

    try {
      const body = await readJson(request);
      const evidence = await verifyCdpOwnership({
        accessToken: String(body.accessToken ?? ""),
        address: String(body.address ?? ""),
        cdpProjectId: environment.VITE_CDP_PROJECT_ID ?? "",
        cdpUserId: String(body.cdpUserId ?? ""),
        vortexApiUrl: environment.VITE_API_URL ?? ""
      });
      sendJson(response, 200, evidence);
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : "Ownership verification failed" });
    }
  };

  return {
    configurePreviewServer: server => {
      server.middlewares.use("/__cdp-spike/verify-ownership", handler);
    },
    configureServer: server => {
      server.middlewares.use("/__cdp-spike/verify-ownership", handler);
    },
    name: "cdp-ownership-probe"
  };
}

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), "");
  const vortexApiUrl = environment.VITE_API_URL;

  return {
    build: {
      target: "esnext"
    },
    plugins: [react(), ownershipProbe(mode)],
    server: vortexApiUrl
      ? {
          proxy: {
            "/__vortex-api": {
              changeOrigin: true,
              rewrite: path => path.replace(/^\/__vortex-api/, ""),
              target: vortexApiUrl
            }
          }
        }
      : undefined
  };
});
