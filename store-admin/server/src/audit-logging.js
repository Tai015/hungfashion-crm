import { pool } from './db.js';
import { logger } from './logger.js';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SAFE_FIELDS = new Set([
  'status', 'role_id', 'role_name', 'order_status', 'payment_status',
  'product_name', 'category_id', 'supplier_id', 'quantity', 'unit_price',
  'price', 'base_price', 'discount', 'discount_type', 'is_active',
  'position', 'hire_date', 'feedback_type', 'rating', 'promotion_id',
  'start_date', 'end_date', 'title', 'type',
]);

function classifyObject(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  const index = parts[0] === 'api' ? 1 : 0;
  const resource = parts[index] || 'unknown';
  const names = {
    accounts: 'account', employees: 'employee', customers: 'customer',
    products: 'product', inventory: 'inventory', orders: 'order',
    promotions: 'promotion', feedbacks: 'feedback', surveys: 'survey',
    chat: 'conversation',
  };
  return { objectType: names[resource] || resource.replace(/s$/, ''), objectId: parts[index + 1] && /^\d+$/.test(parts[index + 1]) ? parts[index + 1] : null };
}

function actionName(method, pathname) {
  const parts = pathname.split('/').filter(Boolean);
  const tail = parts.at(-1);
  if (method === 'POST') return tail && !/^\d+$/.test(tail) && tail !== parts[1] ? tail : 'create';
  if (method === 'DELETE') return 'delete';
  if (method === 'PUT') return 'update';
  if (method === 'PATCH') return tail && !/^\d+$/.test(tail) ? tail : 'update';
  return method.toLowerCase();
}

function safeChangedFields(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {};
  return Object.fromEntries(Object.entries(body)
    .filter(([key, value]) => SAFE_FIELDS.has(key) && ['string', 'number', 'boolean'].includes(typeof value))
    .map(([key, value]) => [key, typeof value === 'string' ? value.slice(0, 200) : value]));
}

export function createAuditMiddleware({ database = pool, log = logger } = {}) {
  return function auditMiddleware(req, res, next) {
    if (!MUTATING_METHODS.has(req.method) || !req.user?.account_id) return next();

    const { objectType, objectId } = classifyObject(req.path || req.originalUrl || '/');
    const action = actionName(req.method, req.path || req.originalUrl || '/');
    const changedFields = safeChangedFields(req.body);
    const actor = {
      accountId: req.user.account_id,
      username: String(req.user.username || 'unknown').slice(0, 150),
      role: String(req.user.role_name || 'unknown').slice(0, 80),
    };

    res.once('finish', () => {
      const outcome = res.statusCode >= 400 ? 'failure' : 'success';
      database.query(
        `INSERT INTO audit_logs
          (actor_account_id, actor_username, actor_role, action, object_type, object_id,
           outcome, http_method, http_status, route, request_id, changed_fields)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`,
        [actor.accountId, actor.username, actor.role, action, objectType, objectId,
          outcome, req.method, res.statusCode, req.route ? `${req.baseUrl || ''}${req.route.path}` : req.path,
          req.requestId || null, JSON.stringify(changedFields)],
      ).catch(error => log.error({
        err: error, requestId: req.requestId, objectType, objectId, action,
      }, 'Business audit record could not be persisted'));
    });

    next();
  };
}
