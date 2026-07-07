/**
 * Vortex API origin. Dev default targets the local backend (`bun dev:backend`);
 * production builds are same-origin behind the /dashboard/ sub-path, so set
 * VITE_API_URL explicitly wherever that doesn't hold.
 */
export const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
