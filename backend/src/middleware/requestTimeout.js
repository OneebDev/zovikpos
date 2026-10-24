// requestTimeout.js
// Middleware: respond 504 if a request takes longer than REQUEST_TIMEOUT_MS.
// After sending 504, stub out the response methods on this res object so that
// a still-running async handler cannot throw ERR_HTTP_HEADERS_SENT or log a
// spurious server error when it eventually calls res.json / res.send / etc.

const exceptionLogger = require('../utils/exceptionLogger');

// errorResponse is internal only. No other file imports it from here.
const errorResponse = (res, status, message, code) => {
  return res.status(status).json({
    error: message,
    message,
    code,
  });
};

// Stub out response-mutation methods after a 504 has been sent so that a
// late handler call returns `res` without touching the already-closed socket.
const silenceResponse = (res) => {
  const noop = () => res;
  res.json = noop;
  res.send = noop;
  res.end = noop;
  res.status = noop;
  res.set = noop;
  res.setHeader = noop;
};

const isSkippedRoute = (req) => {
  const url = req.originalUrl || req.url || req.path || '';
  if (url.startsWith('/socket.io')) return true;
  if (url === '/health' || url.startsWith('/health/')) return true;
  if (url === '/ready' || url.startsWith('/ready/')) return true;
  // Skip static files directory only, not API routes that contain the word upload.
  if (url.startsWith('/uploads/')) return true;
  // Skip the single JSON-body image upload API endpoint.
  if (url.includes('/upload-image')) return true;
  // Skip AI OCR and invoice parsing (can take 30-60s for multi-pass / LLM vision)
  if (url.includes('/ocr-preview') || url.includes('/import/preview')) return true;
  return false;
};

const requestTimeout = (req, res, next) => {
  if (isSkippedRoute(req)) {
    return next();
  }

  // Read timeout from env at call time so tests can override it without module reload.
  const timeoutMs = Number(process.env.REQUEST_TIMEOUT_MS) || 25000;

  const timer = setTimeout(() => {
    // Node is single-threaded: no race between this check and the send below.
    if (res.headersSent) return;

    req.timedOut = true;
    req.exceptionLogged = true;

    exceptionLogger.log('warn', 'http.request_timeout',
      `Request timed out after ${timeoutMs}ms`, {
        context: {
          requestId: req.requestId,
          method: req.method,
          url: req.originalUrl || req.path,
          code: 'REQUEST_TIMEOUT',
        },
      });

    errorResponse(res, 504, 'Request timed out', 'REQUEST_TIMEOUT');

    // Stub response methods so any still-running handler cannot crash or log
    // a spurious error when it eventually tries to respond.
    silenceResponse(res);
  }, timeoutMs);

  // Cancel the timer as soon as a normal response is sent or the socket drops.
  res.on('finish', () => clearTimeout(timer));
  res.on('close', () => clearTimeout(timer));

  next();
};

module.exports = { requestTimeout };
