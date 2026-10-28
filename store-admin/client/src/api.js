export const TOKEN_KEY = 'hung-fashion-access-token';

export async function checkRuntimeServices() {
  const healthResponse = await fetch('/api/health', { signal: AbortSignal.timeout(4000) });
  return { apiReady: healthResponse.ok };
}

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
  let response;
  try {
    response = await fetch(url, { ...options, headers, body });
  } catch (cause) {
    const error = new Error('Không thể kết nối máy chủ. Vui lòng thử lại khi kết nối được khôi phục.', { cause });
    error.name = 'NetworkError';
    throw error;
  }
  const result = response.status === 204
    ? null
    : await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      window.localStorage.removeItem(TOKEN_KEY);
      window.dispatchEvent(new Event('auth:expired'));
    }
    const error = new Error(result?.message || `Yêu cầu thất bại (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return result;
}
