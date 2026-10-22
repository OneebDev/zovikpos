const fs = require('fs');
const path = require('path');

const LEVELS = { error: 0, warn: 1, info: 2 };
const configuredLevel = (process.env.LOG_LEVEL || 'info').toLowerCase();
const minimumLevel = LEVELS[configuredLevel] ?? LEVELS.info;
let timezone = process.env.LOG_TIMEZONE || 'Asia/Karachi';
let timezoneConfigError = false;
try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }); }
catch { timezoneConfigError = true; timezone = 'UTC'; }
const retentionDays = Math.max(1, Number.parseInt(process.env.LOG_RETENTION_DAYS || '30', 10) || 30);
const logDir = path.resolve(process.env.LOG_DIR || path.join(__dirname, '../../logs/exceptions'));
const fileLoggingEnabled = process.env.NODE_ENV !== 'production';
const burstLimit = Math.max(1, Number.parseInt(process.env.LOG_BURST_LIMIT_PER_MINUTE || '10', 10) || 10);
const queue = [];
const bursts = new Map();
let writing = false;
let lastRetentionDay = '';
let flushWaiters = [];

const dateParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  return parts;
};

const localDate = (date = new Date()) => {
  const p = dateParts(date);
  return `${p.year}-${p.month}-${p.day}`;
};

const offsetFor = (date = new Date()) => {
  const value = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'longOffset' })
    .formatToParts(date).find((part) => part.type === 'timeZoneName')?.value || 'GMT+00:00';
  return value.replace('GMT', '') || '+00:00';
};

const maskEmail = (value) => value.replace(/([A-Z0-9._%+-])[A-Z0-9._%+-]*@([A-Z0-9.-]+\.[A-Z]{2,})/gi, '$1***@$2');
const maskPhone = (value) => value.replace(/(?<!\w)(?:\+?\d[\d ()-]{8,}\d)(?!\w)/g, '[PHONE_REDACTED]');
const redactText = (input, limit) => {
  let value = String(input ?? '');
  value = value.replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[TOKEN_REDACTED]')
    .replace(/\btbl:[A-Za-z0-9:%_-]+/gi, '[TABLE_TOKEN_REDACTED]')
    .replace(/\b\d{6}\b/g, '[CODE_REDACTED]')
    .replace(/((?:otp|token|secret|password|authorization|cookie|api[_-]?key)\s*[:=]\s*)([^\s,;]+)/gi, '$1[REDACTED]');
  value = maskEmail(value);
  value = maskPhone(value);
  for (const [key, secret] of Object.entries(process.env)) {
    if (secret && /SECRET|TOKEN|KEY|PASSWORD|DATABASE_URL|REDIS_URL|SMTP_PASS|SUPABASE/i.test(key) && secret.length >= 5) {
      value = value.split(secret).join('[REDACTED]');
    }
  }
  return value.slice(0, limit);
};

const ALLOWED_CONTEXT = new Set([
  'requestId', 'method', 'url', 'status', 'role', 'userId', 'ip', 'code', 'name',
  'model', 'action', 'durationMs', 'retry', 'route', 'provider', 'recipientEmail',
]);

const safeContext = (context = {}) => {
  const safe = {};
  for (const [key, value] of Object.entries(context || {})) {
    if (!ALLOWED_CONTEXT.has(key) || value === undefined || value === null) continue;
    if (key === 'recipientEmail') {
      safe[key] = maskEmail(String(value));
    } else if (key === 'ip') {
      const ip = String(value);
      safe[key] = ip.includes('.') ? ip.replace(/\.\d+$/, '.0') : ip.includes(':') ? `${ip.split(':').slice(0, 4).join(':')}::` : '[IP_REDACTED]';
    } else if (key === 'url') {
      safe[key] = redactText(value, 300)
        .replace(/(\/api\/sessions\/)(?!start(?:\/|$)|transfer-table(?:\/|$))[^/?#]+/i, '$1[ID_REDACTED]')
        .replace(/(\/api\/orders\/track\/)[^/?#]+/i, '$1[TOKEN_REDACTED]')
        .replace(/(\/customer\/table\/)[^/?#]+/i, '$1[TOKEN_REDACTED]');
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      safe[key] = value;
    } else {
      safe[key] = redactText(value, 300);
    }
  }
  return safe;
};

const sourceLevelKey = (entry) => `${entry.level}:${entry.source}:${entry.code || ''}:${entry.message.slice(0, 160)}`;

const stdout = (entry) => {
  try { process.stdout.write(`${JSON.stringify(entry)}\n`); } catch { /* never throw into a request */ }
};

const fileLine = (entry) => {
  const local = dateParts(entry.date);
  const stamp = `${local.year}-${local.month}-${local.day} ${local.hour}:${local.minute}:${local.second}.${String(entry.date.getMilliseconds()).padStart(3, '0')} ${offsetFor(entry.date)}`;
  const parts = [
    `[${stamp} | ${entry.date.toISOString()}]`, `LEVEL=${entry.level}`, `SOURCE=${entry.source}`,
  ];
  for (const key of ['requestId', 'method', 'url', 'status', 'role', 'userId', 'ip', 'code', 'name']) {
    if (entry.context[key] !== undefined) parts.push(`${key}=${entry.context[key]}`);
  }
  parts.push(entry.message);
  if (entry.stack) parts.push(`stack=${entry.stack}`);
  if (Object.keys(entry.context).length) parts.push(`context=${JSON.stringify(entry.context)}`);
  return `${parts.join(' / ')}\n${'-'.repeat(80)}\n`;
};

const cleanupOldFiles = async () => {
  if (!fileLoggingEnabled) return;
  const today = localDate();
  if (lastRetentionDay === today) return;
  lastRetentionDay = today;
  try {
    await fs.promises.mkdir(logDir, { recursive: true });
    const cutoff = new Date(`${today}T00:00:00Z`);
    cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);
    const files = await fs.promises.readdir(logDir, { withFileTypes: true });
    await Promise.all(files.filter((file) => file.isFile() && /^\d{4}-\d{2}-\d{2}\.txt$/.test(file.name))
      .filter((file) => new Date(`${file.name.slice(0, 10)}T00:00:00Z`) < cutoff)
      .map((file) => fs.promises.unlink(path.join(logDir, file.name)).catch(() => {})));
  } catch { /* disk failure is handled by the writer fallback */ }
};
if (fileLoggingEnabled) void cleanupOldFiles();
setInterval(() => {
  if (fileLoggingEnabled && lastRetentionDay !== localDate()) void cleanupOldFiles();
  const minute = Math.floor(Date.now() / 60000);
  for (const state of bursts.values()) {
    if (state.minute < minute) {
      if (state.suppressed && state.sample) {
        const date = new Date();
        const summary = { ...state.sample, date, timestamp: date.toISOString(),
          localTime: `${localDate(date)} ${dateParts(date).hour}:${dateParts(date).minute}:${dateParts(date).second}.${String(date.getMilliseconds()).padStart(3, '0')} ${offsetFor(date)}`,
          message: `${state.suppressed} similar errors suppressed during the previous minute`, stack: undefined };
        stdout(summary);
        if (fileLoggingEnabled && queue.length < 5000) queue.push(summary);
      }
      state.minute = minute;
      state.count = 0;
      state.suppressed = 0;
      state.sample = null;
    }
  }
  if (fileLoggingEnabled) void drain();
}, 60 * 1000).unref();

const drain = async () => {
  if (writing) return;
  writing = true;
  try {
    while (queue.length) {
      const entry = queue.shift();
      try {
        await cleanupOldFiles();
        await fs.promises.appendFile(path.join(logDir, `${localDate(entry.date)}.txt`), fileLine(entry), 'utf8');
      } catch {
        // Each entry has already been sent to stdout; disk must never block/fail a request.
      }
    }
  } finally {
    writing = false;
    if (!queue.length) flushWaiters.splice(0).forEach((resolve) => resolve());
    if (queue.length) void drain();
  }
};

const flush = () => new Promise((resolve) => {
  if (!writing && !queue.length) return resolve();
  flushWaiters.push(resolve);
  void drain();
  setTimeout(() => {
    const index = flushWaiters.indexOf(resolve);
    if (index >= 0) flushWaiters.splice(index, 1);
    resolve();
  }, 2000).unref?.();
});

const log = (level, source, message, options = {}) => {
  try {
    if ((LEVELS[level] ?? 0) > minimumLevel) return;
    const date = new Date();
    const context = safeContext(options.context);
    const cleanSource = redactText(source || 'unknown', 120).replace(/\s+/g, '_');
    const cleanMessage = redactText(message, 2048);
    const entry = {
      timestamp: date.toISOString(), localTime: `${localDate(date)} ${dateParts(date).hour}:${dateParts(date).minute}:${dateParts(date).second}.${String(date.getMilliseconds()).padStart(3, '0')} ${offsetFor(date)}`,
      level, source: cleanSource, ...context, message: cleanMessage,
    };
    if (options.error?.stack) entry.stack = redactText(options.error.stack, 8192);
    entry.context = context;

    const fingerprint = sourceLevelKey({ ...entry, code: context.code });
    const minute = Math.floor(date.getTime() / 60000);
    let state = bursts.get(fingerprint);
    if (!state || state.minute !== minute) {
      if (state?.suppressed) {
        const summary = { ...entry, message: `${state.suppressed} similar errors suppressed during the previous minute`, stack: undefined };
        stdout(summary);
        if (fileLoggingEnabled && queue.length < 5000) queue.push({ ...summary, date });
      }
      state = { minute, count: 0, suppressed: 0, sample: entry };
      if (bursts.size >= 5000 && !bursts.has(fingerprint)) bursts.delete(bursts.keys().next().value);
      bursts.set(fingerprint, state);
    }
    if (state.count >= burstLimit) { state.suppressed += 1; return; }
    state.count += 1;
    state.sample = entry;
    stdout(entry);
    if (fileLoggingEnabled && queue.length < 5000) queue.push({ ...entry, date });
    if (fileLoggingEnabled) void drain();
  } catch { /* the logger is deliberately fail-safe */ }
};

const exception = (source, error, options = {}) => {
  const err = error instanceof Error ? error : new Error(String(error ?? 'Unknown error'));
  log(options.level || 'error', source, err.message, { ...options, error: err });
};

const fatalSync = (source, error, options = {}) => {
  try {
    const date = new Date();
    const err = error instanceof Error ? error : new Error(String(error ?? 'Unknown error'));
    const context = safeContext(options.context);
    const entry = {
      timestamp: date.toISOString(), localTime: `${localDate(date)} ${dateParts(date).hour}:${dateParts(date).minute}:${dateParts(date).second}.${String(date.getMilliseconds()).padStart(3, '0')} ${offsetFor(date)}`,
      level: 'error', source: redactText(source, 120), ...context,
      message: redactText(err.message, 2048), stack: redactText(err.stack || '', 8192), context,
    };
    stdout(entry);
    if (fileLoggingEnabled) {
      fs.mkdirSync(logDir, { recursive: true });
      fs.appendFileSync(path.join(logDir, `${localDate(date)}.txt`), `${fileLine({ ...entry, date })}`, 'utf8');
    }
  } catch { /* stdout is the final fallback */ }
};

const installProcessHandlers = (getServer = () => null) => {
  const terminate = (source, error) => {
    fatalSync(source, error);
    const server = getServer();
    if (!server) {
      process.exit(1);
      return;
    }
    server.close(() => flush().finally(() => process.exit(1)));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('uncaughtException', (error) => terminate('process.uncaughtException', error));
  process.on('unhandledRejection', (reason) => terminate('process.unhandledRejection', reason));
};

const captureConsole = (level, args) => {
  try {
    const error = args.find((value) => value instanceof Error);
    const label = args.find((value) => typeof value === 'string') || 'Application warning';
    const stack = new Error().stack || '';
    const frame = stack.split('\n').slice(2).find((line) =>
      /backend[\\/]src[\\/]/i.test(line) && !/[\\/]server\.js:/.test(line) && !/[\\/]exceptionLogger\.js:/.test(line));
    const match = frame?.match(/[\\/]src[\\/](?:.*[\\/])?([^\\/()]+?)(?:\.js)?(?::\d+)?\)?$/i);
    const source = `application.${match?.[1] || 'runtime'}`;
    const message = `${label}${error ? `: ${error.message}` : ''}`;
    if (error) exception(source, error, { level, context: { name: error.name, code: error.code } });
    else log(level, source, message);
  } catch { /* console logging must not affect application behavior */ }
};

const validateConfig = () => {
  if (timezoneConfigError) throw new Error('LOG_TIMEZONE must be a valid IANA timezone');
  if (process.env.LOG_RETENTION_DAYS !== undefined && (!/^\d+$/.test(process.env.LOG_RETENTION_DAYS) || Number(process.env.LOG_RETENTION_DAYS) < 1)) {
    throw new Error('LOG_RETENTION_DAYS must be a positive integer');
  }
  if (process.env.LOG_BURST_LIMIT_PER_MINUTE !== undefined && (!/^\d+$/.test(process.env.LOG_BURST_LIMIT_PER_MINUTE) || Number(process.env.LOG_BURST_LIMIT_PER_MINUTE) < 1)) {
    throw new Error('LOG_BURST_LIMIT_PER_MINUTE must be a positive integer');
  }
  if (process.env.LOG_LEVEL !== undefined && !Object.hasOwn(LEVELS, process.env.LOG_LEVEL.toLowerCase())) {
    throw new Error('LOG_LEVEL must be error, warn, or info');
  }
  log('info', 'logging.mode', fileLoggingEnabled ? 'Exception logging mode: file+stdout' : 'Exception logging mode: stdout-only');
};

module.exports = { log, exception, fatalSync, flush, installProcessHandlers, validateConfig, captureConsole, redactText, maskEmail, logDir, timezone, retentionDays };
