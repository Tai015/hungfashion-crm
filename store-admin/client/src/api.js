export const TOKEN_KEY = 'hung-fashion-access-token';

export function authHeaders(extraHeaders = {}) {
  const headers = new Headers(extraHeaders);
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (token) headers.set('authorization', `Bearer ${token}`);
  return headers;
}

export async function apiFetch(url, options = {}) {
  const headers = authHeaders(options.headers);
  let body = options.body;
  if (body && typeof body === 'object' && !(body instanceof Blob) && !(body instanceof FormData)) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(body);
  }
  const response = await fetch(url, { ...options, headers, body });
  const result = response.status === 204
    ? null
    : await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      window.localStorage.removeItem(TOKEN_KEY);
      window.dispatchEvent(new Event('auth:expired'));
    }
    throw new Error(result?.message || `Yêu cầu thất bại (${response.status}).`);
  }
  return result;
}
