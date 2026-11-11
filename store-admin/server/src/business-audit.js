import { pool } from './db.js';
import { logger } from './logger.js';

const ENTITY_ID_KEYS = {
  account: ['account_id', 'accountId', 'id'],
  customer: ['customer_id', 'customerId', 'id'],
  employee: ['employee_id', 'employeeId', 'id'],
  product: ['product_id', 'productId', 'id'],
  order: ['order_id', 'orderId', 'id'],
  promotion: ['promotion_id', 'promotionId', 'id'],
  feedback: ['feedback_id', 'feedbackId', 'id'],
  survey: ['survey_id', 'surveyId', 'id'],
  inventory: ['receipt_id', 'variant_id', 'id'],
};

const SENSITIVE_KEY = /(password|token|secret|authorization|cookie|email|phone|address|birth|payment|card|cvv|otp|credential)/i;

function safeValue(value, depth = 0) {
  if (depth > 5) return '[omitted]';
  if (Array.isArray(value)) return value.slice(0, 30).map(item => safeValue(item, depth + 1));
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string') return value.length > 500 ? value.slice(0, 500) : value;
    return value;
  }
  return Object.fromEntries(Object.entries(value).slice(0, 80).map(([key, item]) => [
    key, SENSITIVE_KEY.test(key) ? '[redacted]' : safeValue(item, depth + 1),
  ]));
}

function entityFor(pathname) {
  const segment = pathname.split('/').filter(Boolean)[1] || 'system';
  const aliases = { customers: 'customer', accounts: 'account', employees: 'employee',
    products: 'product', orders: 'order', promotions: 'promotion', feedbacks: 'feedback',
    surveys: 'survey', inventory: 'inventory' };
  return aliases[segment] || segment.replace(/s$/, '') || 'system';
}

function entityIdFor(entityType, params, body, responseBody, pathname) {
  const keys = ENTITY_ID_KEYS[entityType] || ['id'];
  for (const source of [params, responseBody, body]) {
    for (const key of keys) {
      const value = source?.[key];
      if (value !== undefined && value !== null && String(value).length <= 120) return String(value);
    }
  }
  const segments = String(pathname || '').split('/').filter(Boolean);
  const candidate = segments[2];
  if (candidate && !['mine', 'roles', 'stats', 'report', 'all', 'claim', 'validate'].includes(candidate)
    && /^[a-zA-Z0-9_-]{1,120}$/.test(candidate)) return candidate;
  return null;
}

export function createBusinessAuditMiddleware({ database = pool, auditLogger = logger } = {}) {
  return function businessAuditMiddleware(req, res, next) {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) || req.path === '/health') return next();

    const requestBody = safeValue(req.body || {});
    let responseBody = null;
    const originalJson = res.json.bind(res);
    res.json = body => {
      responseBody = body && typeof body === 'object' ? body : null;
      return originalJson(body);
    };
    const originalSend = res.send.bind(res);
    res.send = body => {
      if (body && typeof body === 'object' && !Buffer.isBuffer(body)) responseBody = body;
      return originalSend(body);
    };

    res.once('finish', () => {
      const statusCode = res.statusCode;
      const pathname = req.originalUrl?.split('?')[0] || req.path;
      const entityType = entityFor(pathname);
      const action = `${entityType}.${({ POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'delete' })[req.method]}`;
      const response = responseBody && typeof responseBody === 'object' ? responseBody : {};
      const entityId = entityIdFor(entityType, req.params, requestBody, response, pathname);
      const actor = req.user || {};
      const changes = {
        submitted: requestBody,
        result: statusCode < 400 ? 'completed' : 'rejected',
      };
      const errorMessage = statusCode >= 400 && typeof response.message === 'string'
        ? response.message.slice(0, 500) : null;

      database.query(
        `INSERT INTO business_audit_logs
          (actor_account_id, actor_username, actor_role, action, entity_type, entity_id,
           request_method, request_path, request_id, status_code, outcome, changes, error_message, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14)`,
        [
          Number.isSafeInteger(Number(actor.account_id)) ? Number(actor.account_id) : null,
          typeof actor.username === 'string' ? actor.username.slice(0, 150) : null,
          typeof actor.role_name === 'string' ? actor.role_name.slice(0, 80) : null,
          action, entityType, entityId, req.method, pathname.slice(0, 500),
          req.requestId || null, statusCode, statusCode < 400 ? 'success' : 'failure',
          JSON.stringify(changes), errorMessage, 'api',
        ],
      ).catch(error => auditLogger.error({ err: error, requestId: req.requestId }, 'Business audit write failed'));
    });
    next();
  };
}
