const crypto = require('crypto');

/**
 * PayFast Configuration Reader
 */
const getPayfastConfig = () => {
  return {
    merchantId: process.env.PAYFAST_MERCHANT_ID || '10046084',
    merchantKey: process.env.PAYFAST_MERCHANT_KEY || '5g23zd20hlv74',
    passphrase: process.env.PAYFAST_PASSPHRASE || '',
    processUrl: process.env.PAYFAST_SANDBOX_URL || 'https://sandbox.payfast.co.za/eng/process',
    isSandbox: process.env.PAYFAST_MODE !== 'live',
  };
};

/**
 * Generate PayFast Signature (MD5 hash of URL-encoded key=value pairs ordered per PayFast spec).
 * @param {Record<string, any>} data
 * @param {string} [passphrase]
 * @returns {string} MD5 hex signature
 */
function generateSignature(data, passphrase = '') {
  let pfOutput = '';
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      if (key !== 'signature') {
        const val = data[key];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          pfOutput += `${key}=${encodeURIComponent(String(val).trim()).replace(/%20/g, '+')}&`;
        }
      }
    }
  }

  // Remove trailing '&'
  pfOutput = pfOutput.slice(0, -1);

  if (passphrase) {
    pfOutput += `&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, '+')}`;
  }

  return crypto.createHash('md5').update(pfOutput).digest('hex');
}

/**
 * Validate ITN Signature
 * @param {Record<string, any>} pfData
 * @param {string} signature
 * @param {string} [passphrase]
 * @returns {boolean}
 */
function validateSignature(pfData, signature, passphrase = '') {
  const calculated = generateSignature(pfData, passphrase);
  return calculated.toLowerCase() === String(signature || '').toLowerCase();
}

module.exports = {
  getPayfastConfig,
  generateSignature,
  validateSignature,
};
