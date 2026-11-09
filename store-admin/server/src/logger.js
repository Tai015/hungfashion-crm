const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, fatal: 50 };
const SECRET_FIELD = /authorization|cookie|password|token|secret|api.?key|connection.?string|private.?key/i;

function redactString(value) {
  return value
    .replace(/(Bearer\\s+)[A-Za-z0-9._~+\\/-]+=*/gi, '$1[REDACTED]')
    .replace(/(postgres(?:ql)?:\\/\\/[^:/\\s]+:)[^@\\s]+@/gi, '$1[REDACTED]@')
    .replace(/([?&](?:token|access_token|api_key|secret|password)=)[^&\\s]*/gi, '$1[REDACTED]');
}

function normalize(value, key = '') {
  if (SECRET_FIELD.test(key)) return '[REDACTED]';
  if (value instanceof Error) {
    return {
      type: value.name,
      message: redactString(String(value.message || '')),
      ...(value.stack ? { stack: redactString(value.stack) } : {}),
      ...(value.code ? { code: value.code } : {}),
    };
  }
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map(item => normalize(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [
      childKey,
      normalize(childValue, childKey),
    ]));
  }
  if (typeof value === 'bigint') return value.toString();
  return value;
}

export function createLogger({ service = 'hungfashion-api', level, destination = process.stdout } = {}) {
  function write(levelName, fieldsOrMessage, message) {
    const configuredLevel = level || process.env.LOG_LEVEL || 'info';
    if ((LEVELS[levelName] ?? LEVELS.info) < (LEVELS[configuredLevel] ?? LEVELS.info)) return;

    const fields = fieldsOrMessage && typeof fieldsOrMessage === 'object' && !(fieldsOrMessage instanceof Error)
      ? normalize(fieldsOrMessage)
      : fieldsOrMessage instanceof Error ? { err: normalize(fieldsOrMessage) } : {};
    const msg = typeof fieldsOrMessage === 'string'
      ? fieldsOrMessage
      : typeof message === 'string' ? message : undefined;

    const record = {
      ...fields,
      time: new Date().toISOString(),
      level: levelName,
      service,
      ...(msg ? { msg: redactString(msg) } : {}),
    };
    destination.write(`${JSON.stringify(record)}\\n`);
  }

  return {
    debug: (fields, message) => write('debug', fields, message),
    info: (fields, message) => write('info', fields, message),
    warn: (fields, message) => write('warn', fields, message),
    error: (fields, message) => write('error', fields, message),
    fatal: (fields, message) => write('fatal', fields, message),
  };
}

export const logger = createLogger();
