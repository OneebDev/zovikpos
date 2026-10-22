import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import api, { setActiveAuthTokens, resolveBackendUrl } from '../services/api';
import { connectSocket, getSocket } from '../services/socket';

import { useCustomerMenu } from '../hooks/useCustomerMenu';
import { useCustomerActiveOrders } from '../hooks/useCustomerActiveOrders';
import { parseTableDisplay, resolveTableLabel } from '../utils/customerTableLabel';
import { parseTableToken } from '../utils/parseTableToken';
import { formatCompactAmount } from '../utils/formatCompactAmount';
import { formatPrice } from '../utils/formatPrice';
import { clearIdempotencyKey, getOrCreateIdempotencyKey } from '../utils/idempotencyKey';
import {
  ShoppingBag,
  Sparkles,
  Search,
  ShoppingCart as CartIcon,
  Clock,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  RotateCcw,
  Mail,
  User,
  ShieldCheck,
  Plus,
  Minus,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  MapPin,
  Loader2,
  Sun,
  Moon,
  Download,
  X,
  QrCode,
  Share2,
  MoreVertical,
  LogOut,
  Trash2,
  LockKeyhole,
  ClipboardPaste,
  Zap,
  Smartphone,
  ExternalLink,
  Tag,
  Clock3,
} from 'lucide-react';
import FAQModal from './FAQModal';
import InAppQRScanner from './InAppQRScanner';
import ModalShell from './ui/ModalShell';
import './CustomerModals.css';
import './CustomerDashboardAuth.css';
import './CustomerDashboardHeader.css';
import './CustomerDashboardMenuControls.css';
import './CustomerDashboardFoodCards.css';
import './CustomerDashboardCartBar.css';

const PENDING_LOGIN_KEY = 'zovik_pending_login';
const PENDING_LOGIN_MAX_AGE_MS = 10 * 60 * 1000;

const clearPendingLogin = () => {
  try { window.sessionStorage.removeItem(PENDING_LOGIN_KEY); } catch { /* Storage may be unavailable. */ }
  try { window.localStorage.removeItem(PENDING_LOGIN_KEY); } catch { /* Storage may be unavailable. */ }
};

const isValidCustomerEmail = (email) => (
  typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
);

const readStoredCustomerValue = (key) => {
  try { return window.localStorage.getItem(key) || window.sessionStorage.getItem(key) || ''; }
  catch { return ''; }
};

const getOtpLinkContext = () => {
  try {
    const params = new URL(window.location.href).searchParams;
    const otp = params.get('otp') || '';
    const email = params.get('e') || '';
    const sessionId = params.get('sid') || '';
    if (!/^\d{6}$/.test(otp) || !isValidCustomerEmail(email) || !/^[\w-]{16,64}$/.test(sessionId)) return null;
    return { otp, email: email.trim(), sessionId };
  } catch {
    return null;
  }
};

const savePendingLogin = ({ name, email, otpSentAt, resendAvailableAt, sessionId, tableToken, tableId }) => {
  const pendingLogin = {
    step: 'otp',
    name: String(name || ''),
    email: String(email || ''),
    otpSentAt: Number(otpSentAt) || Date.now(),
    resendAvailableAt: Number(resendAvailableAt) || 0,
    sessionId: typeof sessionId === 'string' ? sessionId : readStoredCustomerValue('customer_sessionId'),
    tableToken: typeof tableToken === 'string' ? tableToken : readStoredCustomerValue('customer_tableToken'),
    tableId: typeof tableId === 'string' ? tableId : readStoredCustomerValue('customer_tableId'),
  };
  const serialized = JSON.stringify(pendingLogin);

  // Keep a localStorage backup because some iOS PWA reloads can lose sessionStorage.
  try {
    window.sessionStorage.setItem(PENDING_LOGIN_KEY, serialized);
  } catch {
    // Continue to the persistent fallback below.
  }

  try {
    window.localStorage.setItem(PENDING_LOGIN_KEY, serialized);
    return true;
  } catch {
    return false;
  }
};

const loadPendingLogin = () => {
  try {
    const emailLink = getOtpLinkContext();
    if (emailLink) {
      // The OTP email link contains the code and email, but not the customer's
      // name. Preserve the name from the pending login saved before opening Gmail.
      let pendingName = '';
      for (const storageName of ['sessionStorage', 'localStorage']) {
        try {
          const record = JSON.parse(window[storageName].getItem(PENDING_LOGIN_KEY) || 'null');
          if (
            record?.step === 'otp'
            && String(record.email || '').trim().toLowerCase() === emailLink.email.toLowerCase()
            && typeof record.name === 'string'
            && record.name.trim()
          ) {
            pendingName = record.name.trim();
            break;
          }
        } catch {
          // Try the other storage area; OTP link recovery must remain usable.
        }
      }
      return {
        step: 'otp',
        name: pendingName,
        email: emailLink.email,
        otpSentAt: Date.now(),
        resendAvailableAt: 0,
        sessionId: emailLink.sessionId,
        tableToken: readStoredCustomerValue('customer_tableToken'),
        tableId: readStoredCustomerValue('customer_tableId'),
      };
    }
    const records = [];
    let invalidRecordFound = false;
    for (const storageName of ['sessionStorage', 'localStorage']) {
      try {
        const storage = window[storageName];
        const serialized = storage.getItem(PENDING_LOGIN_KEY);
        if (!serialized) continue;
        let record;
        try {
          record = JSON.parse(serialized);
        } catch {
          invalidRecordFound = true;
          continue;
        }
        const validShape = record
          && typeof record === 'object'
          && record.step === 'otp'
          && (record.name === undefined || typeof record.name === 'string')
          && isValidCustomerEmail(record.email)
          && typeof record.otpSentAt === 'number'
          && Number.isFinite(record.otpSentAt)
          && typeof record.resendAvailableAt === 'number'
          && Number.isFinite(record.resendAvailableAt)
          && !Object.prototype.hasOwnProperty.call(record, 'otp');
        const age = validShape ? Date.now() - record.otpSentAt : -1;
        if (!validShape || age < 0 || age >= PENDING_LOGIN_MAX_AGE_MS) {
          invalidRecordFound = true;
          continue;
        }
        records.push({
          step: 'otp',
          name: typeof record.name === 'string' ? record.name : '',
          email: record.email.trim(),
          otpSentAt: record.otpSentAt,
          resendAvailableAt: record.resendAvailableAt,
          sessionId: typeof record.sessionId === 'string' ? record.sessionId : '',
          tableToken: typeof record.tableToken === 'string' ? record.tableToken : '',
          tableId: typeof record.tableId === 'string' ? record.tableId : '',
        });
      } catch {
        // A blocked storage backend should not prevent the customer page from mounting.
      }
    }
    if (invalidRecordFound) {
      clearPendingLogin();
      return null;
    }
    return records.sort((a, b) => b.otpSentAt - a.otpSentAt)[0] || null;
  } catch {
    clearPendingLogin();
    return null;
  }
};

const CustomerSessionTableChip = React.memo(({ label }) => {
  const previousLabelRef = React.useRef(label);
  const [isChanging, setIsChanging] = React.useState(false);

  React.useEffect(() => {
    if (previousLabelRef.current === label) return undefined;
    previousLabelRef.current = label;
    setIsChanging(true);
    const fadeTimer = window.setTimeout(() => setIsChanging(false), 200);
    return () => window.clearTimeout(fadeTimer);
  }, [label]);

  return (
    <span className="customer-header__table" aria-label={`Current table: ${label}`}>
      <MapPin aria-hidden="true" />
      <span className={isChanging ? 'customer-header__table-label is-changing' : 'customer-header__table-label'}>{label}</span>
      <span className="customer-header__live-dot" aria-hidden="true" />
    </span>
  );
});

const DeliveryTableDropdown = ({ value, tables, onChange, onOpen, loading = false, compact = false }) => {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState(null);
  const rootRef = React.useRef(null);
  const menuRef = React.useRef(null);
  const selectedTable = tables.find((table) => table.tableNumber === value);

  const updateMenuPosition = () => {
    const trigger = rootRef.current?.getBoundingClientRect();
    if (!trigger) return;
    const viewportPadding = 8;
    const width = Math.min(Math.max(trigger.width, 208), window.innerWidth - viewportPadding * 2);
    const maxHeight = Math.min(256, window.innerHeight - viewportPadding * 2);
    const spaceBelow = window.innerHeight - trigger.bottom - viewportPadding;
    const spaceAbove = trigger.top - viewportPadding;
    const openBelow = spaceBelow >= 160 || spaceBelow >= spaceAbove;
    const left = Math.min(Math.max(viewportPadding, trigger.left), window.innerWidth - width - viewportPadding);
    const top = openBelow
      ? Math.min(trigger.bottom + 6, window.innerHeight - maxHeight - viewportPadding)
      : Math.max(viewportPadding, trigger.top - maxHeight - 6);
    setMenuPosition({ left, top, width, maxHeight });
  };

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!rootRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    updateMenuPosition();
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [open]);

  return (
    <div className={`relative min-w-0 ${compact ? 'flex-1' : 'w-full sm:w-auto sm:flex-1'}`} ref={rootRef}>
      <button
        type="button"
        onClick={() => {
          if (open) {
            setOpen(false);
          } else {
            onOpen?.();
            updateMenuPosition();
            setOpen(true);
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Delivery table: ${selectedTable?.tableNumber || 'Select table'}`}
        className={`flex w-full items-center gap-2 rounded-xl border border-stone-200 bg-white text-left text-xs font-bold text-stone-900 shadow-sm transition hover:border-orange-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/20 ${compact ? 'px-2.5 py-1.5' : 'px-3 py-2'}`}
      >
        <MapPin className="h-3.5 w-3.5 shrink-0 text-orange-500" />
        <span className="min-w-0 flex-1 truncate">{loading ? 'Loading tables…' : selectedTable?.tableNumber || 'Select Table...'}</span>
        {loading ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-orange-500" /> : <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-stone-500 transition-transform ${open ? 'rotate-180' : ''}`} />}
      </button>
      {open && menuPosition && createPortal(
        <div ref={menuRef} role="listbox" aria-label="Active delivery tables" style={{ position: 'fixed', left: menuPosition.left, top: menuPosition.top, width: menuPosition.width, maxHeight: menuPosition.maxHeight }} className="z-[10000] overflow-y-auto rounded-xl border border-stone-200 bg-white p-1.5 shadow-2xl ring-1 ring-black/10">
          {loading ? (
            <p className="flex items-center justify-center gap-2 px-3 py-3 text-xs font-medium text-stone-500"><Loader2 className="h-3.5 w-3.5 animate-spin text-orange-500" />Loading active tables…</p>
          ) : tables.length === 0 ? (
            <p className="px-3 py-3 text-center text-xs font-medium text-stone-500">No active tables available</p>
          ) : tables.map((table) => {
            const isSelected = table.tableNumber === value;
            return (
              <button
                key={table.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => { onChange(table.tableNumber); setOpen(false); }}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold transition-colors ${isSelected ? 'bg-orange-50 text-orange-700' : 'text-stone-800 hover:bg-stone-100'}`}
              >
                <span className="min-w-0 flex-1 truncate">{table.tableNumber}</span>
                {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-orange-600" />}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
};

const loadedMenuImageUrls = new Set();

const CustomerMenuImage = ({ src, alt, priority, onError }) => {
  const [loaded, setLoaded] = useState(() => loadedMenuImageUrls.has(src));

  useEffect(() => setLoaded(loadedMenuImageUrls.has(src)), [src]);

  return (
    <>
      {!loaded && <div aria-hidden="true" className="absolute inset-0 skeleton !rounded-none" />}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        fetchPriority={priority ? 'high' : 'auto'}
        decoding="async"
        onLoad={() => {
          loadedMenuImageUrls.add(src);
          setLoaded(true);
        }}
        onError={(event) => {
          setLoaded(true);
          onError(event);
        }}
        width={700}
        height={700}
        className={`customer-menu-image ${loaded ? 'is-loaded' : ''}`}
      />
    </>
  );
};

// One native text field sits over the six visual OTP slots so mobile browsers
// can expose their built-in one-time-code and long-press paste affordances.
export const OtpInputBoxes = ({ value, onChange, disabled, prefillCode = '', onPrefillApplied, secondaryAction }) => {
  const inputRef = React.useRef(null);
  const appliedPrefillCode = React.useRef('');
  const clipboardHintTimer = React.useRef(null);
  const [suggestedCode, setSuggestedCode] = useState('');
  const [clipboardHint, setClipboardHint] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(null);
  const digits = String(value || '').replace(/\D/g, '').slice(0, 6);
  const slots = Array.from({ length: 6 }, (_, index) => digits[index] || '');
  const activeIndex = focusedIndex ?? Math.min(digits.length, 5);

  const hideClipboardHint = useCallback(() => {
    if (clipboardHintTimer.current) window.clearTimeout(clipboardHintTimer.current);
    clipboardHintTimer.current = null;
    setClipboardHint('');
  }, []);

  const showClipboardHint = useCallback(() => {
    if (clipboardHintTimer.current) window.clearTimeout(clipboardHintTimer.current);
    setClipboardHint('Tap the boxes, then long-press and choose Paste');
    clipboardHintTimer.current = window.setTimeout(() => {
      setClipboardHint('');
      clipboardHintTimer.current = null;
    }, 4000);
  }, []);

  const applyClipboardCode = useCallback((text) => {
    const match = String(text || '').match(/\d{6}/);
    if (!match) return false;
    onChange(match[0]);
    setSuggestedCode('');
    hideClipboardHint();
    return true;
  }, [hideClipboardHint, onChange]);

  const handleInputChange = (event) => {
    const nextCode = event.target.value.replace(/\D/g, '').slice(0, 6);
    event.target.value = nextCode;
    onChange(nextCode);
    const cursorPosition = event.target.selectionStart ?? nextCode.length;
    setFocusedIndex(Math.min(cursorPosition, 5));
    if (nextCode) hideClipboardHint();
  };

  const handlePaste = (event) => {
    event.preventDefault();
    const text = event.clipboardData?.getData('text') || '';
    const match = text.match(/\d{6}/);
    const pastedCode = match?.[0] || text.replace(/\D/g, '').slice(0, 6);
    if (pastedCode) applyClipboardCode(pastedCode);
  };

  const handleInputPointerDown = (event) => {
    if (disabled) return;
    const visual = event.currentTarget.previousElementSibling;
    if (!visual) return;
    const bounds = visual.getBoundingClientRect();
    const boxWidth = 46;
    const gap = 8;
    const contentWidth = (boxWidth * 6) + (gap * 5);
    const inset = Math.max(0, (bounds.width - contentWidth) / 2);
    const offsetX = event.clientX - bounds.left - inset;
    const index = Math.max(0, Math.min(5, Math.floor((offsetX + gap / 2) / (boxWidth + gap))));
    const input = event.currentTarget;
    input.focus({ preventScroll: true });
    if (digits[index]) input.setSelectionRange(index, index + 1);
    else {
      const cursorPosition = Math.min(index, digits.length);
      input.setSelectionRange(cursorPosition, cursorPosition);
    }
    setFocusedIndex(index);
    event.preventDefault();
  };

  useEffect(() => {
    if (!/^\d{6}$/.test(prefillCode) || appliedPrefillCode.current === prefillCode) return;
    if (applyClipboardCode(prefillCode)) {
      appliedPrefillCode.current = prefillCode;
      onPrefillApplied?.();
    }
  }, [prefillCode, onPrefillApplied, applyClipboardCode]);

  const handleClipboardPaste = async () => {
    inputRef.current?.focus();
    if (!window.isSecureContext || !navigator.clipboard?.readText) {
      showClipboardHint();
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      if (!applyClipboardCode(text)) showClipboardHint();
    } catch {
      inputRef.current?.focus();
      showClipboardHint();
    }
  };

  useEffect(() => {
    if (!window.isSecureContext || !navigator.clipboard?.readText) return undefined;
    const suggestClipboardCode = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const text = await navigator.clipboard.readText();
        const match = String(text || '').match(/\d{6}/);
        if (match) {
          setSuggestedCode(match[0]);
          hideClipboardHint();
        }
      } catch {
        // Clipboard suggestions are optional and remain silent when blocked.
      }
    };
    document.addEventListener('visibilitychange', suggestClipboardCode);
    return () => document.removeEventListener('visibilitychange', suggestClipboardCode);
  }, [hideClipboardHint]);

  useEffect(() => () => {
    if (clipboardHintTimer.current) window.clearTimeout(clipboardHintTimer.current);
  }, []);

  return (
    <div className="customer-auth-otp-entry">
      {suggestedCode && (
        <button
          type="button"
          className="customer-auth-paste-suggestion"
          aria-label={`Paste suggested verification code ${suggestedCode}`}
          disabled={disabled}
          onClick={() => applyClipboardCode(suggestedCode)}
        >
          <ClipboardPaste aria-hidden="true" />
          <span>Paste code {suggestedCode}?</span>
        </button>
      )}
      <div className="customer-auth-otp">
        <div className="customer-auth-otp-visual" aria-hidden="true">
          {slots.map((digit, index) => (
            <span key={index} className={`customer-otp-box${digit ? ' is-filled' : ''}${index === activeIndex ? ' is-active' : ''}`}>
              {digit}
            </span>
          ))}
        </div>
        <input
          ref={inputRef}
          type="text"
          className="customer-auth-otp-input"
          value={digits}
          disabled={disabled}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          maxLength={6}
          aria-label="6-digit verification code"
          onChange={handleInputChange}
          onPaste={handlePaste}
          onPointerDown={handleInputPointerDown}
          onFocus={() => setFocusedIndex(Math.min(digits.length, 5))}
          onBlur={() => setFocusedIndex(null)}
        />
      </div>
      <div className="customer-auth-clipboard-tools">
        <button
          type="button"
          className="customer-auth-paste-button"
          aria-label="Paste verification code from clipboard"
          disabled={disabled}
          onClick={handleClipboardPaste}
        >
          <ClipboardPaste aria-hidden="true" />
          <span>Paste code</span>
        </button>
        {secondaryAction}
        {clipboardHint && <span className="customer-auth-clipboard-hint" role="status" aria-live="polite">{clipboardHint}</span>}
      </div>
    </div>
  );
};

const CustomerInstallGuideModal = ({ isIosDevice, onClose, hasNativePrompt, onInstall }) => {
  const [platform, setPlatform] = useState(isIosDevice ? 'ios' : 'android');
  const showIosSteps = platform === 'ios';

  return (
    <ModalShell isOpen onClose={onClose} labelledBy="install-guide-title" closeOnBackdrop={false} closeOnEscape={false} className="customer-modal customer-modal--install">
      <header className="customer-modal__header customer-install__header">
        <img className="customer-install__app-icon" src="/assets/zovikpos-mark.svg" alt="ZovikPOS app icon" />
        <div className="customer-install__heading">
          <h2 id="install-guide-title">Install ZOVIKPOS</h2>
        </div>
        <button type="button" onClick={onClose} className="customer-modal__close icon-btn" aria-label="Close install guide">
          <X aria-hidden="true" />
        </button>
        <p className="customer-install__subtitle">Add it to your home screen for faster ordering.</p>
      </header>
      <div className="customer-install__benefits" aria-label="App benefits">
        <div><Zap aria-hidden="true" /><span>Instant</span></div>
        <div><Smartphone aria-hidden="true" /><span>App-like</span></div>
        <div><ShieldCheck aria-hidden="true" /><span>No store</span></div>
      </div>
      <div className={`customer-modal__platform-switch${showIosSteps ? ' is-ios' : ' is-android'}`} role="group" aria-label="Choose your device platform">
        <span className="customer-modal__platform-indicator" aria-hidden="true" />
        <button type="button" aria-pressed={showIosSteps} className={showIosSteps ? 'is-active' : ''} onClick={() => setPlatform('ios')}>
          <Share2 aria-hidden="true" /> iOS
        </button>
        <button type="button" aria-pressed={!showIosSteps} className={!showIosSteps ? 'is-active' : ''} onClick={() => setPlatform('android')}>
          <MoreVertical aria-hidden="true" /> Android
        </button>
      </div>

      <div className="customer-modal__install-steps">
        {showIosSteps ? (
          <>
            <div><span className="customer-modal__install-step-number">1</span><span><Share2 aria-hidden="true" /> Tap <strong>Share</strong> in Safari.</span></div>
            <div><span className="customer-modal__install-step-number">2</span><span><Plus aria-hidden="true" /> Choose <strong>Add to Home Screen</strong>.</span></div>
            <div><span className="customer-modal__install-step-number">3</span><span><Check aria-hidden="true" /> Tap <strong>Add</strong>.</span></div>
          </>
        ) : (
          <>
            <div><span className="customer-modal__install-step-number">1</span><span><MoreVertical aria-hidden="true" /> Open the Chrome menu.</span></div>
            <div><span className="customer-modal__install-step-number">2</span><span><Download aria-hidden="true" /> Choose <strong>Install app</strong>.</span></div>
            <div><span className="customer-modal__install-step-number">3</span><span><Check aria-hidden="true" /> Confirm by tapping <strong>Install</strong>.</span></div>
          </>
        )}
      </div>
      <div className="customer-modal__actions customer-install__actions">
        {hasNativePrompt ? (
          <button type="button" onClick={onInstall} className="customer-modal__button customer-modal__button--primary">Install Now</button>
        ) : (
          <button type="button" onClick={onClose} className="customer-modal__button customer-modal__button--primary">Got it</button>
        )}
        <button type="button" onClick={onClose} className="customer-modal__button customer-modal__button--secondary customer-install__later">Maybe later</button>
      </div>
    </ModalShell>
  );
};

const scrollCardWithinNearestContainer = (card) => {
  if (!card || typeof window === 'undefined') return;
  let container = card.parentElement;
  while (container && container !== document.body && container !== document.documentElement) {
    const { overflowY } = window.getComputedStyle(container);
    if (/(auto|scroll|overlay)/.test(overflowY) && container.scrollHeight > container.clientHeight) break;
    container = container.parentElement;
  }

  const pageScroll = !container || container === document.body || container === document.documentElement;
  const scrollContainer = pageScroll ? document.scrollingElement : container;
  if (!scrollContainer) return;

  const cardRect = card.getBoundingClientRect();
  const scrollRect = pageScroll
    ? { top: 0, bottom: window.innerHeight }
    : scrollContainer.getBoundingClientRect();
  const headerBottom = document.querySelector('.customer-header')?.getBoundingClientRect().bottom || scrollRect.top;
  const categoryBar = document.querySelector('.customer-category-sticky.is-stuck');
  const categoryBottom = categoryBar?.getBoundingClientRect().bottom || scrollRect.top;
  const cartTop = document.querySelector('.customer-cart-dock')?.getBoundingClientRect().top || scrollRect.bottom;
  const visibleTop = Math.max(scrollRect.top, headerBottom, categoryBottom);
  const visibleBottom = Math.min(scrollRect.bottom, cartTop);

  // A card taller than the available viewport cannot fit at both ends; prefer
  // keeping its top clear of the sticky controls so the user can scroll down.
  const delta = cardRect.top < visibleTop
    ? cardRect.top - visibleTop
    : cardRect.bottom > visibleBottom
      ? cardRect.bottom - visibleBottom
      : 0;
  if (!delta) return;

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (pageScroll) window.scrollBy({ top: delta, behavior: reduceMotion ? 'auto' : 'smooth' });
  else scrollContainer.scrollBy({ top: delta, behavior: reduceMotion ? 'auto' : 'smooth' });
};

const CustomerDashboard = ({ tableIdFromRoute, onLogout }) => {
  useEffect(() => {
    const dismissTooltipOnEscape = (event) => {
      if (event.key === 'Escape') document.documentElement.classList.add('customer-tooltip-dismissed');
    };
    document.addEventListener('keydown', dismissTooltipOnEscape);
    return () => document.removeEventListener('keydown', dismissTooltipOnEscape);
  }, []);

  const navigate = useNavigate();
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');

  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleCustomerLogout = () => {
    // Clear all customer tokens, state and session caches
    clearPendingLogin();
    localStorage.removeItem('customer_token');
    localStorage.removeItem('customer_user');
    localStorage.removeItem('customer_verifiedSessionId');
    localStorage.removeItem('customer_sessionId');
    localStorage.removeItem('customer_tableToken');
    localStorage.removeItem('customer_tableId');
    localStorage.removeItem('customer_cart');
    localStorage.removeItem('customer_checkoutStep');
    localStorage.removeItem('customer_category');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.clear();

    setIsSessionVerified(false);
    setSessionId('');
    setCart({});
    setTableId('');
    setRequiresTableQr(true);
    setCategory('All');
    setSearchQuery('');
    setTableError('');
    setError('');
    setAuthName('');
    setAuthEmail('');
    setGuestName('');
    setOtpCode('');
    setOtpSent(false);
    setOtpSentAt(0);
    setResendAvailableAt(0);
    setOtpError('');
    setOtpSuccess('');
    setCooldown(0);
    setExpandedGroup(null);
    setPendingVariant({});
    setPendingQty({});
    if (onLogout) {
      onLogout();
    }
    navigate('/customer', { replace: true });
  };

  const requestCustomerLogout = () => setShowSignOutConfirm(true);

  const confirmCustomerLogout = () => {
    setShowSignOutConfirm(false);
    setIsSigningOut(true);
    window.setTimeout(handleCustomerLogout, 160);
  };

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
    const themeColor = document.querySelector('meta[name="theme-color"]');
    themeColor?.setAttribute('content', theme === 'dark' ? '#111111' : '#FAF9F7');
  }, [theme]);

  const [cart, setCart] = useState(() => {
    try {
      const saved = localStorage.getItem('customer_cart');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const handleOpenCustomerCart = () => {
    // Persist the latest rendered cart before the cart route initializes from storage.
    try { localStorage.setItem('customer_cart', JSON.stringify(cart)); } catch { /* Storage may be unavailable. */ }
    navigate('/customer/cart');
  };
  const [tableId, setTableId] = useState(() => {
    const saved = localStorage.getItem('customer_tableId') || sessionStorage.getItem('customer_tableId');
    if (saved) return parseTableDisplay(saved);
    if (tableIdFromRoute) return parseTableDisplay(tableIdFromRoute);
    return '';
  });
  const lastValidTableLabelRef = React.useRef((() => {
    const saved = parseTableDisplay(localStorage.getItem('customer_tableId'));
    return saved && saved !== 'Counter' ? saved : '';
  })());
  const [requiresTableQr, setRequiresTableQr] = useState(false);
  const [sessionRetryAttempt, setSessionRetryAttempt] = useState(0);
  const [tableConnectionError, setTableConnectionError] = useState('');
  const [tableConnectionRetryable, setTableConnectionRetryable] = useState(true);
  const stableTableLabel = useMemo(() => {
    const label = resolveTableLabel({
      sessionLabel: tableId,
      routeToken: tableIdFromRoute,
      qrToken: localStorage.getItem('customer_tableToken'),
      lastValidLabel: lastValidTableLabelRef.current,
      forCustomer: true,
    });
    if (label) lastValidTableLabelRef.current = label;
    return label;
  }, [tableId, tableIdFromRoute]);
  const [sessionId, setSessionId] = useState(() => (
    getOtpLinkContext()?.sessionId || localStorage.getItem('customer_sessionId') || sessionStorage.getItem('customer_sessionId') || ''
  ));
  const [sessionInitializationDone, setSessionInitializationDone] = useState(() => (
    !tableIdFromRoute && Boolean(localStorage.getItem('customer_sessionId') || sessionStorage.getItem('customer_sessionId'))
  ));
  const lastSessionInitRouteRef = React.useRef(tableIdFromRoute || '');
  const [tableError, setTableError] = useState('');
  const { menu, isLoading: isMenuLoading, isError: isMenuError, refetch: refetchMenu } = useCustomerMenu({
    enabled: sessionInitializationDone && !requiresTableQr,
  });
  const previousMenuSnapshotRef = React.useRef(null);

  useEffect(() => {
    const currentSnapshot = new Map(menu.map((item) => [String(item.id), JSON.stringify(item)]));
    const previousSnapshot = previousMenuSnapshotRef.current;
    if (previousSnapshot) {
      const changedItemIds = [...currentSnapshot.keys()].filter((id) => (
        previousSnapshot.has(id) && previousSnapshot.get(id) !== currentSnapshot.get(id)
      ));
      if (changedItemIds.length) {
        document.querySelectorAll('.customer-food-card').forEach((card) => {
          const cardItemIds = card.getAttribute('data-menu-item-ids')?.split(',') || [];
          if (!cardItemIds.some((id) => changedItemIds.includes(id))) return;
          card.classList.remove('is-updated');
          void card.offsetWidth;
          card.classList.add('is-updated');
          window.setTimeout(() => card.classList.remove('is-updated'), 600);
        });
      }
    }
    previousMenuSnapshotRef.current = currentSnapshot;
  }, [menu]);
  const [category, setCategory] = useState(() => localStorage.getItem('customer_category') || 'All');
  const [transferSuccessMessage, setTransferSuccessMessage] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFAQ, setShowFAQ] = useState(false);
  const [error, setError] = useState('');

  // ─── Variant / Quantity Selection State ───────────────────────────────────
  // expandedGroup: the groupKey of the currently-open food card (only one open at a time)
  const [expandedGroup, setExpandedGroup] = useState(null);
  const expandedScrollTargetRef = React.useRef(null);
  // pendingVariant: { [groupKey]: variantObject } — the selected variant pill per group
  const [pendingVariant, setPendingVariant] = useState({});
  // pendingQty: { [variantId]: number } — EACH VARIANT has its own quantity, independent
  const [pendingQty, setPendingQty] = useState({});

  useEffect(() => {
    if (!expandedGroup || !expandedScrollTargetRef.current) return undefined;
    const target = expandedScrollTargetRef.current;
    const timer = window.setTimeout(() => scrollCardWithinNearestContainer(target), 280);
    return () => window.clearTimeout(timer);
  }, [expandedGroup]);

  // ─── Safely fetch stored customer identity (ignoring staff accounts like Demo Kitchen) ───
  const getStoredCustomerUser = () => {
    try {
      const savedCustomer = localStorage.getItem('customer_user') || sessionStorage.getItem('customer_user');
      if (savedCustomer) {
        const u = JSON.parse(savedCustomer);
        if (u && (!u.role || u.role === 'CUSTOMER')) return u;
      }
    } catch  { /* Optional storage or parsing failure. */ }

    try {
      const savedUser = sessionStorage.getItem('user') || localStorage.getItem('user');
      if (savedUser) {
        const u = JSON.parse(savedUser);
        if (u && (!u.role || u.role === 'CUSTOMER')) return u;
      }
    } catch  { /* Optional storage or parsing failure. */ }

    return null;
  };

  const checkIsCustomerLoggedIn = () => {
    const savedToken = localStorage.getItem('customer_token') || localStorage.getItem('token') || sessionStorage.getItem('token');
    const u = getStoredCustomerUser();
    return Boolean(savedToken && u && !u.isGuest);
  };

  // ─── Session OTP Verification State ──────────────────────────────────────
  const [isSessionVerified, setIsSessionVerified] = useState(() => {
    if (checkIsCustomerLoggedIn()) return true;
    const savedSession = localStorage.getItem('customer_sessionId') || sessionStorage.getItem('customer_sessionId');
    const verifiedSessionId = localStorage.getItem('customer_verifiedSessionId') || sessionStorage.getItem('customer_verifiedSessionId');
    return Boolean(savedSession && verifiedSessionId === savedSession);
  });

  useEffect(() => {
    const handleCustomerAuthExpired = () => {
      // Keep the physical-table session and cart; only require email/OTP again.
      localStorage.removeItem('customer_verifiedSessionId');
      sessionStorage.removeItem('customer_verifiedSessionId');
      setIsSessionVerified(false);
      setTableError('');
      setError('');
    };
    window.addEventListener('customer-auth-expired', handleCustomerAuthExpired);
    return () => window.removeEventListener('customer-auth-expired', handleCustomerAuthExpired);
  }, []);

  const [pendingLoginOnMount] = useState(() => {
    const saved = loadPendingLogin();
    if (!saved) return null;
    // A persisted verifiedSessionId is only a local hint; the session is checked
    // with the server below. Preserve pending OTP context until that check ends.
    if (checkIsCustomerLoggedIn()) {
      clearPendingLogin();
      return null;
    }

    const sentAt = Number(saved.otpSentAt);
    const age = Date.now() - sentAt;
    if (saved.step !== 'otp' || !Number.isFinite(sentAt) || age < 0 || age >= PENDING_LOGIN_MAX_AGE_MS) {
      clearPendingLogin();
      return null;
    }

    return {
      ...saved,
      name: String(saved.name || ''),
      email: String(saved.email || ''),
      otpSentAt: sentAt,
      resendAvailableAt: Number(saved.resendAvailableAt) || 0,
    };
  });

  useEffect(() => {
    if (!isSigningOut || isSessionVerified || sessionId) return undefined;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => setIsSigningOut(false));
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [isSigningOut, isSessionVerified, sessionId]);

  const { activeOrders, failedOrders, refetch: refetchActiveOrders, dismissFailedOrder } = useCustomerActiveOrders({
    enabled: isSessionVerified && sessionInitializationDone && !requiresTableQr,
  });
  const hasProtectedCustomerState = () => (
    checkIsCustomerLoggedIn()
    || Object.values(cart).some((item) => Number(item?.quantity) > 0)
    || activeOrders.some((order) => ['PENDING', 'PAID', 'PREPARING', 'READY'].includes(order.status))
    || (() => { try { return (JSON.parse(localStorage.getItem('customer_active_orders_cache') || '{}').activeOrders || []).some((order) => ['PENDING', 'PAID', 'PREPARING', 'READY'].includes(order.status)); } catch { return false; } })()
  );

  const [authName, setAuthName] = useState(() => {
    if (pendingLoginOnMount?.name) return pendingLoginOnMount.name;
    const u = getStoredCustomerUser();
    return u ? (u.name || '') : '';
  });
  const [authEmail, setAuthEmail] = useState(() => {
    if (pendingLoginOnMount?.email) return pendingLoginOnMount.email;
    const u = getStoredCustomerUser();
    return u ? (u.email || '') : '';
  });
  const [otpCode, setOtpCode] = useState('');
  // Older pending-login records may not have a name. Resume those at step 1,
  // where the required name can be collected before sending a fresh code.
  const [otpSent, setOtpSent] = useState(() => Boolean(pendingLoginOnMount?.name?.trim()));
  const [otpPrefillCode, setOtpPrefillCode] = useState('');
  const emailLinkClipboardCodeRef = React.useRef('');
  const emailLinkClipboardListenerRef = React.useRef(null);
  const clearOtpPrefillCode = useCallback(() => setOtpPrefillCode(''), []);
  const [otpSentAt, setOtpSentAt] = useState(() => pendingLoginOnMount?.otpSentAt || 0);
  const [resendAvailableAt, setResendAvailableAt] = useState(() => pendingLoginOnMount?.resendAvailableAt || 0);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [otpSuccess, setOtpSuccess] = useState('');
  const [cooldown, setCooldown] = useState(() => pendingLoginOnMount?.name?.trim()
    ? Math.max(0, Math.ceil(((pendingLoginOnMount?.resendAvailableAt || 0) - Date.now()) / 1000))
    : 0);

  useEffect(() => {
    const code = emailLinkClipboardCodeRef.current;
    if (isSessionVerified || !code || otpCode !== code) {
      if (isSessionVerified) emailLinkClipboardCodeRef.current = '';
      return undefined;
    }

    const copyCodeAfterGesture = () => {
      try {
        if (window.isSecureContext && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          const writePromise = navigator.clipboard.writeText(code);
          writePromise?.catch(() => {});
        }
      } catch {
        // Clipboard writes are optional and may be blocked by the browser.
      }
      emailLinkClipboardCodeRef.current = '';
      emailLinkClipboardListenerRef.current = null;
    };

    document.addEventListener('pointerdown', copyCodeAfterGesture, { once: true, passive: true });
    const cleanupListener = () => document.removeEventListener('pointerdown', copyCodeAfterGesture);
    emailLinkClipboardListenerRef.current = cleanupListener;
    return () => {
      cleanupListener();
      if (emailLinkClipboardListenerRef.current === cleanupListener) {
        emailLinkClipboardListenerRef.current = null;
      }
    };
  }, [otpCode, isSessionVerified]);

  useEffect(() => () => {
    emailLinkClipboardListenerRef.current?.();
    emailLinkClipboardListenerRef.current = null;
    emailLinkClipboardCodeRef.current = '';
  }, []);

  const persistCurrentPendingLogin = useCallback(() => {
    const cleanEmail = (authEmail || '').trim();
    if (isSessionVerified) {
      clearPendingLogin();
      return;
    }
    if (!otpSent || !cleanEmail || !otpSentAt) return;
    if (Date.now() - otpSentAt >= PENDING_LOGIN_MAX_AGE_MS) {
      clearPendingLogin();
      return;
    }
    savePendingLogin({ name: authName, email: cleanEmail, otpSentAt, resendAvailableAt });
  }, [isSessionVerified, otpSent, authEmail, otpSentAt, authName, resendAvailableAt]);

  // Table Switching Modal State
  const [showTableSwitchModal, setShowTableSwitchModal] = useState(false);
  const [pendingTableToken, setPendingTableToken] = useState(null);
  const [pendingTableNumber, setPendingTableNumber] = useState('');
  // Snapshot of the OLD table name so modal always shows correct "from" table
  const [currentTableSnapshot, setCurrentTableSnapshot] = useState('');

  // Change Delivery Table (post-order) state
  const [availableTables, setAvailableTables] = useState([]);
  const [availableTablesLoading, setAvailableTablesLoading] = useState(false);
  const [deliveryChangeOrderId, setDeliveryChangeOrderId] = useState(null);
  const [, setDeliveryChangePicking] = useState(false);
  const [deliveryChangeTarget, setDeliveryChangeTarget] = useState('');
  const [deliveryChangeLoading, setDeliveryChangeLoading] = useState(false);

  // Scan time calculation for header
  const [scanTime] = useState(() => {
    const d = new Date();
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  });

  const [guestName, setGuestName] = useState(() => {
    const saved = localStorage.getItem('user');
    if (saved) {
      try {
        const u = JSON.parse(saved);
        if (!u.isGuest) return u.name;
      } catch  { /* Optional storage or parsing failure. */ }
    }
    return '';
  });

  // Derive cooldown from its deadline so time spent outside the app is accounted for.
  useEffect(() => {
    const updateCooldown = () => {
      setCooldown(Math.max(0, Math.ceil((resendAvailableAt - Date.now()) / 1000)));
    };
    const refreshOnReturn = () => {
      if (document.visibilityState === 'visible') updateCooldown();
    };
    updateCooldown();
    document.addEventListener('visibilitychange', refreshOnReturn);
    const timer = resendAvailableAt ? window.setInterval(updateCooldown, 1000) : null;
    return () => {
      document.removeEventListener('visibilitychange', refreshOnReturn);
      if (timer) window.clearInterval(timer);
    };
  }, [resendAvailableAt]);

  useEffect(() => {
    if (!otpSent || !otpSentAt) return undefined;
    const expiryTimer = window.setTimeout(
      clearPendingLogin,
      Math.max(0, otpSentAt + PENDING_LOGIN_MAX_AGE_MS - Date.now()),
    );
    return () => window.clearTimeout(expiryTimer);
  }, [otpSent, otpSentAt]);

  useEffect(() => {
    if (isSessionVerified) clearPendingLogin();
  }, [isSessionVerified]);

  useEffect(() => {
    const saveWhenHidden = () => {
      if (document.visibilityState === 'hidden') persistCurrentPendingLogin();
    };
    const saveOnPageHide = () => persistCurrentPendingLogin();
    document.addEventListener('visibilitychange', saveWhenHidden);
    window.addEventListener('pagehide', saveOnPageHide);
    return () => {
      document.removeEventListener('visibilitychange', saveWhenHidden);
      window.removeEventListener('pagehide', saveOnPageHide);
    };
  }, [persistCurrentPendingLogin]);

  // ─── PWA Installation Prompt State ─────────────────────────────────────────
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState(null);
  const [isIosDevice, setIsIosDevice] = useState(false);
  const [isAppInstalled, setIsAppInstalled] = useState(false);

  useEffect(() => {
    // Check if running in standalone mode (already installed)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isStandalone) {
      setIsAppInstalled(true);
      return;
    }

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(userAgent);
    setIsIosDevice(isIos);

    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredInstallPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsAppInstalled(true);
      setDeferredInstallPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredInstallPrompt) {
      try {
        deferredInstallPrompt.prompt();
        const { outcome } = await deferredInstallPrompt.userChoice;
        if (outcome === 'accepted') {
          setIsAppInstalled(true);
        }
        setDeferredInstallPrompt(null);
      } catch (err) {
        console.warn('Install prompt error:', err);
        setShowInstallGuide(true);
      }
    } else {
      setShowInstallGuide(true);
    }
  };

  // ─── In-App QR Scanner State ──────────────────────────────────────────────
  const [showInAppScanner, setShowInAppScanner] = useState(false);

  const handleQrScanned = (scannedText) => {
    if (!scannedText) return;
    try {
      const parsed = parseTableToken(scannedText);
      if (!parsed.token) {
        setTableError('This QR code is not valid. Please scan again or ask the staff.');
        setRequiresTableQr(true);
        return;
      }
      const token = parsed.token;

      const scannedTableLabel = parseTableDisplay(token);
      if (scannedTableLabel) {
        lastValidTableLabelRef.current = scannedTableLabel;
        setTableId(scannedTableLabel);
      }

      // If user is scanning to recover expired session or switch table
      if (sessionExpired) {
        ['customer_sessionId', 'customer_verifiedSessionId', 'customer_tableToken', 'customer_tableId', 'customer_cart', 'customer_checkoutStep'].forEach((key) => { localStorage.removeItem(key); sessionStorage.removeItem(key); });
        setSessionId('');
        setTableId('');
        setCart({});
        setIsSessionVerified(false);
        setSessionExpired(false);
      }

      navigate(`/customer/table/${encodeURIComponent(token)}${window.location.search}`);
    } catch (err) {
      console.error('Scan process error:', err);
      setTableError('Could not read table QR code. Please try again.');
    }
  };
  useEffect(() => {
    const routeToken = tableIdFromRoute || '';
    if (lastSessionInitRouteRef.current !== routeToken) {
      lastSessionInitRouteRef.current = routeToken;
      setSessionInitializationDone(false);
    }
    let isActive = true;
    let timedOut = false;
    const abortController = new AbortController();
    const initSession = async () => {
      setTableConnectionError('');
      setTableConnectionRetryable(true);
      let storedSession = getOtpLinkContext()?.sessionId || pendingLoginOnMount?.sessionId || localStorage.getItem('customer_sessionId') || sessionStorage.getItem('customer_sessionId') || '';
      let storedTable = localStorage.getItem('customer_tableId') || sessionStorage.getItem('customer_tableId') || pendingLoginOnMount?.tableId || '';
      const storedTableToken = localStorage.getItem('customer_tableToken') || sessionStorage.getItem('customer_tableToken') || '';
      const restoreToken = pendingLoginOnMount?.tableToken || (hasProtectedCustomerState() ? storedTableToken : '');

      const restoreFromPendingScannedQr = async () => {
        if (!restoreToken) return false;
        try {
          const payload = { qrToken: restoreToken };
          const idempotencyKey = getOrCreateIdempotencyKey('customer_session_restore_attempt', payload);
          const response = await api.post('/sessions/start', payload, {
            signal: abortController.signal,
            headers: { 'Idempotency-Key': idempotencyKey },
          });
          clearIdempotencyKey('customer_session_restore_attempt', idempotencyKey);
          if (!isActive || timedOut) return false;
          const restoredSession = response.data?.session;
          const restoredLabel = resolveTableLabel({
            tableLabel: restoredSession?.tableLabel,
            table: restoredSession?.table,
            routeToken: restoreToken,
            forCustomer: true,
          });
          if (!restoredSession?.id || !restoredSession.tableId && !restoredSession.table?.id || !restoredLabel) return false;
          setRequiresTableQr(false);
          setSessionId(restoredSession.id);
          setTableId(restoredLabel);
          lastValidTableLabelRef.current = restoredLabel;
          localStorage.setItem('customer_sessionId', restoredSession.id);
          localStorage.setItem('customer_tableToken', restoreToken);
          localStorage.setItem('customer_tableId', restoredLabel);
          if (checkIsCustomerLoggedIn()) {
            localStorage.setItem('customer_verifiedSessionId', restoredSession.id);
            setIsSessionVerified(true);
          } else {
            localStorage.removeItem('customer_verifiedSessionId');
            setIsSessionVerified(false);
          }
          fetchServerCart(restoredSession.id);
          checkForExistingOrder(restoredSession.id);
          return true;
        } catch {
          return false;
        }
      };

      if (tableIdFromRoute) {
        // A route containing a table link must stay in the link flow. Show a
        // link error if it cannot be verified; reserve the scan gate for /customer.
        setRequiresTableQr(false);
        setSessionExpired(false);
        const parsedRouteToken = parseTableToken(String(tableIdFromRoute));
        const cleanRouteToken = parsedRouteToken.token;
        if (!cleanRouteToken) {
          setTableConnectionRetryable(false);
          setTableConnectionError('This table link could not be read. Check the URL or copy the current table link from Admin.');
          return;
        }

        let validatedQr;
        try {
          const payload = { qrToken: cleanRouteToken, validateOnly: true };
          const idempotencyKey = getOrCreateIdempotencyKey('customer_session_validate_attempt', payload);
          const validationResponse = await api.post('/sessions/start', payload, {
            signal: abortController.signal,
            headers: { 'Idempotency-Key': idempotencyKey },
          });
          clearIdempotencyKey('customer_session_validate_attempt', idempotencyKey);
          if (!isActive || timedOut) return;
          validatedQr = validationResponse.data;
        } catch (validationError) {
          if (!isActive || timedOut) return;
          const invalidQr = validationError.response?.data?.code === 'TABLE_QR_REQUIRED'
            || ((validationError.response?.status === 400 || validationError.response?.status === 401)
              && /invalid|expired|token|qr code/i.test(validationError.response?.data?.error || validationError.response?.data?.message || ''));
          if (invalidQr) {
            setTableConnectionRetryable(false);
            setTableConnectionError('This table link is no longer valid. Copy the current table link from Admin and try again.');
          } else {
            setTableConnectionRetryable(!validationError.response || validationError.response.status >= 500);
            setTableConnectionError(validationError.response?.data?.error || 'The table service is temporarily unavailable.');
          }
          return;
        }
        const newTableDisplay = resolveTableLabel({ table: validatedQr.table, tableLabel: validatedQr.tableLabel, routeToken: cleanRouteToken, forCustomer: true });
        if (!newTableDisplay) {
          setTableConnectionRetryable(false);
          setTableConnectionError('This table link is not connected to an active table. Copy the current table link from Admin.');
          return;
        }
        const previouslyScannedToken = parseTableToken(storedTableToken).token;
        const scannedNewQr = Boolean(
          storedSession
          && previouslyScannedToken
          && previouslyScannedToken !== cleanRouteToken
        );
        if (scannedNewQr) {
          // A newly generated QR for the same table represents a new dining
          // visit. Do not attach the old visit's session or cart to it.
          ['customer_sessionId', 'customer_verifiedSessionId', 'customer_cart', 'customer_checkoutStep'].forEach((key) => {
            localStorage.removeItem(key);
            sessionStorage.removeItem(key);
          });
          storedSession = '';
          storedTable = '';
          setSessionId('');
          setCart({});
          setIsSessionVerified(false);
        }
        // Persist the verified QR immediately. Login or email-app navigation
        // can reload the app before session creation finishes; the table link
        // must still be available for recovery on /customer.
        localStorage.setItem('customer_tableToken', cleanRouteToken);
        sessionStorage.setItem('customer_tableToken', cleanRouteToken);
        localStorage.setItem('customer_tableId', newTableDisplay);
        sessionStorage.setItem('customer_tableId', newTableDisplay);
        setRequiresTableQr(false);
        setTableError('');

        // A table-switch choice is offered only when the saved session is still
        // active and linked to a real table. Stale counter sessions are discarded.
        let savedSessionIsPhysical = false;
        let savedSessionTableId = '';
        if (storedSession) {
          try {
            const currentSessionResponse = await api.get(`/sessions/${storedSession}`, { signal: abortController.signal });
            if (!isActive || timedOut) return;
            const currentSession = currentSessionResponse.data.session;
            savedSessionIsPhysical = Boolean(currentSession?.status === 'ACTIVE' && currentSession.tableId && currentSession.table?.isActive);
            savedSessionTableId = String(currentSession?.tableId || currentSession?.table?.id || '');
          } catch {
            // A server/network error must not discard a customer's session or cart.
            setTableConnectionError('The table service is temporarily unavailable.');
            return;
          }
          if (!savedSessionIsPhysical) {
            const protectedCustomer = checkIsCustomerLoggedIn()
              || Object.values(cart).some((item) => Number(item?.quantity) > 0)
              || (() => { try { return (JSON.parse(localStorage.getItem('customer_active_orders_cache') || '{}').activeOrders || []).some((order) => ['PENDING', 'PAID', 'PREPARING', 'READY'].includes(order.status)); } catch { return false; } })();
            const preservedCart = protectedCustomer;
            ['customer_sessionId', 'customer_verifiedSessionId', 'customer_tableToken', 'customer_tableId', ...(!preservedCart ? ['customer_cart', 'customer_checkoutStep'] : [])].forEach((key) => { localStorage.removeItem(key); sessionStorage.removeItem(key); });
            storedSession = '';
            storedTable = '';
            setSessionId('');
            setTableId('');
            if (!preservedCart) setCart({});
            if (!checkIsCustomerLoggedIn()) setIsSessionVerified(false);
          }
        }

        const isDifferentTable = savedSessionIsPhysical
          && Boolean(savedSessionTableId)
          && savedSessionTableId !== String(validatedQr.table?.id || '');

        if (isDifferentTable) {
          // Await active orders and cart BEFORE showing modal so the correct card opens instantly without flickering
          if (storedSession) {
            await checkForExistingOrder(storedSession);
            if (!isActive || timedOut) return;
            await fetchServerCart(storedSession);
            if (!isActive || timedOut) return;
          }
          // Snapshot current table BEFORE we trigger the modal so it shows correctly
          const oldTable = storedTable ? parseTableDisplay(storedTable) : (tableId || 'your table');
          setCurrentTableSnapshot(oldTable);
          setPendingTableToken(cleanRouteToken);
          setPendingTableNumber(newTableDisplay);
          setShowTableSwitchModal(true);
          return;
        }

        // Reuse an active stored session when it already belongs to this table.
        // /sessions/start always creates a new UUID, so calling it on remount would
        // otherwise replace the customer's current session and its cart context.
        if (storedSession) {
          try {
            const existingRes = await api.get(`/sessions/${storedSession}`, { signal: abortController.signal });
            if (!isActive || timedOut) return;
            const existingSession = existingRes.data.session;
            const existingTable = existingSession?.table?.tableNumber
              ? parseTableDisplay(existingSession.table.tableNumber)
              : '';

            if (existingSession?.status === 'ACTIVE' && existingTable === newTableDisplay) {
              setSessionId(existingSession.id);
              const sessionDisplay = resolveTableLabel({
                tableLabel: existingSession.tableLabel,
                table: existingSession.table,
                routeToken: cleanRouteToken,
                forCustomer: true,
              });
              setTableId(sessionDisplay);
              localStorage.setItem('customer_sessionId', existingSession.id);
              localStorage.setItem('customer_tableId', sessionDisplay);
              localStorage.setItem('customer_tableToken', cleanRouteToken);
              setTableError('');

              if (checkIsCustomerLoggedIn()) {
                localStorage.setItem('customer_verifiedSessionId', existingSession.id);
                setIsSessionVerified(true);
              } else {
                const verifiedSessionId = localStorage.getItem('customer_verifiedSessionId');
                if (existingSession.customerId && verifiedSessionId === existingSession.id) {
                  setIsSessionVerified(true);
                } else if (!existingSession.customerId) {
                  setIsSessionVerified(false);
                }
              }

              fetchServerCart(existingSession.id);
              checkForExistingOrder(existingSession.id);
              return;
            }
          } catch (existingSessionError) {
            if (!isActive || timedOut) return;
            if (!([404, 410].includes(existingSessionError.response?.status))) {
              setTableConnectionRetryable(!existingSessionError.response || existingSessionError.response.status >= 500);
              setTableConnectionError(existingSessionError.response?.data?.error || 'The table service is temporarily unavailable.');
              return;
            }
            // A truly missing/expired stored session falls through to start from the scanned QR.
          }
        }

        // No active matching session exists; start one from the scanned signed token.
        try {
          const payload = { qrToken: cleanRouteToken };
          const idempotencyKey = getOrCreateIdempotencyKey('customer_session_start_attempt', payload);
          const res = await api.post('/sessions/start', payload, {
            signal: abortController.signal,
            headers: { 'Idempotency-Key': idempotencyKey },
          });
          clearIdempotencyKey('customer_session_start_attempt', idempotencyKey);
          if (!isActive || timedOut) return;

          if (res.data.session) {
            const s = res.data.session;
            setSessionId(s.id);
            localStorage.setItem('customer_sessionId', s.id);
            const tName = resolveTableLabel({ tableLabel: s.tableLabel, table: s.table, routeToken: cleanRouteToken, forCustomer: true });
            setTableId(tName);
            localStorage.setItem('customer_tableId', tName);
            localStorage.setItem('customer_tableToken', cleanRouteToken);
            setTableError('');

            const isUserLoggedIn = checkIsCustomerLoggedIn();

            if (isUserLoggedIn) {
              localStorage.setItem('customer_verifiedSessionId', s.id);
              setIsSessionVerified(true);
            } else {
              const verifiedSessionId = localStorage.getItem('customer_verifiedSessionId');
              if (s.customerId && verifiedSessionId === s.id) {
                setIsSessionVerified(true);
              } else if (!s.customerId) {
                setIsSessionVerified(false);
              }
            }

            fetchServerCart(s.id);
            checkForExistingOrder(s.id);
          }
        } catch (err) {
          if (!isActive || timedOut) return;
          console.warn('Session start error:', err.response?.data?.error || err.message);
          const invalidQr = err.response?.data?.code === 'TABLE_QR_REQUIRED'
            || ((err.response?.status === 400 || err.response?.status === 401)
              && /invalid|expired|token|qr code/i.test(err.response?.data?.error || err.response?.data?.message || ''));
          if (invalidQr) {
            setTableConnectionRetryable(false);
            setTableConnectionError('This table link is no longer valid. Copy the current table link from Admin and try again.');
          } else {
            setTableConnectionRetryable(!err.response || err.response.status >= 500);
            setTableConnectionError(err.response?.data?.error || (err.response?.status === 403
              ? 'This table is currently unavailable.'
              : 'The table service is temporarily unavailable.'));
          }
        }
      } else {
        // A bare /customer URL may restore only an existing, active physical-table
        // session. A remembered label or old token is not enough to create a session.
        if (!storedSession) {
          const restored = await restoreFromPendingScannedQr();
          if (!restored) {
            if (restoreToken) {
              setTableConnectionError('The table service is temporarily unavailable.');
              return;
            }
            const protectedCustomer = checkIsCustomerLoggedIn()
              || Object.values(cart).some((item) => Number(item?.quantity) > 0)
              || (() => { try { return (JSON.parse(localStorage.getItem('customer_active_orders_cache') || '{}').activeOrders || []).some((order) => ['PENDING', 'PAID', 'PREPARING', 'READY'].includes(order.status)); } catch { return false; } })();
            setTableId('');
            if (!protectedCustomer) {
              ['customer_tableToken', 'customer_tableId', 'customer_cart', 'customer_checkoutStep'].forEach((key) => { localStorage.removeItem(key); sessionStorage.removeItem(key); });
              setCart({});
              setRequiresTableQr(true);
            } else {
              setTableConnectionError('Reconnect to your table to continue your saved session.');
            }
          }
        } else {
          try {
            const checkRes = await api.get(`/sessions/${storedSession}`, { signal: abortController.signal });
            if (!isActive || timedOut) return;
            if (checkRes.data.session && checkRes.data.session.status === 'ACTIVE' && checkRes.data.session.tableId && checkRes.data.session.table?.isActive) {
              const activeSession = checkRes.data.session;
              const sessionDisplay = resolveTableLabel({
                tableLabel: activeSession.tableLabel,
                table: activeSession.table,
                forCustomer: true,
              });
              if (!sessionDisplay) throw new Error('The saved session has no physical table.');
              lastValidTableLabelRef.current = sessionDisplay;
              setRequiresTableQr(false);
              setSessionId(activeSession.id);
              setTableId(sessionDisplay);
              localStorage.setItem('customer_sessionId', activeSession.id);
              localStorage.setItem('customer_tableId', sessionDisplay);
              localStorage.setItem('customer_tableToken', storedTableToken || '');
              if (checkIsCustomerLoggedIn()) {
                localStorage.setItem('customer_verifiedSessionId', activeSession.id);
                setIsSessionVerified(true);
              } else if (localStorage.getItem('customer_verifiedSessionId') !== activeSession.id) {
                setIsSessionVerified(false);
              }
              fetchServerCart(storedSession);
              checkForExistingOrder(storedSession);
            } else {
              const expiredSession = new Error('Stored customer session has expired or no longer points to an active table.');
              expiredSession.code = 'SESSION_INVALID';
              throw expiredSession;
            }
          } catch (sessionError) {
            if (!isActive || timedOut) return;
            const sessionIsInvalid = sessionError.code === 'SESSION_INVALID' || [404, 410].includes(sessionError.response?.status);
            if (!sessionIsInvalid) {
              setTableConnectionRetryable(!sessionError.response || sessionError.response.status >= 500);
              setTableConnectionError(sessionError.response?.data?.error || 'The table service is temporarily unavailable.');
              return;
            }
            if (sessionError.code === 'SESSION_INVALID' && !hasProtectedCustomerState()) {
              setSessionExpired(true);
              setRequiresTableQr(false);
              return;
            }
            console.info('Customer must scan an active table QR:', sessionError.response?.data?.error || sessionError.message);
            const restored = await restoreFromPendingScannedQr();
            if (!restored) {
              const protectedCustomer = checkIsCustomerLoggedIn()
                || Object.values(cart).some((item) => Number(item?.quantity) > 0)
                || (() => { try { return (JSON.parse(localStorage.getItem('customer_active_orders_cache') || '{}').activeOrders || []).some((order) => ['PENDING', 'PAID', 'PREPARING', 'READY'].includes(order.status)); } catch { return false; } })();
              if (!protectedCustomer) {
                ['customer_sessionId', 'customer_verifiedSessionId', 'customer_tableToken', 'customer_tableId', 'customer_cart', 'customer_checkoutStep'].forEach((key) => { localStorage.removeItem(key); sessionStorage.removeItem(key); });
                setSessionId('');
                setTableId('');
                setCart({});
                setIsSessionVerified(false);
                setRequiresTableQr(true);
              } else {
                setTableConnectionError('Reconnect to your table to continue your saved session.');
              }
            }
          }
        }
      }
    };

    const initTimeout = window.setTimeout(() => {
      if (!isActive) return;
      timedOut = true;
      abortController.abort();
      setTableConnectionError('The table service did not respond. Check your connection and retry.');
      setSessionInitializationDone(true);
    }, 8000);
    initSession().finally(() => {
      window.clearTimeout(initTimeout);
      if (isActive && !timedOut) setSessionInitializationDone(true);
    });
    return () => { isActive = false; abortController.abort(); window.clearTimeout(initTimeout); };
  // Session restoration checks are intentionally kept together to preserve the existing login/session flow.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableIdFromRoute, sessionRetryAttempt]);

  // Retry connection failures with a bounded 2s / 5s / 10s backoff while the screen remains visible.
  useEffect(() => {
    if (!tableConnectionError || !tableConnectionRetryable || requiresTableQr) return undefined;
    const delays = [2000, 5000, 10000];
    const timer = window.setTimeout(() => {
      setTableConnectionError('');
      setSessionRetryAttempt((attempt) => attempt + 1);
    }, delays[Math.min(sessionRetryAttempt, delays.length - 1)]);
    return () => window.clearTimeout(timer);
  }, [tableConnectionError, tableConnectionRetryable, requiresTableQr, sessionRetryAttempt]);

  useEffect(() => {
    if (!sessionInitializationDone || requiresTableQr) return;

    try {
      const currentUrl = new URL(window.location.href);
      const code = currentUrl.searchParams.get('otp') || '';
      const email = currentUrl.searchParams.get('e') || '';
      const hasOtpLink = currentUrl.searchParams.has('otp') || currentUrl.searchParams.has('e');

      if (hasOtpLink && !isSessionVerified && /^\d{6}$/.test(code) && isValidCustomerEmail(email)) {
        const cleanEmail = email.trim();
        const sentAt = Date.now();
        setAuthEmail(cleanEmail);
        setOtpCode('');
        setOtpSent(true);
        setOtpSentAt(sentAt);
        setResendAvailableAt(0);
        setCooldown(0);
        setOtpError('');
        setOtpSuccess('');
        setOtpPrefillCode(code);
        emailLinkClipboardCodeRef.current = code;
        savePendingLogin({
          name: authName || pendingLoginOnMount?.name || '',
          email: cleanEmail,
          otpSentAt: sentAt,
          resendAvailableAt: 0,
          sessionId: getOtpLinkContext()?.sessionId || pendingLoginOnMount?.sessionId || undefined,
        });
      }
    } catch {
      // A malformed URL or unavailable browser API should leave the email form usable.
    } finally {
      try {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete('otp');
        cleanUrl.searchParams.delete('e');
        cleanUrl.searchParams.delete('sid');
        const cleanAddress = `${cleanUrl.pathname}${cleanUrl.search ? `?${cleanUrl.searchParams.toString()}` : ''}${cleanUrl.hash}`;
        window.history.replaceState(window.history.state, '', cleanAddress);
      } catch {
        try { window.history.replaceState(window.history.state, '', window.location.pathname); } catch { /* Ignore unavailable history APIs. */ }
      }
    }
  }, [sessionInitializationDone, requiresTableQr, isSessionVerified, authName, pendingLoginOnMount]);

  // ─── Session Expiry Check (every 30 seconds) ────────────────────────────
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    if (!sessionId || sessionExpired) return;

    const checkSessionHealth = async () => {
      try {
        const res = await api.get(`/sessions/${sessionId}`);
        if (res.data.session?.status === 'EXPIRED' || res.data.session?.status === 'CANCELLED') {
          setSessionExpired(true);
        }
      } catch (err) {
        if (err.response?.status === 404) {
          setSessionExpired(true);
        }
      }
    };

    const interval = setInterval(checkSessionHealth, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  // The protection predicate reads the latest local auth/cart/order state; restarting this interval on each update is unnecessary.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, sessionExpired, cart, activeOrders]);

  const handleTransferTableAndOrders = async () => {
    const curSessionId = sessionId || localStorage.getItem('customer_sessionId');
    if (!curSessionId || !pendingTableToken) return;
    setTransferLoading(true);
    try {
      const res = await api.post('/sessions/transfer-table', {
        sessionId: curSessionId,
        qrToken: pendingTableToken,
        targetTableNumber: pendingTableNumber,
      });

      if (res.data) {
        const newTableDisplay = res.data.newTable || pendingTableNumber;
        // Update local state and storage with the new table info
        setTableId(newTableDisplay);
        localStorage.setItem('customer_tableId', newTableDisplay);
        localStorage.setItem('customer_tableToken', pendingTableToken);

        // Refresh active orders list
        refetchActiveOrders();

        // Re-sync cart from server to reflect updated session table context
        fetchServerCart(curSessionId);

        setShowTableSwitchModal(false);
        setPendingTableToken(null);
        setPendingTableNumber('');
        setCurrentTableSnapshot('');
        const hasOrders = activeOrders.length > 0;
        const hasCart = totalCartQuantity > 0;
        const msg = hasOrders
          ? `Orders successfully shifted to ${newTableDisplay}! Kitchen and staff notified.`
          : hasCart
            ? `Your cart has been moved to ${newTableDisplay}. Continue ordering!`
            : `Session moved to ${newTableDisplay}. Welcome!`;
        setTransferSuccessMessage(msg);
        setTimeout(() => setTransferSuccessMessage(''), 6000);
        navigate('/customer', { replace: true });
      }
    } catch (err) {
      console.error('Transfer table error:', err);
      setTableError(err.response?.data?.error || 'Failed to transfer table.');
      setShowTableSwitchModal(false);
    } finally {
      setTransferLoading(false);
    }
  };

  const handleConfirmTableSwitch = async () => {
    if (transferLoading) return;
    setTransferLoading(true);
    if (!pendingTableToken) {
      setShowTableSwitchModal(false);
      setTransferLoading(false);
      return;
    }

    try {
      const payload = { qrToken: pendingTableToken };
      const idempotencyKey = getOrCreateIdempotencyKey('customer_session_switch_attempt', payload);
      const res = await api.post('/sessions/start', payload, {
        headers: { 'Idempotency-Key': idempotencyKey },
      });

      if (res.data.session) {
        clearIdempotencyKey('customer_session_switch_attempt', idempotencyKey);
        const s = res.data.session;
        const newSessionId = s.id;
        const newTableDisplay = resolveTableLabel({ tableLabel: s.tableLabel, table: s.table, routeToken: pendingTableToken, forCustomer: true });

        setSessionId(newSessionId);
        setTableId(newTableDisplay);
        localStorage.setItem('customer_sessionId', newSessionId);
        localStorage.setItem('customer_tableId', newTableDisplay);
        localStorage.setItem('customer_tableToken', pendingTableToken);

        const isUserLoggedIn = checkIsCustomerLoggedIn();

        if (isUserLoggedIn) {
          localStorage.setItem('customer_verifiedSessionId', newSessionId);
          setIsSessionVerified(true);
        } else {
          localStorage.removeItem('customer_verifiedSessionId');
          setIsSessionVerified(false);
        }

        clearPendingLogin();
        setOtpSent(false);
        setOtpCode('');

        setCart({});
        localStorage.removeItem('customer_cart');
        setTableError('');
        setPendingTableToken(null);
        setPendingTableNumber('');
        setCurrentTableSnapshot('');

        fetchServerCart(newSessionId);
        checkForExistingOrder(newSessionId);
        setShowTableSwitchModal(false);
        navigate('/customer', { replace: true });
      }
    } catch (err) {
      console.error('Table switch confirmation error:', err);
      setTableError(err.response?.data?.error || 'Failed to switch tables.');
      setShowTableSwitchModal(false);
    } finally {
      setTransferLoading(false);
    }
  };

  const handleCancelTableSwitch = () => {
    setShowTableSwitchModal(false);
    setPendingTableToken(null);
    setPendingTableNumber('');
    setCurrentTableSnapshot('');
    const storedTable = localStorage.getItem('customer_tableId');
    if (storedTable) {
      setTableId(parseTableDisplay(storedTable));
    }
    navigate('/customer', { replace: true });
  };

  // Change delivery table for a specific already-placed order (no QR scan needed)
  const handleDeliveryTableChange = async (orderId, newTableNumber) => {
    if (!newTableNumber || !orderId) return;
    setDeliveryChangeLoading(true);
    try {
      const res = await api.put(`/orders/${orderId}/transfer-table`, {
        targetTableNumber: newTableNumber,
      });
      if (res.data?.order) {
        refetchActiveOrders();
        setTransferSuccessMessage(`🍽️ Order delivery rerouted to ${newTableNumber}! Kitchen & cashier notified.`);
        setTimeout(() => setTransferSuccessMessage(''), 6000);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to change delivery table.');
      setTimeout(() => setError(''), 4000);
    } finally {
      setDeliveryChangeLoading(false);
      setDeliveryChangeOrderId(null);
      setDeliveryChangePicking(false);
      setDeliveryChangeTarget('');
    }
  };

  const fetchServerCart = async (sId) => {
    if (!sId) return;
    try {
      const res = await api.get(`/cart/${sId}`);
      if (res.data.cart?.items) {
        const mapped = {};
        res.data.cart.items.forEach((i) => {
          mapped[i.menuItemId] = {
            id: i.menuItemId,
            name: i.name,
            price: i.price,
            quantity: i.quantity,
            description: i.description,
            category: i.category,
            stock: i.stock,
            unit: i.unit || i.menuItem?.unit || '',
            imageUrl: i.imageUrl || i.menuItem?.imageUrl,
          };
        });
        setCart(mapped);
      }
    } catch (e) {
      if (e.response?.status === 403) {
        if (!hasProtectedCustomerState()) setSessionExpired(true);
        else setTableConnectionError('Your saved table session needs to reconnect.');
        return;
      }
      console.warn('Could not sync server cart:', e.message);
    }
  };

  // ─── OTP Handlers ────────────────────────────────────────────────────────
  const STUDENT_EMAIL_REGEX = /^[0-9]{2}[a-zA-Z]{2,3}-[0-9]{1,4}-[a-zA-Z]{2,5}@students\.uitu\.edu\.pk$/i;

  const handleSendOtp = async (e) => {
    if (e) e.preventDefault();
    if (otpLoading || cooldown > 0) return;
    const cleanName = (authName || '').trim();
    const cleanEmail = (authEmail || '').trim();
    if (!cleanName) {
      setOtpError('Please enter your full name.');
      return;
    }
    if (!cleanEmail) {
      setOtpError('Please enter your UIT student email address.');
      return;
    }
    if (!STUDENT_EMAIL_REGEX.test(cleanEmail)) {
      setOtpError('Enter a valid UIT student email address.');
      return;
    }
    setOtpError('');
    setOtpSuccess('');
    setOtpLoading(true);

    try {
      const curSessionId = sessionId || localStorage.getItem('customer_sessionId');
      const res = await api.post('/auth/send-otp', {
        email: cleanEmail,
        name: cleanName,
        sessionId: curSessionId || undefined,
      });

      if (res.data.success) {
        const sentAt = Date.now();
        const resendAt = sentAt + 60 * 1000;
        setOtpSent(true);
        setOtpSentAt(sentAt);
        setResendAvailableAt(resendAt);
        setOtpSuccess('Code sent. Check your inbox and spam folder.');
        setCooldown(60);
        savePendingLogin({ name: authName, email: cleanEmail, otpSentAt: sentAt, resendAvailableAt: resendAt });
      }
    } catch (err) {
      setOtpError(err.response?.data?.error || 'Failed to send OTP code.');
      if (err.response?.status === 429) {
        const responseData = err.response?.data || {};
        const messageDelay = String(responseData.error || '').match(/(\d+)\s*seconds?/i);
        const retryDelay = Number(responseData.retryAfterSeconds || messageDelay?.[1] || 30);
        const retryAt = Date.now() + Math.max(1, retryDelay) * 1000;
        setResendAvailableAt(retryAt);
        setCooldown(Math.max(1, retryDelay));
        if (otpSent && otpSentAt) {
          savePendingLogin({ name: authName, email: cleanEmail, otpSentAt, resendAvailableAt: retryAt });
        }
      }
    } finally {
      setOtpLoading(false);
    }
  };

  const handleOpenGmail = () => {
    persistCurrentPendingLogin();
    const cleanEmail = (authEmail || '').trim();
    const mobileWebUrl = 'https://mail.google.com/mail/u/0/';
    const userAgent = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/i.test(userAgent);

    if (isAndroid) {
      // Some Xiaomi and other in-app browsers block Android intents. The Gmail app also cannot be forced to a particular account.
      const intentUrl = `intent://#Intent;package=com.google.android.gm;category=android.intent.category.LAUNCHER;launchFlags=0x10000000;S.browser_fallback_url=${encodeURIComponent(mobileWebUrl)};end`;
      window.location.href = intentUrl;
      return;
    }

    if (isIOS) {
      let fallbackTimer;
      const cancelFallback = () => {
        if (fallbackTimer) window.clearTimeout(fallbackTimer);
        document.removeEventListener('visibilitychange', cancelWhenHidden);
        window.removeEventListener('pagehide', cancelFallback);
      };
      const cancelWhenHidden = () => {
        if (document.visibilityState === 'hidden') cancelFallback();
      };
      document.addEventListener('visibilitychange', cancelWhenHidden);
      window.addEventListener('pagehide', cancelFallback, { once: true });
      window.location.href = 'googlegmail://';
      fallbackTimer = window.setTimeout(() => {
        cancelFallback();
        if (document.visibilityState === 'visible') window.location.href = mobileWebUrl;
      }, 900);
      return;
    }

    // The Gmail app cannot be forced to a particular account; the web URL opens Gmail's account chooser.
    const mailWindow = window.open(mobileWebUrl, '_blank', 'noopener');
    if (!mailWindow) window.location.href = `mailto:${cleanEmail}`;
  };

  const handleVerifyOtp = async (e) => {
    if (e) e.preventDefault();
    if (!(authName || '').trim()) {
      setOtpError('Please enter your full name before continuing.');
      return;
    }
    if (!otpCode || otpCode.trim().length < 4) {
      setOtpError('Please enter the 6-digit verification code.');
      return;
    }
    setOtpError('');
    setOtpSuccess('');
    setOtpLoading(true);

    try {
      const curSessionId = sessionId || localStorage.getItem('customer_sessionId');
      const cleanEmail = (authEmail || '').trim();
      const res = await api.post('/auth/verify-otp', {
        email: cleanEmail,
        name: authName.trim(),
        otp: otpCode.trim(),
        sessionId: curSessionId || undefined,
      });

      if (res.data.success) {
        clearPendingLogin();
        const { user: verifiedUser, accessToken, refreshToken } = res.data;
        setActiveAuthTokens(accessToken, refreshToken);
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem('user', JSON.stringify(verifiedUser));
        }
        localStorage.setItem('customer_user', JSON.stringify(verifiedUser));
        localStorage.setItem('user', JSON.stringify(verifiedUser));
        if (curSessionId) {
          localStorage.setItem('customer_verifiedSessionId', curSessionId);
        }

        // Immediately authenticate real-time socket and join session room
        connectSocket(verifiedUser);
        const sock = getSocket();
        if (curSessionId && sock) {
          sock.emit('join:session', curSessionId);
        }

        setIsSessionVerified(true);
        setOtpError('');
        setOtpSuccess('Verified successfully! Loading menu...');
        fetchServerCart(curSessionId);
        checkForExistingOrder(curSessionId);
      }
    } catch (err) {
      setOtpError(err.response?.data?.error || 'Invalid or expired verification code.');
    } finally {
      setOtpLoading(false);
    }
  };

  // ─── Image helper ─────────────────────────────────────────────────────────
  const getItemImage = (item) => {
    if (item?.imageUrl && typeof item.imageUrl === 'string' && item.imageUrl.trim() !== '') {
      const url = item.imageUrl.trim();
      if (url.startsWith('/uploads/')) {

        return `${resolveBackendUrl()}${url}`;
      }
      return url;
    }
    const name = (item?.name || '').toLowerCase();
    const cat = (item?.category || '').toLowerCase();
    if (name.includes('biryani') || name.includes('rice') || name.includes('pulao'))
      return 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=700&auto=format&fit=crop&q=80';
    if (name.includes('burger') || name.includes('zinger') || name.includes('patty'))
      return 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=700&auto=format&fit=crop&q=80';
    if (name.includes('pizza') || name.includes('calzone'))
      return 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=700&auto=format&fit=crop&q=80';
    if (name.includes('sandwich') || name.includes('club'))
      return 'https://images.unsplash.com/photo-1509722747041-616f39b57569?w=700&auto=format&fit=crop&q=80';
    if (name.includes('fries') || name.includes('chips'))
      return 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=700&auto=format&fit=crop&q=80';
    if (name.includes('cake') || name.includes('brownie') || name.includes('chocolate') || name.includes('dessert'))
      return 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=700&auto=format&fit=crop&q=80';
    if (name.includes('tea') || name.includes('chai') || name.includes('coffee') || name.includes('coke') || name.includes('drink') || cat.includes('beverage'))
      return 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=700&auto=format&fit=crop&q=80';
    if (name.includes('naan') || name.includes('bread') || name.includes('roti') || name.includes('paratha') || name.includes('chapati'))
      return 'https://images.unsplash.com/photo-1626074353765-517a681e40be?w=700&auto=format&fit=crop&q=80';
    return 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=700&auto=format&fit=crop&q=80';
  };

  const [checkoutStep] = useState(
    () => localStorage.getItem('customer_checkoutStep') || 'menu'
  );

  useEffect(() => { localStorage.setItem('customer_cart', JSON.stringify(cart)); }, [cart]);
  useEffect(() => {
    localStorage.setItem('customer_tableId', tableId);
    if (tableId && tableId !== 'Counter') {
      lastValidTableLabelRef.current = tableId;
    }
  }, [tableId]);
  useEffect(() => { localStorage.setItem('customer_category', category); }, [category]);
  useEffect(() => { localStorage.setItem('customer_checkoutStep', checkoutStep); }, [checkoutStep]);

  // Refresh on picker open so deleted/deactivated tables never remain selectable.
  const refreshAvailableTables = async () => {
    setAvailableTablesLoading(true);
    try {
      const response = await api.get('/tables/active');
      const activeTables = response.data?.tables || [];
      setAvailableTables(activeTables);
      setDeliveryChangeTarget((current) => (
        !current || activeTables.some((table) => table.tableNumber === current) ? current : ''
      ));
    } catch (error) {
      console.error('Failed to refresh active tables:', error);
      setAvailableTables([]);
      setDeliveryChangeTarget('');
    } finally {
      setAvailableTablesLoading(false);
    }
  };

  const checkForExistingOrder = () => {
    refetchActiveOrders();
  };

  const handleDismissFailedOrders = () => {
    for (const fo of failedOrders) {
      dismissFailedOrder(fo.id);
      api.put(`/orders/${fo.id}/status`, { status: 'CANCELLED', note: 'Customer dismissed failed payment' }).catch(() => { });
    }
  };

  // ─── Cart handlers (syncs with backend session cart) ──────────────────────




  // Add a specific variant with its per-variant quantity to cart.
  // Same variant (same menuItemId) is MERGED (qty accumulates).
  // Different variants (different menuItemId) remain SEPARATE cart lines.
  const handleAddWithVariantAndQty = async (item) => {
    const variantQty = pendingQty[item.id] || 1;
    // Optimistically update cart: merge if same variant already exists
    let finalQty = variantQty;
    setCart((prev) => {
      const existing = prev[item.id];
      finalQty = (existing?.quantity || 0) + variantQty;
      return {
        ...prev,
        [item.id]: {
          ...item,
          quantity: finalQty,
          // Preserve unit so cart page can display variant label
          unit: item.unit || '',
        },
      };
    });

    // Close expanded panel immediately so UI response feels instant
    setExpandedGroup(null);
    setPendingQty((prev) => ({ ...prev, [item.id]: 1 }));

    if (sessionId) {
      try {
        await api.post(`/cart/${sessionId}/items`, {
          menuItemId: item.id,
          quantity: finalQty,
        });
      } catch (err) {
        if (err.response?.status === 403) {
          if (!hasProtectedCustomerState()) setSessionExpired(true);
          else setTableConnectionError('Your saved table session needs to reconnect.');
          return;
        }
        console.warn('Backend cart add warning:', err.message);
      }
    }
  };

  const animateCartFlight = (sourceElement) => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const cartTarget = document.querySelector('.customer-header__cart');
    if (!cartTarget || !sourceElement) return;

    const sourceRect = sourceElement.getBoundingClientRect();
    const targetRect = cartTarget.getBoundingClientRect();
    const startX = sourceRect.left + sourceRect.width / 2;
    const startY = sourceRect.top + sourceRect.height / 2;
    const deltaX = targetRect.left + targetRect.width / 2 - startX;
    const deltaY = targetRect.top + targetRect.height / 2 - startY;
    const dot = document.createElement('span');

    dot.className = 'customer-fly-dot';
    dot.style.left = `${startX}px`;
    dot.style.top = `${startY}px`;
    dot.style.setProperty('--fly-mid-x', `${deltaX * 0.55}px`);
    dot.style.setProperty('--fly-mid-y', `${deltaY * 0.55 - 64}px`);
    dot.style.setProperty('--fly-end-x', `${deltaX}px`);
    dot.style.setProperty('--fly-end-y', `${deltaY}px`);
    dot.addEventListener('animationend', () => dot.remove(), { once: true });
    document.body.appendChild(dot);
  };

  const totalCartQuantity = Object.values(cart).reduce((sum, item) => sum + item.quantity, 0);
  const totalCartPrice = Object.values(cart).reduce((sum, item) => sum + (item.price * item.quantity), 0);

  // Dynamic Categories: Only show categories that ACTUALLY contain active items in the menu (plus 'All')
  const combinedCategories = useMemo(() => {
    const presentCats = new Set();
    menu.forEach((i) => {
      if (i.category && i.isAvailable !== false && i.isActive !== false) {
        presentCats.add(i.category);
      }
    });
    return ['All', ...Array.from(presentCats)];
  }, [menu]);

  // Filtering
  const filteredMenu = menu.filter((item) => {
    const matchesCategory = category === 'All' || item.category === category;
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  // Group items by groupName or name so multi-portion dishes (like Biryani 250g/500g) render as 1 card
  const filteredGrouped = useMemo(() => {
    const groups = {};
    filteredMenu.forEach((item) => {
      const key = item.groupName || item.name;
      if (!groups[key]) groups[key] = { groupKey: key, variants: [] };
      groups[key].variants.push(item);
    });
    return Object.values(groups);
  }, [filteredMenu]);

  // ─── Promotional Carousel ────────────────────────────────────────────────
  const promoSlides = useMemo(() => [
    {
      eyebrow: "TODAY'S OFFERS",
      headline: 'Special deals',
      sub: 'Chef-picked favorites and seasonal offers.',
      style: 'special',
      eyebrowIcon: Tag,
      visualIcon: Tag,
      chipIcon: Tag,
      chipLabel: 'Fresh offers',
    },
    {
      eyebrow: 'FAST SERVICE',
      headline: 'Ready in no time',
      sub: 'Order from your table and track it live.',
      style: 'fast',
      eyebrowIcon: Clock3,
      visualIcon: Clock3,
      chipIcon: Clock3,
      chipLabel: 'Live tracking',
    },
    {
      eyebrow: 'SMART DINING',
      headline: 'Scan. Order. Enjoy.',
      sub: 'Browse and order right from your table.',
      style: 'smart',
      eyebrowIcon: QrCode,
      visualIcon: QrCode,
      chipIcon: QrCode,
      chipLabel: 'Table ordering',
    },
  ], []);
  const promoRenderSlides = useMemo(() => [
    { slide: promoSlides[promoSlides.length - 1], position: 0, realIndex: promoSlides.length - 1, isClone: true },
    ...promoSlides.map((slide, index) => ({ slide, position: index + 1, realIndex: index, isClone: false })),
    { slide: promoSlides[0], position: promoSlides.length + 1, realIndex: 0, isClone: true },
  ], [promoSlides]);

  const [promoIndex, setPromoIndex] = useState(0);
  const promoTimerRef = React.useRef(null);
  const promoSettleTimerRef = React.useRef(null);
  const promoScrollRef = React.useRef(null);
  const promoPauseReasonsRef = React.useRef({});
  const promoDragRef = React.useRef(null);
  const promoIndexRef = React.useRef(0);
  const promoJumpingRef = React.useRef(false);

  const clearPromoTimer = useCallback(() => {
    if (promoTimerRef.current) window.clearTimeout(promoTimerRef.current);
    promoTimerRef.current = null;
  }, []);

  const scrollPromoToPosition = useCallback((position, behavior = 'smooth') => {
    const viewport = promoScrollRef.current;
    const slide = viewport?.querySelector(`[data-promo-position="${position}"]`);
    if (!viewport || !slide) return;
    const viewportRect = viewport.getBoundingClientRect();
    const slideRect = slide.getBoundingClientRect();
    const left = viewport.scrollLeft + slideRect.left - viewportRect.left
      - (viewport.clientWidth - slideRect.width) / 2;
    viewport.scrollTo({ left: Math.max(0, left), behavior });
  }, []);

  const scrollPromoToIndex = useCallback((idx, behavior = 'smooth') => {
    const length = promoSlides.length;
    const current = promoIndexRef.current;
    const target = (idx + length) % length;
    let position = target + 1;
    if (current === length - 1 && target === 0) position = length + 1;
    else if (current === 0 && target === length - 1) position = 0;
    scrollPromoToPosition(position, behavior);
  }, [promoSlides.length, scrollPromoToPosition]);

  const schedulePromoAutoplay = useCallback((delay = 5000) => {
    clearPromoTimer();
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      || document.visibilityState === 'hidden'
      || Object.values(promoPauseReasonsRef.current).some(Boolean)) {
      return;
    }
    promoTimerRef.current = window.setTimeout(() => {
      const nextIndex = (promoIndexRef.current + 1) % promoSlides.length;
      scrollPromoToIndex(nextIndex);
    }, delay);
  }, [clearPromoTimer, promoSlides.length, scrollPromoToIndex]);

  const setPromoPauseReason = useCallback((reason, paused, resumeDelay = 4000) => {
    promoPauseReasonsRef.current[reason] = paused;
    if (paused) clearPromoTimer();
    else schedulePromoAutoplay(resumeDelay);
  }, [clearPromoTimer, schedulePromoAutoplay]);

  const settlePromoScroll = useCallback(() => {
    const viewport = promoScrollRef.current;
    if (!viewport || promoJumpingRef.current) return;
    const slides = [...viewport.querySelectorAll('[data-promo-position]')];
    if (!slides.length) return;
    const viewportCenter = viewport.getBoundingClientRect().left + viewport.clientWidth / 2;
    const nearestSlide = slides.reduce((nearest, slide) => {
      const rect = slide.getBoundingClientRect();
      const nearestRect = nearest.getBoundingClientRect();
      return Math.abs(rect.left + rect.width / 2 - viewportCenter)
        < Math.abs(nearestRect.left + nearestRect.width / 2 - viewportCenter) ? slide : nearest;
    }, slides[0]);
    const position = Number(nearestSlide.dataset.promoPosition);
    let realIndex = Math.min(Math.max(position - 1, 0), promoSlides.length - 1);
    let jumpTo = null;
    if (position === 0) {
      realIndex = promoSlides.length - 1;
      jumpTo = promoSlides.length;
    } else if (position === promoSlides.length + 1) {
      realIndex = 0;
      jumpTo = 1;
    }

    promoIndexRef.current = realIndex;
    setPromoIndex((current) => current === realIndex ? current : realIndex);

    if (jumpTo !== null) {
      promoJumpingRef.current = true;
      viewport.style.scrollSnapType = 'none';
      viewport.style.scrollBehavior = 'auto';
      scrollPromoToPosition(jumpTo, 'auto');
      window.requestAnimationFrame(() => {
        viewport.style.removeProperty('scroll-snap-type');
        viewport.style.removeProperty('scroll-behavior');
        promoJumpingRef.current = false;
        schedulePromoAutoplay(5000);
      });
      return;
    }
    schedulePromoAutoplay(5000);
  }, [promoSlides.length, schedulePromoAutoplay, scrollPromoToPosition]);

  const pauseAutoplay = useCallback(() => setPromoPauseReason('hover', true), [setPromoPauseReason]);
  const startAutoplay = useCallback(() => setPromoPauseReason('hover', false), [setPromoPauseReason]);

  useEffect(() => {
    const viewport = promoScrollRef.current;
    if (!viewport) return undefined;
    const alignCurrentSlide = () => scrollPromoToPosition(promoIndexRef.current + 1, 'auto');
    const resizeObserver = new ResizeObserver(alignCurrentSlide);
    resizeObserver.observe(viewport);
    window.requestAnimationFrame(alignCurrentSlide);
    const handleScrollEnd = () => {
      if (promoSettleTimerRef.current) window.clearTimeout(promoSettleTimerRef.current);
      promoSettleTimerRef.current = null;
      settlePromoScroll();
    };
    viewport.addEventListener('scrollend', handleScrollEnd);

    const motionPreference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const updateAutoplay = () => {
      if (motionPreference?.matches) clearPromoTimer();
      else schedulePromoAutoplay(5000);
    };
    const handleVisibilityChange = () => setPromoPauseReason('hidden', document.visibilityState === 'hidden');

    updateAutoplay();
    motionPreference?.addEventListener?.('change', updateAutoplay);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      motionPreference?.removeEventListener?.('change', updateAutoplay);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      viewport.removeEventListener('scrollend', handleScrollEnd);
      resizeObserver.disconnect();
      clearPromoTimer();
      if (promoSettleTimerRef.current) window.clearTimeout(promoSettleTimerRef.current);
    };
  }, [clearPromoTimer, schedulePromoAutoplay, scrollPromoToPosition, setPromoPauseReason, settlePromoScroll]);

  const goToSlide = useCallback((idx) => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    scrollPromoToIndex(idx, reduceMotion ? 'auto' : 'smooth');
  }, [scrollPromoToIndex]);

  const handleTouchStart = (e) => {
    setPromoPauseReason('touch', true);
    if (e.currentTarget.setPointerCapture && e.pointerId !== undefined) {
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* Native touch scrolling remains available. */ }
    }
  };

  const handleTouchEnd = () => {
    setPromoPauseReason('touch', false, 4000);
  };

  const handlePromoScroll = (event) => {
    const viewport = event.currentTarget;
    if (promoJumpingRef.current) return;
    const viewportCenter = viewport.getBoundingClientRect().left + viewport.clientWidth / 2;
    const slides = [...viewport.querySelectorAll('[data-promo-position]')];
    const nearestSlide = slides.reduce((nearest, slide) => {
      const rect = slide.getBoundingClientRect();
      const nearestRect = nearest.getBoundingClientRect();
      return Math.abs(rect.left + rect.width / 2 - viewportCenter)
        < Math.abs(nearestRect.left + nearestRect.width / 2 - viewportCenter) ? slide : nearest;
    }, slides[0]);
    if (!nearestSlide) return;
    const position = Number(nearestSlide.dataset.promoPosition);
    const nearestIndex = position === 0
      ? promoSlides.length - 1
      : position === promoSlides.length + 1 ? 0 : position - 1;
    promoIndexRef.current = nearestIndex;
    setPromoIndex((current) => current === nearestIndex ? current : nearestIndex);
    if (promoSettleTimerRef.current) window.clearTimeout(promoSettleTimerRef.current);
    promoSettleTimerRef.current = window.setTimeout(() => {
      promoSettleTimerRef.current = null;
      settlePromoScroll();
    }, 450);
  };

  const handlePromoWheel = () => {
    setPromoPauseReason('wheel', true);
    clearPromoTimer();
    promoTimerRef.current = window.setTimeout(() => {
      promoPauseReasonsRef.current.wheel = false;
      schedulePromoAutoplay(0);
    }, 4000);
  };

  const handlePromoPointerDown = (event) => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || event.target.closest('button')) return;
    const viewport = promoScrollRef.current;
    if (!viewport) return;
    promoDragRef.current = { pointerId: event.pointerId, x: event.clientX, left: viewport.scrollLeft, dragged: false };
    setPromoPauseReason('drag', true);
    viewport.setPointerCapture?.(event.pointerId);
  };

  const handlePromoPointerMove = (event) => {
    const drag = promoDragRef.current;
    const viewport = promoScrollRef.current;
    if (!drag || !viewport || drag.pointerId !== event.pointerId) return;
    const delta = event.clientX - drag.x;
    if (Math.abs(delta) > 4) drag.dragged = true;
    if (drag.dragged) {
      event.preventDefault();
      viewport.scrollLeft = drag.left - delta;
    }
  };

  const handlePromoPointerEnd = () => {
    if (!promoDragRef.current) return;
    promoDragRef.current = null;
    setPromoPauseReason('drag', false, 4000);
  };

  const handlePromoKeyDown = (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    if (event.target.closest('button')) return;
    event.preventDefault();
    goToSlide((promoIndexRef.current + (event.key === 'ArrowRight' ? 1 : -1) + promoSlides.length) % promoSlides.length);
    clearPromoTimer();
    schedulePromoAutoplay(4000);
  };

  // Category Bar Mouse Drag-to-Scroll & Wheel Scroll
  const categoryScrollRef = React.useRef(null);
  const categoryStickyRef = React.useRef(null);
  const categorySentinelRef = React.useRef(null);
  const [categoryCanScroll, setCategoryCanScroll] = useState(false);
  const isMouseDownRef = React.useRef(false);
  const startXRef = React.useRef(0);
  const scrollLeftRef = React.useRef(0);
  const isDraggingRef = React.useRef(false);

  const handleCategoryMouseDown = (e) => {
    isMouseDownRef.current = true;
    isDraggingRef.current = false;
    startXRef.current = e.pageX - (categoryScrollRef.current?.offsetLeft || 0);
    scrollLeftRef.current = categoryScrollRef.current?.scrollLeft || 0;
  };

  const handleCategoryMouseLeave = () => {
    isMouseDownRef.current = false;
  };

  const handleCategoryMouseUp = () => {
    isMouseDownRef.current = false;
  };

  const handleCategoryMouseMove = (e) => {
    if (!isMouseDownRef.current) return;
    e.preventDefault();
    const x = e.pageX - (categoryScrollRef.current?.offsetLeft || 0);
    const walk = (x - startXRef.current) * 1.8;
    if (Math.abs(walk) > 5) {
      isDraggingRef.current = true;
    }
    if (categoryScrollRef.current) {
      categoryScrollRef.current.scrollLeft = scrollLeftRef.current - walk;
    }
  };

  const handleCategoryWheel = useCallback((e) => {
    const row = categoryScrollRef.current;
    if (row && e.deltaY !== 0 && row.scrollWidth > row.clientWidth) {
      const canMoveInDirection = e.deltaY > 0
        ? row.scrollLeft + row.clientWidth < row.scrollWidth - 1
        : row.scrollLeft > 0;
      if (canMoveInDirection) {
        e.preventDefault();
        row.scrollLeft += e.deltaY;
      }
    }
  }, []);

  const updateCategoryOverflow = useCallback(() => {
    const row = categoryScrollRef.current;
    setCategoryCanScroll(Boolean(row && row.scrollWidth > row.clientWidth + 1));
  }, []);

  const scrollCategoriesBy = (direction) => {
    const row = categoryScrollRef.current;
    if (!row) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    row.scrollTo({ left: row.scrollLeft + direction * Math.max(180, row.clientWidth * 0.6), behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  useEffect(() => {
    const row = categoryScrollRef.current;
    if (!row) return undefined;
    updateCategoryOverflow();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateCategoryOverflow) : null;
    observer?.observe(row);
    row.addEventListener('scroll', updateCategoryOverflow, { passive: true });
    // Use a non-passive native listener because React delegates wheel events
    // through a passive listener in modern browsers.
    row.addEventListener('wheel', handleCategoryWheel, { passive: false });
    window.addEventListener('resize', updateCategoryOverflow, { passive: true });
    return () => {
      observer?.disconnect();
      row.removeEventListener('scroll', updateCategoryOverflow);
      row.removeEventListener('wheel', handleCategoryWheel);
      window.removeEventListener('resize', updateCategoryOverflow);
    };
  }, [combinedCategories.length, handleCategoryWheel, updateCategoryOverflow]);

  useEffect(() => {
    const sentinel = categorySentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === 'undefined') return undefined;

    const observer = new IntersectionObserver(([entry]) => {
      categoryStickyRef.current?.classList.toggle('is-stuck', !entry.isIntersecting);
    }, {
      rootMargin: '-112px 0px 0px 0px',
      threshold: 0,
    });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const activeTab = categoryScrollRef.current?.querySelector('[role="tab"][aria-selected="true"]');
    const row = categoryScrollRef.current;
    if (!activeTab || !row) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const rowRect = row.getBoundingClientRect();
    const tabRect = activeTab.getBoundingClientRect();
    const targetLeft = row.scrollLeft + tabRect.left - rowRect.left - (row.clientWidth - tabRect.width) / 2;
    row.scrollTo({ left: Math.max(0, targetLeft), behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [category]);

  return (
    <div className={`responsive-shell customer-dashboard-shell min-h-screen bg-[#FAF9F7] dark:bg-[#121212] text-[#171717] dark:text-[#E5E5E5] flex flex-col font-sans selection:bg-[#F97316]/20${!isSessionVerified ? ' customer-dashboard-shell--auth' : ''}`}>
      {sessionExpired && (
        <ModalShell isOpen onClose={undefined} labelledBy="session-expired-title" closeOnBackdrop={false} closeOnEscape={false} className="customer-modal customer-modal--session">
          <div className="customer-modal__header">
            <span className="customer-modal__icon customer-modal__icon--warning"><AlertCircle aria-hidden="true" /></span>
            <div><h2 id="session-expired-title">Session Expired</h2><p>You were inactive for 10 minutes.</p></div>
          </div>
          <div className="customer-modal__body customer-session-expired__body">
            <p>Your dining session has expired due to inactivity. Please scan the QR code at your table to start a new session.</p>
            <div className="customer-modal__actions customer-session-expired__actions">
              <button
                type="button"
                onClick={() => {
                  setShowInAppScanner(true);
                }}
                className="customer-modal__button customer-modal__button--primary"
              >
                <QrCode aria-hidden="true" />
                Scan Table QR
              </button>

            </div>
          </div>
        </ModalShell>
      )}

      {/* ── Customer app header ─────────────────────────────────────────────── */}
      <header className="customer-header glass sticky top-0 z-30 safe-area-top">
        <div className="customer-header__main">
          <div className="customer-header__brand" aria-label="ZOVIKPOS Smart Dining">
            <img className="customer-header__mark" src="/assets/zovikpos-mark.svg" alt="" aria-hidden="true" />
            <span className="customer-header__brand-copy">
              <span className="customer-header__wordmark">ZOVIKPOS</span>
              <span className="customer-header__caption">Smart Dining</span>
            </span>
          </div>

          <nav
            className="customer-header__toolbar"
            aria-label="Customer actions"
            onPointerEnter={() => document.documentElement.classList.remove('customer-tooltip-dismissed')}
            onPointerLeave={() => document.documentElement.classList.remove('customer-tooltip-dismissed')}
            onBlurCapture={() => document.documentElement.classList.add('customer-tooltip-dismissed')}
          >
            {!isAppInstalled && (
              <button
                type="button"
                onClick={handleInstallClick}
                className="customer-header__action customer-header__install desktop-action icon-btn"
                aria-label="Install app"
                data-tooltip="Install App"
              >
                <Download aria-hidden="true" />
                {deferredInstallPrompt && <span className="customer-header__install-dot" aria-hidden="true" />}
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowInAppScanner(true)}
              className="customer-header__action icon-btn desktop-action"
              aria-label="Scan QR code"
              data-tooltip="Scan QR"
            >
              <QrCode aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => setTheme((curr) => (curr === 'dark' ? 'light' : 'dark'))}
              className="customer-header__action customer-header__theme icon-btn"
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              aria-pressed={theme === 'dark'}
              data-tooltip="Theme"
            >
              <span className="customer-header__theme-icon-stack" aria-hidden="true">
                <Sun className={`customer-header__theme-icon${theme === 'dark' ? ' is-active' : ''}`} />
                <Moon className={`customer-header__theme-icon${theme === 'light' ? ' is-active' : ''}`} />
              </span>
            </button>

            <button
              type="button"
              onClick={() => setShowFAQ(true)}
              className="customer-header__action desktop-action icon-btn"
              aria-label="Help and FAQ"
              data-tooltip="Help & FAQ"
            >
              <HelpCircle aria-hidden="true" />
            </button>

            {isSessionVerified && sessionInitializationDone && !requiresTableQr && (
              <button
                type="button"
                onClick={requestCustomerLogout}
                className="customer-header__action customer-header__signout desktop-action icon-btn"
                aria-label="Sign out"
                data-tooltip="Sign Out"
              >
                <LogOut aria-hidden="true" />
              </button>
            )}

            {isSessionVerified && sessionInitializationDone && !requiresTableQr && (
              <button
                type="button"
                onClick={handleOpenCustomerCart}
                className={`customer-header__action customer-header__cart icon-btn${totalCartQuantity > 0 ? ' has-items' : ''}`}
                aria-label={`Cart${totalCartQuantity > 0 ? `, ${totalCartQuantity} items` : ''}`}
                data-tooltip="Cart"
              >
                <span className="customer-header__cart-icon-wrap" aria-hidden="true">
                  <ShoppingBag />
                  {totalCartQuantity > 0 && (
                    <span
                      key={totalCartQuantity}
                      className={`customer-header__cart-count${totalCartQuantity < 10 ? ' is-single' : ''}`}
                    >
                      {totalCartQuantity > 99 ? '99+' : totalCartQuantity}
                    </span>
                  )}
                </span>
              </button>
            )}

            <button
              type="button"
              className="customer-header__action customer-header__more mobile-action icon-btn"
              id="customer-header-menu-trigger"
              popoverTarget="customer-header-menu"
              popoverTargetAction="toggle"
              aria-label="More actions"
              aria-expanded="false"
            >
              <MoreVertical aria-hidden="true" />
            </button>

            <div
              id="customer-header-menu"
              className="customer-header__popover"
              popover="auto"
              onToggle={(event) => {
                document.getElementById('customer-header-menu-trigger')?.setAttribute(
                  'aria-expanded',
                  String(event.currentTarget.matches(':popover-open')),
                )
              }}
            >
              {!isAppInstalled && (
                <button type="button" popoverTarget="customer-header-menu" popoverTargetAction="hide" onClick={handleInstallClick} className="customer-header__menu-row">
                  <Download aria-hidden="true" />
                  <span>Install App</span>
                  {deferredInstallPrompt && <span className="customer-header__install-dot" aria-hidden="true" />}
                </button>
              )}
              <button type="button" popoverTarget="customer-header-menu" popoverTargetAction="hide" onClick={() => setShowInAppScanner(true)} className="customer-header__menu-row">
                <QrCode aria-hidden="true" />
                <span>Scan QR</span>
              </button>
              <button type="button" popoverTarget="customer-header-menu" popoverTargetAction="hide" onClick={() => setShowFAQ(true)} className="customer-header__menu-row">
                <HelpCircle aria-hidden="true" />
                <span>Help & FAQ</span>
              </button>
              {isSessionVerified && (
                <button type="button" popoverTarget="customer-header-menu" popoverTargetAction="hide" onClick={requestCustomerLogout} className="customer-header__menu-row customer-header__menu-row--signout">
                  <LogOut aria-hidden="true" />
                  <span>Sign Out</span>
                </button>
              )}
            </div>
          </nav>
        </div>

        {sessionInitializationDone && !requiresTableQr && stableTableLabel && (
          <div className="customer-header__session" aria-label="Current dining session">
            <CustomerSessionTableChip label={stableTableLabel} />
            {(authName || guestName) && (
              <div className="customer-header__session-user">
                <span className="customer-header__avatar" aria-hidden="true">{(authName || guestName).trim().charAt(0).toUpperCase()}</span>
                <span className="customer-header__session-name" title={authName || guestName}>{authName || guestName}</span>
              </div>
            )}
            {(authName || guestName) && <span className="customer-header__scanned">Scanned {scanTime}</span>}
          </div>
        )}
      </header>

      {/* FAQ Modal */}
      {showFAQ && <FAQModal onClose={() => setShowFAQ(false)} />}

      {/* Table Switching Confirmation Modal */}
      {showTableSwitchModal && (
        <ModalShell isOpen onClose={undefined} labelledBy="table-switch-title" closeOnBackdrop={false} closeOnEscape={false} className="customer-modal customer-modal--switch">
          <div className="customer-modal__header">
            <span className="customer-modal__icon"><RotateCcw aria-hidden="true" /></span>
            <div><h2 id="table-switch-title">Switch to {pendingTableNumber}?</h2><p>You're currently at {currentTableSnapshot || stableTableLabel}.</p></div>
          </div>
          <div className="customer-modal__body">
              <p className="customer-modal__copy">
                {activeOrders.length > 0 ? (
                  <>
                    You scanned <strong>{pendingTableNumber}</strong>, but you have{' '}
                    <strong className="customer-modal__copy-success">{activeOrders.length} active order(s)</strong>{' '}
                    placed from <strong>{currentTableSnapshot || stableTableLabel}</strong>.
                    {totalCartQuantity > 0 && (
                      <> Your cart with <strong className="customer-modal__copy-warning">{totalCartQuantity} item(s)</strong> will also move.</>
                    )}
                    {' '}Do you want to transfer your current session &amp; active orders to <strong>{pendingTableNumber}</strong>, or start a fresh session?
                  </>
                ) : totalCartQuantity > 0 ? (
                  <>
                    You have <strong className="customer-modal__copy-warning">{totalCartQuantity} item(s)</strong> in your cart from{' '}
                    <strong>{currentTableSnapshot || stableTableLabel}</strong>. Transfer your session to{' '}
                    <strong>{pendingTableNumber}</strong> to keep your items!
                  </>
                ) : (
                  <>
                    Switch your active session from <strong>{currentTableSnapshot || stableTableLabel}</strong> to{' '}
                    <strong>{pendingTableNumber}</strong>.
                  </>
                )}
              </p>
            <div className="customer-modal__actions">
              {/* Primary Option 1: Move/Transfer current session & orders to new table */}
              {(activeOrders.length > 0 || totalCartQuantity > 0) && (
                <button
                  disabled={transferLoading}
                  onClick={handleTransferTableAndOrders}
                  className="customer-modal__button customer-modal__button--primary customer-modal__button--transfer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span className="customer-modal__option-copy">
                    <strong>{transferLoading
                      ? 'Transferring...'
                      : activeOrders.length > 0
                        ? `Transfer Session & Orders to ${pendingTableNumber}`
                        : `Move Cart to ${pendingTableNumber}`}</strong>
                    <small>{activeOrders.length > 0
                      ? `Keep your active orders and cart with you at ${pendingTableNumber}.`
                      : `Move your current cart to ${pendingTableNumber}.`}</small>
                  </span>
                </button>
              )}

              {/* Primary Option 2: Start Fresh */}
              <button
                disabled={transferLoading}
                onClick={handleConfirmTableSwitch}
                className="customer-modal__button customer-modal__button--primary customer-modal__button--fresh"
              >
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
                <span className="customer-modal__option-copy">
                  <strong>{transferLoading
                    ? 'Switching...'
                    : totalCartQuantity > 0 || activeOrders.length > 0
                    ? `Start Fresh Session at ${pendingTableNumber}`
                    : `Switch to ${pendingTableNumber}`}</strong>
                  <small>Start a new session at this table.</small>
                </span>
              </button>

              {/* Cancel Option */}
              <button
                onClick={handleCancelTableSwitch}
                className="customer-modal__button customer-modal__button--secondary"
              >
                Cancel & Close
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <main className={`${isSessionVerified ? 'customer-cart-safe-space ' : ''}flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6 dark:text-[#E5E5E5]${!isSessionVerified ? ' customer-auth-main' : ''}`}>

        {!sessionInitializationDone ? (
          <section className="customer-table-gate" aria-live="polite">
            <span className="customer-table-gate__mark" aria-hidden="true"><QrCode /></span>
            <h1>Checking your table</h1>
            <p>Verifying the table QR code…</p>
          </section>
        ) : sessionExpired ? (
          <section className="customer-table-gate" aria-live="polite">
            <span className="customer-table-gate__mark" aria-hidden="true"><AlertCircle /></span>
            <h1>Session expired</h1>
            <p>Reconnect to your table using the scan option.</p>
          </section>
        ) : tableConnectionError ? (
          <section className="customer-table-gate" aria-labelledby="customer-server-error-title" role="alert">
            <span className="customer-table-gate__mark" aria-hidden="true"><AlertCircle /></span>
            <p className="customer-table-gate__eyebrow">{stableTableLabel || 'TABLE SERVICE'}</p>
            <h1 id="customer-server-error-title">Can't reach the server</h1>
            <p>{tableConnectionError}</p>
            <button
              type="button"
              className="customer-table-gate__button"
              onClick={() => {
                setSessionInitializationDone(false);
                setTableConnectionError('');
                setSessionRetryAttempt((attempt) => attempt + 1);
              }}
            >
              <RotateCcw aria-hidden="true" />
              <span>Retry</span>
            </button>
          </section>
        ) : requiresTableQr && !tableIdFromRoute ? (
          <section className="customer-table-gate" aria-labelledby="customer-table-gate-title">
            <span className="customer-table-gate__mark" aria-hidden="true"><QrCode /></span>
            <p className="customer-table-gate__eyebrow">TABLE ACCESS REQUIRED</p>
            <h1 id="customer-table-gate-title">Scan your table QR</h1>
            <p>{tableError || 'Scan the QR code attached to your table to view the menu and start ordering.'}</p>
            <button type="button" className="customer-table-gate__button" onClick={() => setShowInAppScanner(true)}>
              <QrCode aria-hidden="true" />
              <span>Scan table QR</span>
            </button>
            {tableIdFromRoute && (
              <button
                type="button"
                className="customer-table-gate__retry"
                onClick={() => {
                  setSessionInitializationDone(false);
                  setRequiresTableQr(false);
                  setTableError('');
                  setSessionRetryAttempt((attempt) => attempt + 1);
                }}
              >
                Retry this table QR
              </button>
            )}
          </section>
        ) : <>

        {/* Table QR Error */}
        {tableError && (
          <div className="p-4 bg-rose-50 border border-rose-200 text-rose-600 rounded-2xl text-xs font-semibold flex items-center space-x-2.5 shadow-sm">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{tableError}</span>
          </div>
        )}

        {/* System Error */}
        {error && !tableError && (
          <div className="p-4 bg-rose-50 border border-rose-200 text-rose-600 rounded-2xl text-xs font-semibold flex items-center space-x-2.5 shadow-sm">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ── EMAIL + OTP VERIFICATION VIEW (Required before ordering) ────────── */}
        {!isSessionVerified ? (
          <div className="customer-auth-card w-full max-w-[440px] mx-auto animate-fade-in">
            <section className={`customer-auth-panel${otpSent ? ' is-inactive' : ' is-active'}`} aria-hidden={otpSent} inert={Boolean(otpSent)}>
              <div className="customer-auth-heading">
                <p className="customer-auth-step-label">STEP 1 OF 2</p>
                <h2 className="customer-auth-title">Verify to place your order</h2>
                <p className="customer-auth-subtitle">Use your name and university email.</p>
              </div>
              <form onSubmit={handleSendOtp} className="customer-auth-email-form text-left">
                <div>
                  <label htmlFor="customer-auth-name" className="customer-auth-label">Full Name</label>
                  <div className="customer-auth-field">
                    <input
                      id="customer-auth-name"
                      type="text"
                      required
                      value={authName}
                      onChange={(e) => setAuthName(e.target.value)}
                      aria-invalid={Boolean(otpError === 'Please enter your full name.')}
                      aria-describedby={otpError === 'Please enter your full name.' ? 'customer-auth-name-error' : undefined}
                      autoComplete="name"
                      placeholder="e.g. Ahmed Khan"
                      className="customer-auth-input"
                    />
                    <User className="customer-auth-field-icon" aria-hidden="true" />
                  </div>
                  {otpError === 'Please enter your full name.' && (
                    <p id="customer-auth-name-error" className="customer-auth-field-message customer-auth-field-message--error" role="alert">
                      {otpError}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="customer-auth-email" className="customer-auth-label">UIT Student Email</label>
                  <div className="customer-auth-field">
                    <input
                      id="customer-auth-email"
                      type="email"
                      required
                      inputMode="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      aria-invalid={Boolean(otpError && !otpSent)}
                      aria-describedby={otpError && !otpSent ? 'customer-auth-email-error' : 'customer-auth-email-help'}
                      placeholder="Your university email"
                      className="customer-auth-input customer-auth-input--email"
                    />
                    <Mail className="customer-auth-field-icon" aria-hidden="true" />
                    <CheckCircle2 className="customer-auth-valid-icon" aria-hidden="true" />
                  </div>
                  {otpError && !otpSent && otpError !== 'Please enter your full name.' ? (
                    <p id="customer-auth-email-error" className="customer-auth-field-message customer-auth-field-message--error" role="alert">
                      {otpError.includes('UIT student email') ? 'Enter a valid university email' : otpError}
                    </p>
                  ) : (
                    <p id="customer-auth-email-help" className="customer-auth-field-help">
                      Use your @students.uitu.edu.pk email
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={otpLoading || cooldown > 0}
                  className="customer-auth-submit"
                  aria-label={otpLoading ? 'Sending verification code' : 'Continue'}
                >
                  {otpLoading ? <Loader2 className="customer-auth-spinner" aria-hidden="true" /> : <span>Continue</span>}
                </button>
                <p className="customer-auth-trust"><LockKeyhole aria-hidden="true" /> We only use your email to verify your order.</p>
              </form>
            </section>

            <section className={`customer-auth-panel customer-auth-panel--otp${otpSent ? ' is-active' : ' is-inactive'}`} aria-hidden={!otpSent} inert={!otpSent}>
              <div className="customer-auth-heading">
                <p className="customer-auth-step-label">STEP 2 OF 2</p>
                <h2 className="customer-auth-title">Enter verification code</h2>
                <p className="customer-auth-subtitle">We sent a 6-digit code to</p>
                <div className="customer-auth-address-row">
                  <span className="customer-auth-address">{authEmail}</span>
                  <button type="button" onClick={() => { clearPendingLogin(); setOtpSent(false); }} className="customer-auth-change-email">Change email</button>
                </div>
              </div>

              {otpError && (
                <div className="customer-auth-message customer-auth-message--error" role="alert">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{otpError}</span>
                </div>
              )}

              {otpSuccess && !otpSuccess.startsWith('Verified') && (
                <div className="customer-auth-success-note" role="status" aria-live="polite">
                  <CheckCircle2 aria-hidden="true" />
                  <span>{otpSuccess}</span>
                </div>
              )}

              <form onSubmit={handleVerifyOtp} className="customer-auth-verify-form text-left">
                <div className={`customer-auth-otp-state${otpError ? ' has-error' : ''}${otpSuccess?.startsWith('Verified') ? ' is-success' : ''}`}>
                  {otpSent ? (
                    <OtpInputBoxes
                      value={otpCode}
                      onChange={setOtpCode}
                      disabled={otpLoading}
                      prefillCode={otpPrefillCode}
                      onPrefillApplied={clearOtpPrefillCode}
                      secondaryAction={(
                        <button
                          type="button"
                          className="customer-auth-open-mail"
                          onClick={handleOpenGmail}
                          aria-label="Open Gmail to check your verification code"
                        >
                          <ExternalLink aria-hidden="true" />
                          <span>Open Gmail</span>
                        </button>
                      )}
                    />
                  ) : (
                    <div className="customer-auth-otp-placeholder" aria-hidden="true" />
                  )}
                </div>

                <button
                  type="submit"
                  disabled={otpLoading || otpCode.length < 6}
                  className={`customer-auth-submit customer-auth-verify${otpLoading ? ' is-loading' : ''}${otpSuccess?.startsWith('Verified') ? ' is-success' : ''}`}
                >
                  {otpLoading ? (
                    <><Loader2 className="customer-auth-spinner" aria-hidden="true" /><span>Verifying…</span></>
                  ) : otpSuccess?.startsWith('Verified') ? (
                    <><CheckCircle2 className="customer-auth-success-check" aria-hidden="true" /><span>Verified</span></>
                  ) : (
                    <span>Verify and Continue</span>
                  )}
                </button>

                <div className="customer-auth-verify-footer">
                  <button
                    type="button"
                    disabled={cooldown > 0 || otpLoading}
                    onClick={handleSendOtp}
                    className="customer-auth-resend"
                  >
                    {cooldown > 0 ? (
                      <>
                        <svg className="customer-auth-resend-ring" viewBox="0 0 24 24" aria-hidden="true">
                          <circle className="customer-auth-resend-track" cx="12" cy="12" r="9" />
                          <circle className="customer-auth-resend-progress" cx="12" cy="12" r="9" style={{ strokeDashoffset: 56.55 * (1 - (Math.min(cooldown, 60) / 60)) }} />
                        </svg>
                        <span>Resend code in {Math.floor(cooldown / 60)}:{String(cooldown % 60).padStart(2, '0')}</span>
                      </>
                    ) : 'Resend code'}
                  </button>
                </div>
              </form>
            </section>
          </div>
        ) : (
          <>
            {/* Transfer Success Notification */}
            {transferSuccessMessage && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-2xl flex items-center space-x-3 text-xs font-bold shadow-sm animate-fade-in">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping shrink-0" />
                <span>{transferSuccessMessage}</span>
              </div>
            )}

            {/* Active Order Banner — ZovikPOS Premium */}
            {activeOrders.length === 1 && (
              <div className="customer-active-order">
                <div className="customer-active-order__top">
                  <div className="flex items-center space-x-3">
                    <div className="customer-active-order__indicator" aria-hidden="true">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#E85D2A] opacity-60"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#E85D2A]"></span>
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <strong className="customer-active-order__number" title={activeOrders[0].orderNumber || `#${activeOrders[0].id}`}>
                          Order {activeOrders[0].orderNumber || `#${activeOrders[0].id}`}
                        </strong>
                        <span className={`customer-active-order__status customer-active-order__status--${String(activeOrders[0].status || '').toLowerCase()}`}>
                          {activeOrders[0].status}
                        </span>
                      </div>
                      <p className="customer-active-order__table">
                        <strong>
                          {resolveTableLabel({ ...activeOrders[0], forCustomer: true })}
                        </strong>
                      </p>
                    </div>
                  </div>
                  <div className="customer-active-order__actions">
                    {/* TEMP: hidden table-switch button
                    <button
                      onClick={() => {
                        if (deliveryChangeOrderId === activeOrders[0].id) {
                          setDeliveryChangeOrderId(null);
                        } else {
                          setDeliveryChangeOrderId(activeOrders[0].id);
                          setDeliveryChangeTarget(activeOrders[0].tableNumber || tableId);
                        }
                      }}
                      className="px-3 py-2 bg-white dark:bg-[#2A2A2A] hover:bg-[#FAF9F7] dark:hover:bg-[#333] text-[#171717] dark:text-[#E5E5E5] border border-[#E7E5E4] dark:border-[#404040] font-bold rounded-xl text-xs transition-all cursor-pointer flex items-center gap-1"
                    >
                      <span>📍</span>
                      <span className="hidden sm:inline">Change Seat</span>
                    </button>
                    */}
                    <button
                      onClick={() => navigate(`/customer/track/${activeOrders[0].trackingToken || activeOrders[0].id}`)}
                      className="customer-active-order__track"
                    >
                      <span>Track Order</span>
                    </button>
                  </div>
                </div>
                {/* Inline Delivery Table Picker */}
                {deliveryChangeOrderId === activeOrders[0].id && (
                  <div className="mt-3 p-3 bg-[#FAF9F7] rounded-2xl border border-[#E7E5E4] flex flex-col sm:flex-row items-start sm:items-center gap-2.5 animate-fade-in">
                    <span className="text-xs font-bold text-[#171717] whitespace-nowrap shrink-0">
                      New delivery table:
                    </span>
                    <DeliveryTableDropdown
                      value={deliveryChangeTarget}
                      tables={availableTables}
                      loading={availableTablesLoading}
                      onChange={setDeliveryChangeTarget}
                      onOpen={refreshAvailableTables}
                    />
                    <div className="flex gap-2 w-full sm:w-auto">
                      <button
                        disabled={deliveryChangeLoading || availableTablesLoading || !deliveryChangeTarget}
                        onClick={() => handleDeliveryTableChange(activeOrders[0].id, deliveryChangeTarget)}
                        className="flex-1 sm:flex-none px-4 py-2 bg-[#E85D2A] hover:bg-[#D94E1B] disabled:opacity-50 text-white font-extrabold text-xs rounded-xl transition-all shadow-sm cursor-pointer"
                      >
                        {deliveryChangeLoading ? 'Saving...' : 'Confirm'}
                      </button>
                      <button
                        onClick={() => setDeliveryChangeOrderId(null)}
                        className="px-3 py-2 text-xs text-[#78716C] hover:text-[#171717] font-bold bg-white border border-[#E7E5E4] rounded-xl cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeOrders.length > 1 && (
              <div className="bg-white dark:bg-[#1E1E1E] border border-[#E85D2A]/25 dark:border-[#E85D2A]/40 p-4 sm:p-5 rounded-3xl space-y-3 shadow-md shadow-[#E85D2A]/8">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                    <span className="text-xs font-black uppercase tracking-wider text-orange-950 dark:text-orange-300">
                      Active Orders in Progress ({activeOrders.length})
                    </span>
                  </div>
                  <span className="text-[11px] font-bold text-[#E85D2A] dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40 px-2.5 py-1 rounded-full border border-orange-100 dark:border-orange-900/50">
                    Live Kitchen Sync
                  </span>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {activeOrders.map((ord) => (
                    <div
                      key={ord.id}
                      className="bg-white p-3.5 rounded-2xl border border-gray-100 flex flex-col space-y-2.5 shadow-xs hover:border-orange-200 transition-all"
                    >
                      <div className="flex justify-between items-start">
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <strong className="text-xs font-bold text-gray-900">
                              {ord.orderNumber || `#000${ord.id}`}
                            </strong>
                            <span className="px-2 py-0.5 text-[10px] font-extrabold rounded-md bg-emerald-100 text-emerald-800">
                              {ord.status}
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-500">
                            Delivering to: <strong className="text-orange-700 bg-orange-50 px-1.5 py-0.5 rounded font-bold">{resolveTableLabel({ ...ord, forCustomer: true })}</strong> • {ord.orderItems?.length || 0} items
                          </p>
                        </div>
                        <button
                          onClick={() => navigate(`/customer/track/${ord.trackingToken || ord.id}`)}
                          className="px-3 py-1.5 bg-[#E85D2A] hover:bg-[#D94E1B] text-white font-bold rounded-xl text-[11px] transition-all shadow-xs cursor-pointer shrink-0 ml-2"
                        >
                          Track →
                        </button>
                      </div>

                      {/* Change Location Button / Picker for multi-orders */}
                      {deliveryChangeOrderId === ord.id ? (
                        <div className="p-2.5 bg-orange-50/70 rounded-xl border border-orange-100 space-y-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-orange-950 text-[11px]">Select Delivery Table:</span>
                            <button onClick={() => setDeliveryChangeOrderId(null)} className="text-[10px] font-bold text-gray-400 hover:text-gray-600">✕ Close</button>
                          </div>
                          <div className="flex items-center gap-2">
                            <DeliveryTableDropdown
                              value={deliveryChangeTarget}
                              tables={availableTables}
                              loading={availableTablesLoading}
                              onChange={setDeliveryChangeTarget}
                              onOpen={refreshAvailableTables}
                              compact
                            />
                            <button
                              disabled={deliveryChangeLoading || availableTablesLoading || !deliveryChangeTarget}
                              onClick={() => handleDeliveryTableChange(ord.id, deliveryChangeTarget)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-[11px] rounded-lg transition-all"
                            >
                              {deliveryChangeLoading ? '...' : 'Save'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setDeliveryChangeOrderId(ord.id);
                            setDeliveryChangeTarget(ord.tableNumber || tableId);
                          }}
                          className="text-[11px] text-orange-600 hover:text-orange-800 font-bold hover:underline self-start flex items-center space-x-1"
                        >
                          <span>📍 Change delivery seat/table for this order</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Failed/Rejected Order Notice with 1-Click Dismiss */}
            {failedOrders.length > 0 && (
              <div className="bg-rose-50/90 dark:bg-rose-950/40 border border-rose-200/90 dark:border-rose-900/60 p-4 sm:p-5 rounded-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-sm animate-fade-in">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-2xl bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                    <AlertCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <strong className="text-rose-950 dark:text-rose-200 font-extrabold block text-sm">
                      {failedOrders[0]?.status === 'REJECTED'
                        ? 'Order Rejected by Kitchen'
                        : failedOrders[0]?.status === 'CANCELLED'
                        ? 'Order Cancelled'
                        : 'Payment Incomplete'} ({failedOrders.length} order{failedOrders.length > 1 ? 's' : ''})
                    </strong>
                    <span className="text-rose-800/80 dark:text-rose-300/80 text-[11px]">
                      {failedOrders.map(f => (
                        <span key={f.id} className="inline-block mr-2">
                          Order {f.orderNumber || `#${f.id}`}{f.status === 'REJECTED' ? (f.rejectionReason ? `: ${f.rejectionReason}` : ' (Rejected by vendor/kitchen)') : ' — Payment incomplete'}
                        </span>
                      ))}
                    </span>
                  </div>
                </div>
                <button
                  onClick={handleDismissFailedOrders}
                  className="px-3.5 py-1.5 bg-white dark:bg-[#2A2A2A] hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-700 dark:text-rose-300 font-bold rounded-xl text-[11px] border border-rose-200 dark:border-rose-800 transition-all shadow-xs cursor-pointer shrink-0 self-end sm:self-auto"
                >
                  ✕ Dismiss Notice
                </button>
              </div>
            )}

            {/* ── MENU VIEW ──────────────────────────────────────────────────────── */}
            <div className="space-y-6">
              {/* PROMOTIONAL CAROUSEL */}
              <section
                className="customer-promo"
                aria-label="Featured dining promotions"
                onMouseEnter={pauseAutoplay}
                onMouseLeave={startAutoplay}
                onFocus={pauseAutoplay}
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) startAutoplay();
                }}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
                onWheel={handlePromoWheel}
              >
                <div
                  ref={promoScrollRef}
                  className="customer-promo__viewport"
                  role="group"
                  tabIndex={0}
                  aria-roledescription="carousel"
                  aria-label="Promotions"
                  onScroll={handlePromoScroll}
                  onKeyDown={handlePromoKeyDown}
                  onPointerDown={handlePromoPointerDown}
                  onPointerMove={handlePromoPointerMove}
                  onPointerUp={handlePromoPointerEnd}
                  onPointerCancel={handlePromoPointerEnd}
                >
                  {promoRenderSlides.map(({ slide, position, realIndex, isClone }) => (
                    <article
                      key={`${slide.style}-${position}`}
                      data-promo-position={position}
                      className={`customer-promo__slide customer-promo__slide--${slide.style}`}
                      role="group"
                      aria-roledescription="slide"
                      aria-label={`${realIndex + 1} of ${promoSlides.length}: ${slide.headline}`}
                      aria-hidden={isClone ? 'true' : undefined}
                    >
                      <span className="customer-promo__orb customer-promo__orb--one" aria-hidden="true" />
                      <span className="customer-promo__orb customer-promo__orb--two" aria-hidden="true" />
                      <div className="customer-promo__content">
                        <span className="customer-promo__eyebrow">
                          <slide.eyebrowIcon aria-hidden="true" strokeWidth={1.75} />
                          <span>{slide.eyebrow}</span>
                        </span>
                        <h1>{slide.headline}</h1>
                        <p>{slide.sub}</p>
                        <button
                          type="button"
                          tabIndex={isClone ? -1 : undefined}
                          onClick={() => navigate('/customer/cart')}
                          className="customer-promo__cta"
                        >
                          <span>Explore menu</span>
                        </button>
                      </div>
                      <div className="customer-promo__visual" aria-hidden="true">
                        <span className="customer-promo__visual-orb" />
                        <span className="customer-promo__visual-ring customer-promo__visual-ring--outer" />
                        <span className="customer-promo__visual-ring customer-promo__visual-ring--inner" />
                        <span className="customer-promo__visual-tile">
                          <slide.visualIcon strokeWidth={1.75} />
                        </span>
                        <span className="customer-promo__visual-chip">
                          <slide.chipIcon strokeWidth={1.75} />
                          <span>{slide.chipLabel}</span>
                        </span>
                      </div>
                    </article>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => goToSlide((promoIndex - 1 + promoSlides.length) % promoSlides.length)}
                  className="customer-promo__arrow customer-promo__arrow--previous icon-btn"
                  aria-label="Previous promotion"
                >
                  <ChevronLeft aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => goToSlide((promoIndex + 1) % promoSlides.length)}
                  className="customer-promo__arrow customer-promo__arrow--next icon-btn"
                  aria-label="Next promotion"
                >
                  <ChevronRight aria-hidden="true" />
                </button>

                <div className="customer-promo__pagination" role="group" aria-label="Choose a promotion">
                  {promoSlides.map((slide, idx) => (
                    <button
                      key={slide.style}
                      type="button"
                      onClick={() => goToSlide(idx)}
                      className="customer-promo__dot-button"
                      aria-label={`Go to slide ${idx + 1}`}
                      aria-current={idx === promoIndex ? 'true' : undefined}
                    >
                      <span className={`customer-promo__dot${idx === promoIndex ? ' is-active' : ''}`} />
                    </button>
                  ))}
                </div>
              </section>

              {/* SEARCH AND CATEGORY FILTERS */}
              <div className="customer-menu-controls">
                <div className="customer-search">
                  <Search className="customer-search__icon" aria-hidden="true" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search dishes, drinks, and more"
                    aria-label="Search menu"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      className="customer-search__clear icon-btn"
                      onClick={() => setSearchQuery('')}
                      aria-label="Clear search"
                    >
                      <X aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>

              <div ref={categorySentinelRef} className="customer-category-sentinel" aria-hidden="true" />
              <div ref={categoryStickyRef} className="customer-category-sticky">
                <div className="customer-category-row">
                  <div
                    ref={categoryScrollRef}
                    onMouseDown={handleCategoryMouseDown}
                    onMouseLeave={handleCategoryMouseLeave}
                    onMouseUp={handleCategoryMouseUp}
                    onMouseMove={handleCategoryMouseMove}
                    className="customer-category-scroll"
                    role="tablist"
                    aria-label="Filter dishes by category"
                  >
                    {combinedCategories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        role="tab"
                        aria-selected={category === cat}
                        onClick={() => {
                          if (isDraggingRef.current) return;
                          setCategory(cat);
                        }}
                        className={`customer-category-tab${category === cat ? ' is-active' : ''}`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                  {categoryCanScroll && (
                    <div className="customer-category-arrows" aria-label="Scroll categories">
                      <button type="button" onClick={() => scrollCategoriesBy(-1)} aria-label="Scroll categories left" className="icon-btn"><ChevronLeft aria-hidden="true" /></button>
                      <button type="button" onClick={() => scrollCategoriesBy(1)} aria-label="Scroll categories right" className="icon-btn"><ChevronRight aria-hidden="true" /></button>
                    </div>
                  )}
                </div>
              </div>

              {/* FOOD PRODUCTS GRID — Premium mobile-first layout with uniform card heights */}
              {isMenuLoading && menu.length === 0 ? (
                <div className="customer-food-grid">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="customer-food-card-skeleton">
                      <span className="skeleton customer-food-card-skeleton__image" />
                      <span className="skeleton customer-food-card-skeleton__title" />
                      <span className="skeleton customer-food-card-skeleton__description" />
                      <span className="skeleton customer-food-card-skeleton__price" />
                    </div>
                  ))}
                </div>
              ) : isMenuError && menu.length === 0 ? (
                <div className="customer-menu-error" role="alert">
                  <span className="customer-menu-error__icon" aria-hidden="true"><AlertCircle /></span>
                  <p>We couldn’t load the menu right now.</p>
                  <button type="button" onClick={() => refetchMenu()}>
                    <RotateCcw aria-hidden="true" />
                    <span>Try again</span>
                  </button>
                </div>
              ) : filteredGrouped.length === 0 ? (
                <div className="customer-empty-results">
                  <span className="customer-empty-results__icon" aria-hidden="true"><Search /></span>
                  <p className="customer-empty-results__title">
                    No dishes found for ‘{searchQuery || category}’
                  </p>
                  <p className="customer-empty-results__hint">Try another search or choose a different category.</p>
                  {searchQuery && (
                    <button type="button" onClick={() => setSearchQuery('')} className="customer-empty-results__clear">
                      Clear search
                    </button>
                  )}
                </div>
              ) : (
                <div className="customer-food-grid">
                  {filteredGrouped.map(({ groupKey, variants }, imageIndex) => {
                    const isExpanded = expandedGroup === groupKey;
                    const selectedVariant = pendingVariant[groupKey] || variants[0];
                    // Per-variant independent quantity — keyed by variant's own id
                    const currentVariantQty = pendingQty[selectedVariant.id] || 1;
                    const inCartQty = variants.reduce((sum, v) => sum + (cart[v.id]?.quantity || 0), 0);
                    const isOutOfStock = variants.every((v) => v.stock <= 0);
                    const isSelectedOutOfStock = selectedVariant.stock <= 0;
                    const startingPrice = Math.min(...variants.map((variant) => Number(variant.price) || 0));
                    const toggleCard = (event) => {
                      if (isOutOfStock) return;
                      const willOpen = !isExpanded;
                      if (willOpen) expandedScrollTargetRef.current = event.currentTarget.closest('.customer-food-card');
                      setExpandedGroup(willOpen ? groupKey : null);
                    };

                    return (
                      <article
                        key={groupKey}
                        data-menu-item-ids={variants.map((variant) => variant.id).join(',')}
                        aria-disabled={isOutOfStock ? 'true' : undefined}
                        aria-expanded={!isOutOfStock ? isExpanded : undefined}
                        role="button"
                        tabIndex={isOutOfStock ? -1 : 0}
                        onClick={(event) => {
                          if (isOutOfStock || event.target.closest('button')) return;
                          toggleCard(event);
                        }}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget || isOutOfStock) return;
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            toggleCard(event);
                          }
                        }}
                        className={`customer-food-card${isExpanded ? ' is-expanded' : ''}${isOutOfStock ? ' is-sold-out' : ''}${inCartQty > 0 ? ' is-in-cart' : ''}`}
                      >
                        <div className="customer-food-card__top">
                        <div className="customer-food-card__media">
                          <CustomerMenuImage
                            src={getItemImage(selectedVariant)}
                            alt={groupKey}
                            priority={imageIndex < 4}
                            onError={(e) => {
                              e.target.onerror = null;
                              e.target.src = 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=700&auto=format&fit=crop&q=80';
                            }}
                          />
                          {selectedVariant.category && (
                            <div className={`customer-food-card__overlay-zone customer-food-card__overlay-zone--top-left${inCartQty > 0 ? ' has-in-cart' : ''}`}>
                              <span className="customer-food-card__category">
                                <span className="customer-food-card__category-label">{selectedVariant.category}</span>
                              </span>
                            </div>
                          )}
                          {inCartQty > 0 && (
                            <div className="customer-food-card__overlay-zone customer-food-card__overlay-zone--top-right">
                              <span key={inCartQty} className="customer-food-card__in-cart" role="status" aria-label={`${inCartQty} in cart`}>
                                <span className="customer-food-card__in-cart-label">{inCartQty} in cart</span>
                                <span className="customer-food-card__in-cart-count" aria-hidden="true">{inCartQty}</span>
                              </span>
                            </div>
                          )}
                          {selectedVariant.prepTime && (
                            <div className="customer-food-card__overlay-zone customer-food-card__overlay-zone--bottom-left">
                              <span className="customer-food-card__prep glass">
                                <Clock aria-hidden="true" />
                                <span>{selectedVariant.prepTime}m</span>
                              </span>
                            </div>
                          )}
                          {isOutOfStock && (
                            <span className="customer-food-card__sold-out glass">Sold Out</span>
                          )}
                        </div>

                        <div className="customer-food-card__body">
                          <div className="customer-food-card__copy">
                            <h3 className="customer-food-card__title">
                              {groupKey}
                            </h3>
                            <p className="customer-food-card__description">
                              {selectedVariant.description || 'Freshly prepared to order.'}
                            </p>
                          </div>

                            <div className="customer-food-card__summary">
                              <div className="customer-food-card__price-block">
                                <span className="customer-food-card__unit">
                                  {variants.length > 1 ? 'Multiple sizes' : selectedVariant.unit || ''}
                                </span>
                                <span className="customer-food-card__price">
                                  {variants.length > 1 && <span>From</span>}
                                  <span>Rs.</span>
                                  <strong className="price-type">{variants.length > 1 ? startingPrice.toLocaleString() : Number(selectedVariant.price).toLocaleString()}</strong>
                                </span>
                              </div>
                              {isOutOfStock ? (
                                <span className="customer-food-card__unavailable" aria-disabled="true">Unavailable</span>
                              ) : variants.length > 1 ? (
                                <button
                                  type="button"
                                  onClick={(event) => { event.stopPropagation(); toggleCard(event); }}
                                  className="customer-food-card__customize"
                                  aria-label={`Choose size for ${groupKey}`}
                                >
                                  Choose size <ChevronDown aria-hidden="true" />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(event) => { event.stopPropagation(); toggleCard(event); }}
                                  className="customer-food-card__add icon-btn"
                                  aria-label={`Open options for ${groupKey}`}
                                >
                                  <Plus aria-hidden="true" />
                                </button>
                              )}
                            </div>
                        </div>
                        </div>

                        <div className={`customer-food-card__expand-grid${isExpanded ? ' is-expanded' : ''}`} aria-hidden={!isExpanded} inert={!isExpanded} onClick={(event) => event.stopPropagation()}>
                            <div className="customer-food-card__expand-content">
                              <div className="customer-food-card__expand-inner">
                              <div className="customer-food-card__section-heading">
                                <span>{variants.length > 1 ? 'Choose size' : 'Customize item'}</span>
                                <button
                                  type="button"
                                  onClick={(event) => { event.stopPropagation(); setExpandedGroup(null); }}
                                  aria-label={`Collapse ${groupKey} options`}
                                 className="icon-btn icon-btn--32">
                                  <ChevronDown aria-hidden="true" />
                                </button>
                              </div>
                              {variants.length > 1 && (
                                <div className="customer-food-card__variant-section">
                                  <div className="customer-food-card__variant-scroll">
                                    <div
                                      className="customer-food-card__variant-track"
                                      style={{ '--variant-count': variants.length }}
                                    >
                                      {variants.map((variant) => {
                                        const isSelected = selectedVariant.id === variant.id;
                                        return (
                                          <button
                                            key={variant.id}
                                            type="button"
                                            aria-pressed={isSelected}
                                            onClick={(event) => { event.stopPropagation(); setPendingVariant((prev) => ({ ...prev, [groupKey]: variant })); }}
                                            className={`customer-food-card__variant${isSelected ? ' is-selected' : ''}`}
                                          >
                                            <span className="customer-food-card__variant-label">{variant.unit || 'Standard'}</span>
                                            <small>Rs. {Number(variant.price).toLocaleString('en-PK', { maximumFractionDigits: 0 })}</small>
                                            {isSelected && <Check className="customer-food-card__variant-check" aria-hidden="true" />}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>
                              )}

                              {variants.length === 1 && (
                                <div className="customer-food-card__single-price">
                                  <span>{selectedVariant.unit}</span>
                                  <span className="customer-food-card__price">
                                    <span>Rs.</span>
                                    <strong className="price-type">{Number(selectedVariant.price).toLocaleString('en-PK', { maximumFractionDigits: 0 })}</strong>
                                  </span>
                                </div>
                              )}

                              <div className="customer-food-card__stepper-block">
                                <span className="customer-food-card__stepper-label">Quantity</span>
                                <div className="customer-quantity-stepper" role="group" aria-label={`Quantity ${currentVariantQty}`}>
                                  <button
                                    type="button"
                                    onClick={(event) => { event.stopPropagation(); setPendingQty((prev) => ({ ...prev, [selectedVariant.id]: Math.max(1, (prev[selectedVariant.id] || 1) - 1) })); }}
                                    disabled={currentVariantQty <= 1}
                                    aria-label={currentVariantQty <= 1 ? 'Minimum quantity is one' : 'Decrease quantity'}
                                  >
                                    {currentVariantQty <= 1 ? <Trash2 aria-hidden="true" /> : <Minus aria-hidden="true" />}
                                  </button>
                                  <span key={currentVariantQty} className="customer-quantity-stepper__value price-type" aria-live="polite">
                                    {currentVariantQty}
                                  </span>
                                  <button
                                    type="button"
                                    aria-label="Increase quantity"
                                    onClick={(event) => { event.stopPropagation(); setPendingQty((prev) => ({ ...prev, [selectedVariant.id]: (prev[selectedVariant.id] || 1) + 1 })); }}
                                    className="icon-btn icon-btn--36">
                                    <Plus aria-hidden="true" />
                                  </button>
                                </div>
                              </div>

                              <div className="customer-food-card__subtotal">
                                <span>{currentVariantQty} × {selectedVariant.unit || groupKey} =</span>
                                <strong className="price-type">Rs. {(selectedVariant.price * currentVariantQty).toLocaleString('en-PK', { maximumFractionDigits: 0 })}</strong>
                              </div>

                              <div className="customer-food-card__actions">
                                <button
                                  type="button"
                                  onClick={(event) => { event.stopPropagation(); setExpandedGroup(null); }}
                                  className="customer-food-card__cancel"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  disabled={isSelectedOutOfStock}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    animateCartFlight(event.currentTarget);
                                    handleAddWithVariantAndQty(selectedVariant, groupKey);
                                  }}
                                  className="customer-food-card__confirm"
                                >
                                  <CartIcon aria-hidden="true" />
                                  <span>{isSelectedOutOfStock ? 'Unavailable' : 'Add to Cart'}</span>
                                </button>
                              </div>
                              </div>
                            </div>
                          </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
        </>}
      </main>

      {/* Sticky cart summary */}
      {totalCartQuantity > 0 && isSessionVerified && sessionInitializationDone && !requiresTableQr && (
        <section className="customer-cart-dock" role="region" aria-label="Cart summary">
          <button
            type="button"
            onClick={handleOpenCustomerCart}
            className="customer-cart-dock__button glass"
            aria-label={`Checkout, ${totalCartQuantity} ${totalCartQuantity === 1 ? 'item' : 'items'}, subtotal Rs. ${totalCartPrice.toFixed(2)}`}
          >
            <span className="customer-cart-dock__order">
              <span className={`customer-cart-dock__count${totalCartQuantity < 10 ? ' is-single' : ''}`} key={totalCartQuantity} aria-hidden="true">
                {totalCartQuantity > 99 ? '99+' : totalCartQuantity}
              </span>
              <span className="customer-cart-dock__order-copy">
                <span className="customer-cart-dock__label">Your Order</span>
                <span className="customer-cart-dock__items">{totalCartQuantity} {totalCartQuantity === 1 ? 'item' : 'items'}</span>
              </span>
            </span>

            <span className="customer-cart-dock__subtotal" aria-hidden="true">
              <span className="customer-cart-dock__subtotal-label">Subtotal</span>
              <span className="customer-cart-dock__price" key={totalCartPrice}>
                <span>Rs.</span>
                <strong title={formatPrice(totalCartPrice)}>{formatCompactAmount(totalCartPrice)}</strong>
              </span>
            </span>

            <span className="customer-cart-dock__checkout" aria-hidden="true">
              <span>Checkout</span>
              <span className="customer-cart-dock__mobile-total" title={formatPrice(totalCartPrice)}>· Rs. {formatCompactAmount(totalCartPrice)}</span>
            </span>
            <span className="customer-cart-dock__announcement" aria-live="polite" aria-atomic="true">
              Your order has {totalCartQuantity} {totalCartQuantity === 1 ? 'item' : 'items'}. Subtotal Rs. {totalCartPrice.toFixed(2)}.
            </span>
          </button>
        </section>
      )}

      {showSignOutConfirm && (
        <ModalShell
          isOpen
          onClose={() => setShowSignOutConfirm(false)}
          labelledBy="customer-signout-title"
          className="customer-modal customer-modal--logout"
        >
          <header className="customer-modal__header">
            <span className="customer-modal__icon"><LogOut aria-hidden="true" /></span>
            <div>
              <h2 id="customer-signout-title">Sign out?</h2>
              <p>Your cart and session will be cleared.</p>
            </div>
          </header>
          <div className="customer-modal__actions customer-modal__actions--logout">
            <button type="button" onClick={confirmCustomerLogout} className="customer-modal__button customer-modal__button--primary">Sign Out</button>
            <button type="button" onClick={() => setShowSignOutConfirm(false)} className="customer-modal__button customer-modal__button--secondary">Cancel</button>
          </div>
        </ModalShell>
      )}

      <div className={`customer-signout-overlay${isSigningOut ? ' is-visible' : ''}`} aria-hidden={!isSigningOut} role={isSigningOut ? 'status' : undefined} aria-live={isSigningOut ? 'polite' : undefined} aria-label={isSigningOut ? 'Signing out' : undefined}>
          <div className="customer-signout-overlay__content">
            <img className="customer-signout-overlay__mark" src="/assets/zovikpos-mark.svg" alt="" aria-hidden="true" />
            <strong>ZOVIKPOS</strong>
            <span className="customer-signout-overlay__spinner" aria-hidden="true" />
            <span className="customer-signout-overlay__label">Signing out…</span>
          </div>
      </div>

      {/* In-App QR Scanner Modal (Direct camera scan to switch tables or reconnect expired sessions) */}
      <InAppQRScanner
        isOpen={showInAppScanner}
        onClose={() => setShowInAppScanner(false)}
        onScanSuccess={handleQrScanned}
      />

      {/* PWA Install Guide Modal (When browser holds deferred prompt or on iOS / Chrome menu) */}
      {showInstallGuide && (
        <CustomerInstallGuideModal isIosDevice={isIosDevice} onClose={() => setShowInstallGuide(false)} hasNativePrompt={Boolean(deferredInstallPrompt)} onInstall={handleInstallClick} />
      )}
    </div>
  );
};

export default CustomerDashboard;
