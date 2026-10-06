import type { Response } from "express";

/**
 * Sends the API's standard JSON error envelope: `{ error: { code, message, status } }`.
 * Returns the response so middlewares can `return sendError(...)`.
 */
export function sendError(res: Response, status: number, code: string, message: string): Response {
  return res.status(status).json({ error: { code, message, status } });
}
