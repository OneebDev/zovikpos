import React from 'react';

const BrandLogo = ({ subtitle = 'Smart Dining Experience', compact = false, className = '' }) => (
  <div className={`flex items-center gap-3 min-w-0 ${className}`}>
    <img
      src="/favicon.svg"
      alt="ZovikPOS logo"
      className={`${compact ? 'w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl' : 'w-10 h-10 rounded-xl'} shrink-0 shadow-md shadow-orange-600/20`}
    />
    <div className="min-w-0">
      <div className="text-sm font-black tracking-tight text-[var(--text-main)]">ZOVIKPOS</div>
      {!compact && <div className="text-[10px] font-semibold text-[var(--text-muted)] truncate">{subtitle}</div>}
    </div>
  </div>
);

export default BrandLogo;
