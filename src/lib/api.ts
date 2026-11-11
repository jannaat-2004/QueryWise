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

/**
 * Safely parses a fetch Response as JSON, gracefully handling non-JSON (HTML/plain-text)
 * server responses and HTTP error status codes without throwing raw SyntaxError ("Unexpected token...").
 */
export async function parseApiResponse<T = any>(
  res: Response,
  fallbackErrorMessage = 'Request failed. Please try again.'
): Promise<T> {
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  let rawText = '';

  try {
    rawText = await res.text();
  } catch (readErr) {
    if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
      console.error('[API Read Error]', res.url, readErr);
    }
    throw new Error(fallbackErrorMessage);
  }

  const trimmed = rawText.trim();
  const looksLikeJson =
    contentType.includes('application/json') ||
    trimmed.startsWith('{') ||
    trimmed.startsWith('[');

  let parsedData: any = null;
  if (looksLikeJson && trimmed.length > 0) {
    try {
      parsedData = JSON.parse(trimmed);
    } catch (parseErr) {
      if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
        console.error('[API JSON Parse Error]', {
          url: res.url,
          status: res.status,
          contentType,
          preview: trimmed.slice(0, 300),
          parseErr
        });
      }
    }
  } else if (!res.ok && typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
    console.error('[API Non-JSON Error Response]', {
      url: res.url,
      status: res.status,
      contentType,
      preview: trimmed.slice(0, 300)
    });
  }

  if (!res.ok) {
    if (parsedData && typeof parsedData === 'object') {
      const serverMsg =
        typeof parsedData.error === 'string'
          ? parsedData.error
          : typeof parsedData.message === 'string'
          ? parsedData.message
          : '';
      if (serverMsg) {
        throw new Error(serverMsg);
      }
    }

    if (res.status === 401) {
      throw new Error('Invalid credentials or expired session. Please sign in again.');
    }
    if (res.status === 404) {
      throw new Error('The requested API service could not be found (HTTP 404).');
    }
    if (res.status === 409) {
      throw new Error('An account with this email already exists. Please sign in instead.');
    }
    if (res.status >= 500) {
      throw new Error(
        `The server encountered an unexpected error (HTTP ${res.status}). Please try again in a moment.`
      );
    }

    throw new Error(`${fallbackErrorMessage} (HTTP ${res.status})`);
  }

  if (parsedData === null) {
    if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
      console.error('[API Unexpected Non-JSON 2xx Response]', {
        url: res.url,
        status: res.status,
        contentType,
        preview: trimmed.slice(0, 300)
      });
    }
    throw new Error('Received an invalid response format from the server.');
  }

  return parsedData as T;
}
