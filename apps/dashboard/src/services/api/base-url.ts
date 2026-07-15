/**
 * Vortex API origin. Dev default targets the local backend (`bun dev:backend`); the
 * dashboard is hosted on its own domain, so deployed builds MUST set VITE_API_URL —
 * an unset value fails loudly against localhost instead of silently hitting the
 * wrong environment's API.
 */
export const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
