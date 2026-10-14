export const COUNTRY_CODES = [
  { code: '+92', country: 'PK', name: 'Pakistan (+92)', flag: '🇵🇰', maxDigits: 10 },
  { code: '+1', country: 'US', name: 'USA/Canada (+1)', flag: '🇺🇸', maxDigits: 10 },
  { code: '+44', country: 'GB', name: 'UK (+44)', flag: '🇬🇧', maxDigits: 10 },
  { code: '+971', country: 'AE', name: 'UAE (+971)', flag: '🇦🇪', maxDigits: 9 },
  { code: '+966', country: 'SA', name: 'Saudi Arabia (+966)', flag: '🇸🇦', maxDigits: 9 },
  { code: '+91', country: 'IN', name: 'India (+91)', flag: '🇮🇳', maxDigits: 10 },
  { code: '+61', country: 'AU', name: 'Australia (+61)', flag: '🇦🇺', maxDigits: 9 },
  { code: '+49', country: 'DE', name: 'Germany (+49)', flag: '🇩🇪', maxDigits: 11 },
];

/**
 * Normalizes any raw phone input string into { countryCode, localNumber, fullNumber }.
 * Prevents duplicate country codes like +92+92 and strips non-numeric characters from local number.
 */
export const parsePhoneNumber = (rawPhone = '') => {
  let clean = String(rawPhone || '').trim();
  
  // Clean duplicate leading country codes like +92+92 or ++92
  while (clean.startsWith('++')) {
    clean = clean.replace('++', '+');
  }
  if (clean.includes('+92+92')) {
    clean = clean.replace(/\+92\+92/g, '+92');
  }

  // Find matching country code from list
  let matchedCode = COUNTRY_CODES.find((c) => clean.startsWith(c.code));
  let countryCode = matchedCode ? matchedCode.code : '+92';
  let rest = matchedCode ? clean.slice(matchedCode.code.length) : clean;

  // If input started with local Pakistani 03xx (e.g. 03001234567), set countryCode to +92
  if (!matchedCode && rest.startsWith('03')) {
    countryCode = '+92';
    rest = rest.substring(1); // strip leading 0 -> 3001234567
  }

  // Extract only digits from rest
  let localDigits = rest.replace(/[^0-9]/g, '');

  // Strip leading 0 if localDigits is 11 digits starting with 0 for Pakistan
  if (countryCode === '+92' && localDigits.length === 11 && localDigits.startsWith('0')) {
    localDigits = localDigits.substring(1);
  }

  const codeObj = COUNTRY_CODES.find((c) => c.code === countryCode) || COUNTRY_CODES[0];
  const maxDigits = codeObj.maxDigits;

  if (localDigits.length > maxDigits) {
    localDigits = localDigits.slice(0, maxDigits);
  }

  const fullNumber = localDigits ? `${countryCode}${localDigits}` : '';

  return {
    countryCode,
    localNumber: localDigits,
    fullNumber,
    maxDigits,
  };
};

/**
 * Returns a clean WhatsApp click-to-chat URL without + or spaces
 */
export const getWhatsAppLink = (phoneStr = '', message = '') => {
  const { fullNumber } = parsePhoneNumber(phoneStr);
  if (!fullNumber) return '#';
  const cleanDigits = fullNumber.replace(/[^0-9]/g, '');
  const encodedMsg = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${cleanDigits}${encodedMsg}`;
};

/**
 * Pretty format for display (e.g. +92 300 1234567)
 */
export const formatPhoneDisplay = (phoneStr = '') => {
  const { countryCode, localNumber, fullNumber } = parsePhoneNumber(phoneStr);
  if (!fullNumber) return 'N/A';
  if (countryCode === '+92' && localNumber.length === 10) {
    return `${countryCode} ${localNumber.slice(0, 3)} ${localNumber.slice(3)}`;
  }
  return fullNumber;
};
