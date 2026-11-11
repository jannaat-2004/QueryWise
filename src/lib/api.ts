/**
 * Resolves API endpoint paths for both unified Vercel deployment (same-origin /api/*)
 * and split frontend/backend deployments (via VITE_API_BASE_URL).
 */
const rawApiBaseUrl = (
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL
    ? String(import.meta.env.VITE_API_BASE_URL)
    : ''
)
  .trim()
  .replace(/\/+$/, '');

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return rawApiBaseUrl ? `${rawApiBaseUrl}${normalizedPath}` : normalizedPath;
}

