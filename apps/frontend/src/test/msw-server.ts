import { setupServer } from "msw/node";

// Shared MSW server. Tests register handlers per-test via `server.use(...)`;
// handlers are reset after each test in src/test/setup.ts.
export const server = setupServer();

// Matches SIGNING_SERVICE_URL ("http://localhost:3000") + the "/v1" prefix used by api-client.
export const API_BASE_URL = "http://localhost:3000/v1";
