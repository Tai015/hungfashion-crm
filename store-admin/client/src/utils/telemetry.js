const sessionStorageKey = 'store-admin-telemetry-session';

export function getTelemetrySessionId() {
  let sessionId = window.sessionStorage.getItem(sessionStorageKey);
  if (!sessionId) {
    sessionId = window.crypto.randomUUID();
    window.sessionStorage.setItem(sessionStorageKey, sessionId);
  }
  return sessionId;
}

export async function publishTelemetry(eventPath, event) {
  const response = await fetch(`/api/events/${eventPath}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      eventId: window.crypto.randomUUID(),
      sessionId: getTelemetrySessionId(),
      occurredAt: new Date().toISOString(),
      page: window.location.pathname,
      ...event,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || `Event request failed (${response.status})`);
  return result;
}
