const TABLE_TOKEN_PATTERN = /^tbl:[^:/?#%]+:\d+:[a-f\d]+:[A-Za-z0-9_-]+$/i;

/**
 * Accept a signed table token, a customer table path, or the full QR URL.
 * URL decoding is performed at most once, and only while the value is encoded.
 */
export const parseTableToken = (input) => {
  if (typeof input !== 'string' || !input.trim()) {
    return { token: '', error: 'The QR code does not contain a table token.' };
  }

  let value = input.trim();
  try {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(value)) {
      value = new URL(value).pathname;
    }
  } catch {
    return { token: '', error: 'The QR code URL is not valid.' };
  }

  value = value.split(/[?#]/, 1)[0].trim();
  const routeMarker = 'customer/table/';
  const markerIndex = value.toLowerCase().lastIndexOf(routeMarker);
  if (markerIndex >= 0) value = value.slice(markerIndex + routeMarker.length);
  else value = value.replace(/^\/+/, '');

  // The token has no slash. A slash here means the input is an unsupported path.
  value = value.split('/', 1)[0].trim();
  if (value.includes('%')) {
    try {
      value = decodeURIComponent(value);
    } catch {
      return { token: '', error: 'The QR code token is incorrectly encoded.' };
    }
  }

  if (!TABLE_TOKEN_PATTERN.test(value)) {
    return { token: '', error: 'The QR code does not contain a valid table token.' };
  }
  return { token: value, error: '' };
};

export default parseTableToken;
