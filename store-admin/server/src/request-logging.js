import { randomUUID } from 'node:crypto';
import { logger as defaultLogger } from './logger.js';

function routeName(req) {
  if (!req.route?.path) return 'unmatched';
  const routePath = Array.isArray(req.route.path) ? req.route.path.join('|') : String(req.route.path);
  return `${req.baseUrl || ''}${routePath}` || '/';
}

export function createRequestLoggingMiddleware({
  logger = defaultLogger,
  requestIdFactory = randomUUID,
} = {}) {
  return function requestLoggingMiddleware(req, res, next) {
    const requestId = requestIdFactory();
    const startedAt = process.hrtime.bigint();

    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const statusCode = res.statusCode;
      const fields = {
        requestId,
        method: req.method,
        route: routeName(req),
        statusCode,
        durationMs: Number(durationMs.toFixed(2)),
      };

      if (statusCode >= 500) logger.error(fields, 'HTTP request failed');
      else if (statusCode >= 400) logger.warn(fields, 'HTTP request completed with client error');
      else logger.info(fields, 'HTTP request completed');
    });

    next();
  };
}
