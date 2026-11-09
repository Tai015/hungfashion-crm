# Backend structured logging

The Express API writes one JSON object per log line to stdout/stderr through the lightweight logger in `src/logger.js`. Render captures these streams, so no external log collector or database is required for this first step.

## Configuration

- `LOG_LEVEL=info` by default.
- Supported levels: `debug`, `info`, `warn`, `error`, `fatal`.
- Set `LOG_LEVEL=debug` temporarily when investigating a problem; return to `info` in normal production operation.

## HTTP request records

Every request receives a generated `X-Request-Id` response header. The access log records the request ID, HTTP method, Express route template, status code, and duration in milliseconds. It deliberately does not record request bodies, query strings, raw URL paths, IP addresses, or authentication headers.

- 2xx/3xx: `info`
- 4xx: `warn`
- 5xx: `error`

Use the response `X-Request-Id` value when correlating a user's report with Render logs.

## Security

Sensitive object keys such as passwords, tokens, authorization headers, cookies, API keys, secrets, and connection strings are redacted. Do not pass request bodies, credentials, payment QR tokens, or full database connection strings to the logger. Error messages and stack traces are intended for server logs only and must not be returned to clients.

This step adds structured logs only. Metrics, distributed traces, dashboards, and alerts are separate follow-up work.
