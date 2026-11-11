export const TOKEN_KEY = 'hung-fashion-access-token';

export function getAuthToken() {
  return window.localStorage.getItem(TOKEN_KEY) || window.sessionStorage.getItem(TOKEN_KEY);
}

export function saveAuthToken(token, rememberMe) {
  clearAuthToken();
  // Phiên tạm được giữ bằng cookie HttpOnly do máy chủ cấp; không lưu token JS.
  if (rememberMe && token) window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.sessionStorage.removeItem(TOKEN_KEY);
}

export async function checkRuntimeServices() {
  const healthResponse = await fetch('/api/health', { signal: AbortSignal.timeout(4000) });
  return { apiReady: healthResponse.ok };
}

export function authHeaders(extraHeaders = {}) {
  const headers = new Headers(extraHeaders);
  const token = getAuthToken();
  if (token) headers.set('authorization', `Bearer ${token}`);
  return headers;
}

export async function listenForChatEvents(onEvent, { signal } = {}) {
  const response = await fetch('/api/chat/events', {
    headers: authHeaders({ accept: 'text/event-stream' }),
    signal,
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    const error = new Error(result?.message || `Không thể kết nối chat (${response.status}).`);
    error.status = response.status;
    error.code = result?.code;
    throw error;
  }
  if (!response.body) throw new Error('Trình duyệt không hỗ trợ kết nối chat realtime.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const eventName = frame.split('\n').find(line => line.startsWith('event:'))?.slice(6).trim();
      const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
      if (eventName === 'chat' && data) {
        try { onEvent(JSON.parse(data)); } catch { /* ignore malformed event payload */ }
      }
      boundary = buffer.indexOf('\n\n');
    }
  }
}

const chatEventListeners = new Set();
const pendingChatEvents = new Map();
let chatEventController;
let chatEventRetryTimer;
let chatEventRetryResolver;
let chatEventBatchTimer;
let chatEventGeneration = 0;
let chatEventHasConnected = false;

function restartChatEventStream() {
  if (!chatEventListeners.size || document.hidden) return;
  chatEventGeneration += 1;
  chatEventController?.abort();
  window.clearTimeout(chatEventRetryTimer);
  chatEventRetryResolver?.();
  chatEventRetryResolver = null;
  startChatEventStream();
}

function dispatchChatEvent(event) {
  const key = event.conversationId == null
    ? `global:${event.type || 'event'}`
    : `conversation:${event.conversationId}`;
  pendingChatEvents.set(key, event);
  if (chatEventBatchTimer) return;
  chatEventBatchTimer = window.setTimeout(() => {
    chatEventBatchTimer = null;
    const events = [...pendingChatEvents.values()];
    pendingChatEvents.clear();
    const notification = events.length === 1 ? events[0] : { type: 'batch', events };
    chatEventListeners.forEach(listener => {
      try { listener(notification); } catch { /* one consumer must not interrupt other listeners */ }
    });
  }, 100);
}

function startChatEventStream() {
  const generation = ++chatEventGeneration;
  const connect = async () => {
    let retryAttempt = 0;
    while (chatEventListeners.size && generation === chatEventGeneration) {
      chatEventController = new AbortController();
      let connectedAt = 0;
      try {
        await listenForChatEvents(event => {
          if (event.type === 'connected') {
            connectedAt = Date.now();
            if (chatEventHasConnected) dispatchChatEvent(event);
            chatEventHasConnected = true;
            return;
          }
          dispatchChatEvent(event);
        }, { signal: chatEventController.signal });
      } catch (error) {
        if (error.status === 401 || error.status === 403) {
          clearAuthToken();
          window.dispatchEvent(new CustomEvent('auth:expired', {
            detail: { code: error.code, message: error.message },
          }));
          break;
        }
        // Retry after transient network errors or server restarts.
      }
      if (!chatEventListeners.size || generation !== chatEventGeneration) break;
      if (connectedAt && Date.now() - connectedAt >= 10000) retryAttempt = 0;
      const delayMs = Math.min(1000 * (2 ** retryAttempt), 30000);
      retryAttempt += 1;
      await new Promise(resolve => {
        chatEventRetryResolver = resolve;
        chatEventRetryTimer = window.setTimeout(resolve, delayMs);
      });
      chatEventRetryResolver = null;
    }
  };
  connect();
}

export function subscribeToChatEvents(onEvent) {
  const wasEmpty = chatEventListeners.size === 0;
  chatEventListeners.add(onEvent);
  if (wasEmpty) {
    document.addEventListener('visibilitychange', restartChatEventStream);
    window.addEventListener('online', restartChatEventStream);
    startChatEventStream();
  }
  return () => {
    chatEventListeners.delete(onEvent);
    if (chatEventListeners.size) return;
    chatEventGeneration += 1;
    document.removeEventListener('visibilitychange', restartChatEventStream);
    window.removeEventListener('online', restartChatEventStream);
    chatEventController?.abort();
    window.clearTimeout(chatEventRetryTimer);
    chatEventRetryResolver?.();
    window.clearTimeout(chatEventBatchTimer);
    chatEventBatchTimer = null;
    pendingChatEvents.clear();
    chatEventHasConnected = false;
  };
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
      clearAuthToken();
      window.dispatchEvent(new CustomEvent('auth:expired', {
        detail: { code: result?.code, message: result?.message },
      }));
    }
    const error = new Error(result?.message || `Yêu cầu thất bại (${response.status}).`);
    error.status = response.status;
    const retryAfterHeader = response.headers.get('retry-after');
    const rateLimitResetHeader = response.headers.get('ratelimit-reset');
    const retryAfterSeconds = Number(result?.retryAfterSeconds ?? retryAfterHeader ?? rateLimitResetHeader);
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
      error.retryAfterSeconds = Math.ceil(retryAfterSeconds);
    }
    throw error;
  }
  return result;
}
