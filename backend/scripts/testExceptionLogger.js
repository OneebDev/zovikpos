const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const testLogDir = process.env.TEST_LOG_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'zovikpos-exceptions-'));
process.env.TEST_LOG_DIR = testLogDir;
process.env.LOG_DIR = testLogDir;
process.env.LOG_TIMEZONE = 'Asia/Karachi';
process.env.LOG_RETENTION_DAYS = '30';
process.env.LOG_LEVEL = 'info';
process.env.LOG_BURST_LIMIT_PER_MINUTE = '100';

if (process.argv[2] === '--fatal-child') {
  const logger = require('../src/utils/exceptionLogger');
  logger.installProcessHandlers();
  const kind = process.argv[3];
  if (kind === 'rejection') process.emit('unhandledRejection', new Error('synthetic rejected promise'));
  else process.emit('uncaughtException', new Error('synthetic uncaught exception'));
  process.exit(99);
}

const logger = require('../src/utils/exceptionLogger');
const entries = [];
const originalWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = (chunk, ...args) => {
  try { entries.push(...String(chunk).trim().split('\n').filter(Boolean).map((line) => JSON.parse(line))); } catch { /* preserve any non-JSON test output */ }
  return originalWrite(chunk, ...args);
};

const runFatalChild = (kind) => {
  const result = spawnSync(process.execPath, [__filename, '--fatal-child', kind], {
    encoding: 'utf8', env: { ...process.env, LOG_DIR: testLogDir },
  });
  assert.strictEqual(result.status, 1, `${kind} handler should exit with code 1`);
  for (const line of result.stdout.trim().split('\n').filter(Boolean)) entries.push(JSON.parse(line));
};

const main = async () => {
  // Exercise the same logger call used by the handled Express 500 middleware without opening a port.
  logger.exception('http.unhandled', new Error('synthetic handled 500'), { context: { method: 'GET', url: '/test-500', status: 500 } });

  runFatalChild('rejection');
  runFatalChild('uncaught');

  logger.exception('db.query', Object.assign(new Error('synthetic constraint error'), { code: 'P2002' }), { context: { model: 'Order', action: 'create', code: 'P2002' } });
  logger.exception('redis.connection', new Error('synthetic ECONNREFUSED Redis unavailable'), { level: 'warn', context: { action: 'connect' } });
  const { createRateLimiter } = require('../src/middleware/rateLimitMiddleware');
  const limiter = createRateLimiter({ windowMs: 60000, max: 1 });
  const request = { method: 'GET', ip: '192.168.2.109', baseUrl: '/api', path: '/test', route: { path: '/test' } };
  const limitedResponse = {
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  limiter(request, { setHeader() {} }, () => {});
  limiter(request, limitedResponse, () => {});
  assert.strictEqual(limitedResponse.statusCode, 429, 'rate limiter should return 429');

  // Exercise the actual mail service with a fake transport that rejects.
  process.env.RESEND_API_KEY = '';
  process.env.SMTP_HOST = 'smtp.test.invalid';
  process.env.SMTP_PORT = '465';
  process.env.SMTP_USER = 'test@example.com';
  process.env.SMTP_PASS = 'not-a-real-secret';
  const Module = require('module');
  const originalLoad = Module._load;
  Module._load = function loadWithMock(request, parent, isMain) {
    if (request === 'nodemailer') return { createTransport: () => ({ sendMail: async () => { throw new Error('synthetic SMTP failure'); } }) };
    return originalLoad.call(this, request, parent, isMain);
  };
  const mailer = require('../src/services/emailService');
  await mailer.sendOTPEmail('oneeb@example.com', 'Test User', '987654');
  Module._load = originalLoad;

  logger.exception('test.redaction', new Error('email=oneeb@example.com phone=+923001234567 otp=987654 token=eyJabcdefghijk.abc.def'), { context: { recipientEmail: 'oneeb@example.com' } });
  logger.log('warn', 'test.urlRedaction', 'Request rejected', { context: { url: '/api/orders/track/superSecretTrackingToken123' } });
  await logger.flush();

  const logFiles = fs.readdirSync(testLogDir).filter((name) => /^\d{4}-\d{2}-\d{2}\.txt$/.test(name));
  assert(logFiles.length >= 1, 'expected a date-named log file');
  const fileText = logFiles.map((name) => fs.readFileSync(path.join(testLogDir, name), 'utf8')).join('\n');
  for (const source of ['http.unhandled', 'process.unhandledRejection', 'process.uncaughtException', 'db.query', 'redis.connection', 'http.rate_limit', 'email.smtp.send']) {
    assert(fileText.includes(`SOURCE=${source}`), `missing logged source ${source}`);
  }
  assert(!fileText.includes('oneeb@example.com'), 'full email leaked into log file');
  assert(!fileText.includes('+923001234567'), 'full phone leaked into log file');
  assert(!fileText.includes('otp=987654'), 'OTP leaked into log file');
  assert(!fileText.includes('eyJabcdefghijk'), 'token leaked into log file');
  assert(!fileText.includes('superSecretTrackingToken123'), 'tracking token in URL leaked into log file');
  assert(fileText.includes('o***@example.com'), 'masked email should be present');
  const proofLine = fileText.split('\n').find((line) => line.includes('SOURCE=test.redaction'));
  assert(proofLine, 'expected a redaction proof line');
  assert(entries.some((entry) => entry.source === 'test.redaction'), 'each event should also be written to stdout as JSON');
  process.stdout.write = originalWrite;
  originalWrite(`REDACTION_SAMPLE ${proofLine}\n`);
  originalWrite(`PASS exception logger scenarios; date file ${logFiles[0]}; redaction verified\n`);
};

main().catch((error) => {
  process.stdout.write = originalWrite;
  console.error(error);
  process.exitCode = 1;
});
