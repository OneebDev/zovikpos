import React, { useState, useEffect } from 'react';
import { COUNTRY_CODES, parsePhoneNumber } from '../utils/phoneUtils';

const PhoneInput = ({
  value = '',
  onChange,
  disabled = false,
  placeholder = '3001234567',
  className = '',
  required = false,
}) => {
  const parsed = parsePhoneNumber(value);
  const [selectedCode, setSelectedCode] = useState(parsed.countryCode || '+92');
  const [localNumber, setLocalNumber] = useState(parsed.localNumber || '');

  // Keep local state synchronized if external value changes
  useEffect(() => {
    const p = parsePhoneNumber(value);
    setSelectedCode(p.countryCode || '+92');
    setLocalNumber(p.localNumber || '');
  }, [value]);

  const activeCodeObj = COUNTRY_CODES.find((c) => c.code === selectedCode) || COUNTRY_CODES[0];
  const maxDigits = activeCodeObj.maxDigits;

  const handleCodeChange = (e) => {
    const newCode = e.target.value;
    setSelectedCode(newCode);
    const newCodeObj = COUNTRY_CODES.find((c) => c.code === newCode) || COUNTRY_CODES[0];
    const cappedLocal = localNumber.slice(0, newCodeObj.maxDigits);
    setLocalNumber(cappedLocal);
    const full = cappedLocal ? `${newCode}${cappedLocal}` : '';
    if (onChange) onChange(full);
  };

  const handleLocalNumberChange = (e) => {
    const rawVal = e.target.value;
    let digitsOnly = rawVal.replace(/[^0-9]/g, '');

    // Strip leading zero if user pastes 03xx for Pakistan +92
    if (selectedCode === '+92' && digitsOnly.length === 11 && digitsOnly.startsWith('0')) {
      digitsOnly = digitsOnly.substring(1);
    }

    if (digitsOnly.length > maxDigits) {
      digitsOnly = digitsOnly.slice(0, maxDigits);
    }

    setLocalNumber(digitsOnly);
    const full = digitsOnly ? `${selectedCode}${digitsOnly}` : '';
    if (onChange) onChange(full);
  };

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {/* Country Code Selector */}
      <select
        value={selectedCode}
        onChange={handleCodeChange}
        disabled={disabled}
        className="bg-[var(--bg-color,faf9f7)] border border-[var(--border-color,e7e5e4)] text-[var(--text-main,171717)] font-bold text-xs rounded-xl px-2.5 py-2.5 focus:outline-none focus:border-[#E85D2A] cursor-pointer shrink-0"
      >
        {COUNTRY_CODES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.flag} {c.code}
          </option>
        ))}
      </select>

      {/* Local Digits Input */}
      <div className="relative flex-1">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={localNumber}
          onChange={handleLocalNumberChange}
          disabled={disabled}
          required={required}
          maxLength={maxDigits}
          placeholder={placeholder || `e.g. ${selectedCode === '+92' ? '3001234567' : '1234567890'}`}
          className="w-full bg-[var(--bg-color,faf9f7)] border border-[var(--border-color,e7e5e4)] text-[var(--text-main,171717)] font-mono font-bold text-xs rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-[#E85D2A]"
        />
        {selectedCode === '+92' && (
          <span className="absolute right-3 top-2.5 text-[10px] font-mono text-stone-400 select-none">
            {localNumber.length}/10
          </span>
        )}
      </div>
    </div>
  );
};

export default PhoneInput;
