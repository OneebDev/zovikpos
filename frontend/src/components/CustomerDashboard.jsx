import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import api, { setActiveAuthTokens } from '../services/api';

import { useCustomerMenu } from '../hooks/useCustomerMenu';
import { useCustomerActiveOrders } from '../hooks/useCustomerActiveOrders';
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
  ArrowRight,
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
  Utensils,
  Sun,
  Moon,
} from 'lucide-react';
import FAQModal from './FAQModal';

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
        className={`flex w-full items-center gap-2 rounded-xl border border-stone-200 bg-white text-left text-xs font-bold text-stone-900 shadow-sm transition hover:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 ${compact ? 'px-2.5 py-1.5' : 'px-3 py-2'}`}
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
        loading={priority ? 'eager' : 'lazy'}
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
        className={`w-full h-full object-cover transition-[transform,opacity] duration-500 group-hover:scale-105 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
    </>
  );
};

// Helper to extract clean table display name from token or text
const parseTableDisplay = (tokenOrName) => {
  if (!tokenOrName) return 'Dining Table';
  try {
    let clean = String(tokenOrName).trim();
    if (clean.includes('%')) clean = decodeURIComponent(clean);

    // Check for signed token format: tbl:tableNumber:branchId:nonce:signature
    const parts = clean.split(':');
    if (parts.length >= 2 && parts[0] === 'tbl') {
      const tblNum = parts[1];
      if (tblNum) {
        return tblNum.toLowerCase().startsWith('table') ? tblNum : `Table ${tblNum}`;
      }
    }

    // Check if it already starts with "Table"
    if (clean.toLowerCase().startsWith('table')) {
      const suffix = clean.slice(5).trim();
      const digitsOnly = suffix.replace(/[^0-9]/g, '');
      if (digitsOnly && digitsOnly.length > 4) {
        return 'Dining Table';
      }
      return clean;
    }

    // Check if it's a short numeric table number (1 to 4 digits, e.g. "14", "7")
    const num = clean.replace(/[^0-9]/g, '');
    if (num && num.length > 0 && num.length <= 4) {
      return `Table ${num}`;
    }

    return 'Dining Table';
  } catch {
    return 'Dining Table';
  }
};

// Clean 6-box separate digit OTP input component
export const OtpInputBoxes = ({ value, onChange, disabled }) => {
  const digits = (value || '').padEnd(6, '').slice(0, 6).split('');
  const inputRefs = React.useRef([]);

  const handleChange = (e, index) => {
    const val = e.target.value.replace(/[^0-9]/g, '');
    if (!val) {
      const newDigits = [...digits];
      newDigits[index] = '';
      onChange(newDigits.join('').trim());
      return;
    }
    const char = val[val.length - 1];
    const newDigits = [...digits];
    newDigits[index] = char;
    const result = newDigits.join('');
    onChange(result);

    if (index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (e, index) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, 6);
    if (pasted) {
      onChange(pasted);
      const nextFocus = Math.min(pasted.length, 5);
      inputRefs.current[nextFocus]?.focus();
    }
  };

  return (
    <div className="flex gap-2 sm:gap-2.5 justify-center my-3" onPaste={handlePaste}>
      {[0, 1, 2, 3, 4, 5].map((idx) => (
        <input
          key={idx}
          ref={(el) => (inputRefs.current[idx] = el)}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          disabled={disabled}
          value={digits[idx] || ''}
          onChange={(e) => handleChange(e, idx)}
          onKeyDown={(e) => handleKeyDown(e, idx)}
          className={`w-10 h-12 sm:w-11 sm:h-13 text-center text-lg sm:text-xl font-black font-mono rounded-xl border-2 transition-all focus:outline-none ${digits[idx]
              ? 'border-[#E85D2A] bg-white dark:bg-[#2B2522] text-[#E85D2A] dark:text-[#FF9B70] shadow-sm'
              : 'border-[#E7E5E4] dark:border-[#45403D] bg-[#FAF9F7] dark:bg-[#292725] text-[#171717] dark:text-[#F5F5F5] focus:border-[#E85D2A] focus:bg-white dark:focus:bg-[#302A27] focus:ring-4 focus:ring-[#E85D2A]/15'
            }`}
        />
      ))}
    </div>
  );
};

const CustomerDashboard = ({ tableIdFromRoute }) => {
  const navigate = useNavigate();
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const { menu, isLoading: isMenuLoading } = useCustomerMenu();
  const [cart, setCart] = useState(() => {
    try {
      const saved = localStorage.getItem('customer_cart');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [tableId, setTableId] = useState(() => {
    const saved = localStorage.getItem('customer_tableId');
    if (saved) return parseTableDisplay(saved);
    if (tableIdFromRoute) return parseTableDisplay(tableIdFromRoute);
    return 'Dining Table';
  });
  const [sessionId, setSessionId] = useState(() => localStorage.getItem('customer_sessionId') || '');
  const [tableError, setTableError] = useState('');
  const [category, setCategory] = useState(() => localStorage.getItem('customer_category') || 'All');
  const [transferSuccessMessage, setTransferSuccessMessage] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFAQ, setShowFAQ] = useState(false);
  const [error, setError] = useState('');

  // ─── Variant / Quantity Selection State ───────────────────────────────────
  // expandedGroup: the groupKey of the currently-open food card (only one open at a time)
  const [expandedGroup, setExpandedGroup] = useState(null);
  // pendingVariant: { [groupKey]: variantObject } — the selected variant pill per group
  const [pendingVariant, setPendingVariant] = useState({});
  // pendingQty: { [variantId]: number } — EACH VARIANT has its own quantity, independent
  const [pendingQty, setPendingQty] = useState({});

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
    const savedSession = localStorage.getItem('customer_sessionId');
    const verifiedSessionId = localStorage.getItem('customer_verifiedSessionId');
    return Boolean(savedSession && verifiedSessionId === savedSession);
  });

  const { activeOrders, failedOrders, refetch: refetchActiveOrders, dismissFailedOrder } = useCustomerActiveOrders({
    enabled: isSessionVerified,
  });

  const [authName, setAuthName] = useState(() => {
    const u = getStoredCustomerUser();
    return u ? (u.name || '') : '';
  });
  const [authEmail, setAuthEmail] = useState(() => {
    const u = getStoredCustomerUser();
    return u ? (u.email || '') : '';
  });
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [otpSuccess, setOtpSuccess] = useState('');
  const [cooldown, setCooldown] = useState(0);

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

  const [guestName] = useState(() => {
    const saved = localStorage.getItem('user');
    if (saved) {
      try {
        const u = JSON.parse(saved);
        if (!u.isGuest) return u.name;
      } catch  { /* Optional storage or parsing failure. */ }
    }
    return '';
  });

  // Cooldown timer effect
  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  // ─── Initialize Dining Session from QR Token or Table ID ─────────────────
  useEffect(() => {
    const initSession = async () => {
      const storedSession = localStorage.getItem('customer_sessionId');
      const storedToken = localStorage.getItem('customer_tableToken');
      const storedTable = localStorage.getItem('customer_tableId');

      if (tableIdFromRoute) {
        let cleanRouteToken = String(tableIdFromRoute).trim();
        if (cleanRouteToken.includes('%')) {
          try {
            cleanRouteToken = decodeURIComponent(cleanRouteToken);
          } catch  { /* Optional storage or parsing failure. */ }
        }

        const newTableDisplay = parseTableDisplay(cleanRouteToken);

        // Check if user has an active session on a DIFFERENT table
        const isDifferentTable = Boolean(
          storedSession && (
            (storedToken && storedToken !== cleanRouteToken && storedToken !== tableIdFromRoute) ||
            (storedTable && storedTable !== newTableDisplay && storedToken && storedToken !== cleanRouteToken)
          )
        );

        if (isDifferentTable) {
          // Await active orders and cart BEFORE showing modal so the correct card opens instantly without flickering
          if (storedSession) {
            await checkForExistingOrder(storedSession);
            await fetchServerCart(storedSession);
          }
          // Snapshot current table BEFORE we trigger the modal so it shows correctly
          const oldTable = storedTable ? parseTableDisplay(storedTable) : (tableId || 'your table');
          setCurrentTableSnapshot(oldTable);
          setPendingTableToken(cleanRouteToken);
          setPendingTableNumber(newTableDisplay);
          setShowTableSwitchModal(true);
          return;
        }

        // Normal flow or same table: start or refresh session with complete signed token
        try {
          const res = await api.post('/sessions/start', {
            qrToken: cleanRouteToken,
          });

          if (res.data.session) {
            const s = res.data.session;
            setSessionId(s.id);
            localStorage.setItem('customer_sessionId', s.id);
            const tName = s.table?.tableNumber || `Table ${s.table?.id}`;
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
          console.warn('Session start error:', err.response?.data?.error || err.message);
          if (err.response?.status === 403) {
            setTableError(err.response.data.error || 'This dining table is currently disabled.');
          } else if (err.response?.status === 404 || err.response?.status === 400) {
            setTableError('Invalid or unverified table QR code. Please scan the QR code at your table.');
          }
        }
      } else {
        // Fallback when no route param is provided
        const startFreshDefaultSession = async () => {
          try {
            const res = await api.post('/sessions/start', {
              tableNumber: storedTable || 'Table 1',
            });
            if (res.data.session) {
              const s = res.data.session;
              setSessionId(s.id);
              localStorage.setItem('customer_sessionId', s.id);
              const tName = s.table?.tableNumber || `Table ${s.table?.id}`;
              setTableId(tName);
              localStorage.setItem('customer_tableId', tName);

              const isUserLoggedIn = checkIsCustomerLoggedIn();

              if (isUserLoggedIn) {
                localStorage.setItem('customer_verifiedSessionId', s.id);
                setIsSessionVerified(true);
              } else {
                setIsSessionVerified(false);
              }

              fetchServerCart(s.id);
              checkForExistingOrder(s.id);
            }
          } catch (err) {
            console.warn('Default session start fallback:', err.message);
          }
        };

        if (!storedSession) {
          await startFreshDefaultSession();
        } else {
          try {
            const checkRes = await api.get(`/sessions/${storedSession}`);
            if (checkRes.data.session && checkRes.data.session.status === 'ACTIVE') {
              fetchServerCart(storedSession);
              checkForExistingOrder(storedSession);
            } else {
              console.warn('Stored session is inactive/expired. Initializing fresh session.');
              await startFreshDefaultSession();
            }
          } catch {
            console.warn('Stored session not found in DB. Initializing fresh session.');
            await startFreshDefaultSession();
          }
        }
      }
    };

    initSession();
  // Session restoration checks are intentionally kept together to preserve the existing login/session flow.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableIdFromRoute]);

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
  }, [sessionId, sessionExpired]);

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
      const res = await api.post('/sessions/start', {
        qrToken: pendingTableToken,
      });

      if (res.data.session) {
        const s = res.data.session;
        const newSessionId = s.id;
        const newTableDisplay = s.table?.tableNumber || `Table ${s.table?.id}`;

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
      setTableError(err.response?.data?.error || 'Failed to switch dining table.');
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
        setSessionExpired(true);
        return;
      }
      console.warn('Could not sync server cart:', e.message);
    }
  };

  // ─── OTP Handlers ────────────────────────────────────────────────────────
  const handleSendOtp = async (e) => {
    if (e) e.preventDefault();
    if (otpLoading || cooldown > 0) return;
    if (!authEmail) {
      setOtpError('Please enter your email address.');
      return;
    }
    setOtpError('');
    setOtpSuccess('');
    setOtpLoading(true);

    try {
      const curSessionId = sessionId || localStorage.getItem('customer_sessionId');
      const res = await api.post('/auth/send-otp', {
        email: authEmail.trim(),
        name: authName.trim() || 'Guest Customer',
        sessionId: curSessionId || undefined,
      });

      if (res.data.success) {
        setOtpSent(true);
        setOtpSuccess('Verification code sent to your email. Check inbox.');
        setCooldown(30);
      }
    } catch (err) {
      setOtpError(err.response?.data?.error || 'Failed to send OTP code.');
      if (err.response?.status === 429) {
        const responseData = err.response?.data || {};
        const messageDelay = String(responseData.error || '').match(/(\d+)\s*seconds?/i);
        const retryDelay = Number(responseData.retryAfterSeconds || messageDelay?.[1] || 30);
        setCooldown(Math.max(1, retryDelay));
      }
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    if (e) e.preventDefault();
    if (!otpCode || otpCode.trim().length < 4) {
      setOtpError('Please enter the 6-digit verification code.');
      return;
    }
    setOtpError('');
    setOtpSuccess('');
    setOtpLoading(true);

    try {
      const curSessionId = sessionId || localStorage.getItem('customer_sessionId');
      const res = await api.post('/auth/verify-otp', {
        email: authEmail.trim(),
        name: authName.trim() || 'Guest Customer',
        otp: otpCode.trim(),
        sessionId: curSessionId || undefined,
      });

      if (res.data.success) {
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
        const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
        return `http://${host}:5001${url}`;
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
  useEffect(() => { localStorage.setItem('customer_tableId', tableId); }, [tableId]);
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
          setSessionExpired(true);
          return;
        }
        console.warn('Backend cart add warning:', err.message);
      }
    }
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
      headline: 'Authentic Flavors & Fresh Cooking ✨',
      sub: 'Prepared fresh on order using premium ingredients & traditional recipes.',
      bg: 'from-[#EA580C] via-[#E85D2A] to-[#C2410C]',
      icon: '👨‍🍳',
    },
    {
      headline: 'Signature Biryani & Karahi 🍛',
      sub: 'Fragrant basmati rice, tender meats & aromatic clay-pot gravies.',
      bg: 'from-[#D97706] via-[#B45309] to-[#92400E]',
      icon: '🍚',
    },
    {
      headline: 'Chilled Drinks & Shakes 🥤',
      sub: 'Pair your meal with fresh juices, seasonal shakes & iced tea.',
      bg: 'from-[#C2410C] via-[#EA580C] to-[#D97706]',
      icon: '🧃',
    },
    {
      headline: 'Fast & Easy Smart Dining ⚡',
      sub: 'Order directly from your table — instant kitchen sync & quick delivery.',
      bg: 'from-[#9A3412] via-[#C2410C] to-[#EA580C]',
      icon: '📱',
    },
  ], []);

  const [promoIndex, setPromoIndex] = useState(0);
  const promoTimerRef = React.useRef(null);
  const touchStartX = React.useRef(0);
  const touchEndX = React.useRef(0);

  const startAutoplay = React.useCallback(() => {
    if (promoTimerRef.current) clearInterval(promoTimerRef.current);
    promoTimerRef.current = setInterval(() => {
      setPromoIndex((prev) => (prev + 1) % promoSlides.length);
    }, 5000);
  }, [promoSlides.length]);

  useEffect(() => {
    startAutoplay();
    return () => {
      if (promoTimerRef.current) clearInterval(promoTimerRef.current);
    };
  }, [startAutoplay]);

  const goToSlide = (idx) => {
    setPromoIndex(idx);
    startAutoplay();
  };

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    const diffX = touchStartX.current - touchEndX.current;
    const minSwipeDistance = 40;

    if (diffX > minSwipeDistance) {
      goToSlide((promoIndex + 1) % promoSlides.length);
    } else if (diffX < -minSwipeDistance) {
      goToSlide((promoIndex - 1 + promoSlides.length) % promoSlides.length);
    }

    touchStartX.current = 0;
    touchEndX.current = 0;
  };

  // Category Bar Mouse Drag-to-Scroll & Wheel Scroll
  const categoryScrollRef = React.useRef(null);
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

  const handleCategoryWheel = (e) => {
    if (categoryScrollRef.current) {
      if (e.deltaY !== 0) {
        categoryScrollRef.current.scrollLeft += e.deltaY;
      }
    }
  };

  return (
    <div className="responsive-shell min-h-screen bg-[#FAF9F7] dark:bg-[#121212] text-[#171717] dark:text-[#E5E5E5] flex flex-col font-sans selection:bg-[#F97316]/20">
      {sessionExpired && (
        <div className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-8 space-y-6 text-center shadow-2xl">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-100 text-red-500 mx-auto">
              <AlertCircle className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-black text-gray-900">Session Expired</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Your dining session has expired due to inactivity. Please scan the QR code at your table to start a new session.
              </p>
            </div>
            <button
              onClick={() => {
                // Clear all session data
                localStorage.removeItem('customer_sessionId');
                localStorage.removeItem('customer_verifiedSessionId');
                localStorage.removeItem('customer_tableToken');
                localStorage.removeItem('customer_tableId');
                localStorage.removeItem('customer_cart');
                localStorage.removeItem('customer_checkoutStep');
                localStorage.removeItem('customer_category');
                setSessionExpired(false);
                setSessionId('');
                setIsSessionVerified(false);
                setCart({});
                navigate('/customer', { replace: true });
              }}
              className="w-full py-3.5 bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-500 hover:to-orange-600 text-white font-extrabold text-sm rounded-xl transition-all shadow-lg cursor-pointer"
            >
              Start New Session
            </button>
          </div>
        </div>
      )}

      {/* ── Top Application Header — Premium Redesign ───────────────────────── */}
      <header className="bg-white/80 dark:bg-[#1A1A1A]/80 backdrop-blur-xl border-b border-[#E7E5E4] dark:border-[#333] sticky top-0 z-30 shadow-sm transition-all">
        {/* Row 1: Branding + Actions */}
        <div className="px-4 sm:px-6 lg:px-8 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#E85D2A] to-[#FB923C] flex items-center justify-center text-white text-lg font-black shadow-lg shadow-[#E85D2A]/25 shrink-0">
              <Utensils className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight text-[#171717] dark:text-white leading-none">
                ZOVIKPOS
              </h2>
              <span className="text-[10px] font-bold text-[#78716C] dark:text-[#A8A29E] tracking-wide">
                Smart Dining Experience
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setTheme(current => current === 'dark' ? 'light' : 'dark')}
              className="w-10 h-10 rounded-xl border border-[#E7E5E4] dark:border-[#333] bg-white/70 dark:bg-[#242424] text-[#78716C] dark:text-[#E5E5E5] hover:border-[#E85D2A]/40 hover:text-[#E85D2A] transition-all flex items-center justify-center cursor-pointer"
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setShowFAQ(true)}
              className="w-10 h-10 sm:w-auto sm:h-auto sm:px-4 sm:py-2.5 text-xs font-bold text-[#78716C] dark:text-[#A8A29E] hover:text-[#E85D2A] hover:bg-[#E85D2A]/5 dark:hover:bg-[#E85D2A]/10 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-transparent hover:border-[#E85D2A]/20"
              title="Help & FAQ"
            >
              <HelpCircle className="w-5 h-5 sm:w-4 sm:h-4 text-[#E85D2A]" />
              <span className="hidden sm:inline">Help</span>
            </button>

            {/* Cart Header Button (Only visible after login / OTP verification) */}
            {isSessionVerified && (
              <button
                onClick={() => navigate('/customer/cart')}
                className="relative h-10 px-4 sm:px-5 sm:py-2.5 bg-[#E85D2A] hover:bg-[#D94E1B] active:scale-95 text-white rounded-2xl text-xs font-bold transition-all shadow-lg shadow-[#E85D2A]/25 flex items-center gap-2 cursor-pointer"
              >
                <ShoppingBag className="w-4 h-4" />
                <span className="hidden sm:inline">Cart</span>
                {totalCartQuantity > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-white text-[#E85D2A] w-5 h-5 rounded-full flex items-center justify-center font-black text-[10px] shadow-md ring-2 ring-[#E85D2A] animate-scale-up">
                    {totalCartQuantity}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Session Info Bar */}
        <div className="px-4 sm:px-6 lg:px-8 pb-3 flex items-center gap-2 sm:gap-3 flex-wrap text-[11px]">
          <span className="inline-flex items-center gap-1.5 bg-[#E85D2A]/10 dark:bg-[#E85D2A]/15 text-[#E85D2A] border border-[#E85D2A]/20 px-3 py-1.5 rounded-full font-extrabold uppercase tracking-wide">
            <MapPin className="w-3 h-3" />
            {tableId}
          </span>
          <span className="inline-flex items-center gap-1.5 bg-[#FAF9F7] dark:bg-[#2A2A2A] text-[#78716C] dark:text-[#A8A29E] border border-[#E7E5E4] dark:border-[#333] px-3 py-1.5 rounded-full font-bold">
            <Clock className="w-3 h-3" />
            {scanTime}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[#78716C] dark:text-[#A8A29E] font-medium">
            <User className="w-3 h-3" />
            Welcome, <strong className="text-[#171717] dark:text-white font-bold">{authName || guestName || 'Customer'}</strong>
          </span>
        </div>
      </header>

      {/* FAQ Modal */}
      {showFAQ && <FAQModal onClose={() => setShowFAQ(false)} />}

      {/* Table Switching Confirmation Modal */}
      {showTableSwitchModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-gray-100 space-y-5 animate-scale-up">
            <div className="w-12 h-12 bg-orange-50 text-[#E85D2A] rounded-2xl flex items-center justify-center mx-auto">
              <RotateCcw className="w-6 h-6" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-black text-gray-900">
                {activeOrders.length > 0
                  ? `Deliver to ${pendingTableNumber}?`
                  : totalCartQuantity > 0
                    ? `Take your cart to ${pendingTableNumber}?`
                    : `Switch to ${pendingTableNumber}?`}
              </h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                {activeOrders.length > 0 ? (
                  <>
                    You scanned <strong className="text-[#E85D2A] font-bold">{pendingTableNumber}</strong>, but you have{' '}
                    <strong className="text-emerald-700 font-bold">{activeOrders.length} active order(s)</strong>{' '}
                    placed from <strong className="text-gray-800">{currentTableSnapshot || tableId}</strong>.
                    {totalCartQuantity > 0 && (
                      <> Your cart with <strong className="text-amber-600 font-bold">{totalCartQuantity} item(s)</strong> will also move.</>
                    )}
                    {' '}Do you want to transfer your current session &amp; active orders to <strong className="text-[#E85D2A] font-bold">{pendingTableNumber}</strong>, or start a fresh session?
                  </>
                ) : totalCartQuantity > 0 ? (
                  <>
                    You have <strong className="text-amber-600 font-bold">{totalCartQuantity} item(s)</strong> in your cart from{' '}
                    <strong className="text-gray-800 font-bold">{currentTableSnapshot || tableId}</strong>. Transfer your session to{' '}
                    <strong className="text-[#E85D2A] font-bold">{pendingTableNumber}</strong> to keep your items!
                  </>
                ) : (
                  <>
                    Switch your active session from <strong className="text-gray-800 font-bold">{currentTableSnapshot || tableId}</strong> to{' '}
                    <strong className="text-[#E85D2A] font-bold">{pendingTableNumber}</strong>.
                  </>
                )}
              </p>
            </div>
            <div className="space-y-2.5 pt-2">
              {/* Primary Option 1: Move/Transfer current session & orders to new table */}
              {(activeOrders.length > 0 || totalCartQuantity > 0) && (
                <button
                  disabled={transferLoading}
                  onClick={handleTransferTableAndOrders}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all shadow-md cursor-pointer flex items-center justify-center space-x-2"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {transferLoading
                      ? 'Transferring...'
                      : activeOrders.length > 0
                        ? `Transfer Session & Orders to ${pendingTableNumber}`
                        : `Move Cart to ${pendingTableNumber}`}
                  </span>
                </button>
              )}

              {/* Primary Option 2: Start Fresh */}
              <button
                disabled={transferLoading}
                onClick={handleConfirmTableSwitch}
                className="w-full py-3 bg-[#E85D2A] hover:bg-[#D94E1B] disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all shadow-xs cursor-pointer flex items-center justify-center space-x-2"
              >
                <span>
                  {transferLoading
                    ? 'Switching...'
                    : totalCartQuantity > 0 || activeOrders.length > 0
                    ? `Start Fresh Session at ${pendingTableNumber}`
                    : `Switch to ${pendingTableNumber}`}
                </span>
              </button>

              {/* Cancel Option */}
              <button
                onClick={handleCancelTableSwitch}
                className="w-full py-2 text-gray-400 hover:text-gray-600 font-bold text-xs transition-all cursor-pointer text-center"
              >
                Cancel & Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 pb-32 sm:p-6 sm:pb-36 lg:p-8 space-y-6 dark:text-[#E5E5E5]">

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
          <div className="w-full max-w-[440px] mx-auto my-5 sm:my-8 bg-white dark:bg-[#1E1C1B] border border-[#EEE9E5] dark:border-[#383330] rounded-[28px] sm:rounded-[32px] p-5 sm:p-8 shadow-[0_24px_70px_-28px_rgba(41,25,15,0.24)] dark:shadow-[0_24px_70px_-28px_rgba(0,0,0,0.72)] text-center space-y-5 sm:space-y-6 animate-fade-in">
            <div className="w-[68px] h-[68px] bg-[#FFF4EF] dark:bg-[#3A2821] text-[#E85D2A] dark:text-[#FF9B70] rounded-[24px] flex items-center justify-center mx-auto ring-8 ring-[#E85D2A]/[0.04]">
              <ShieldCheck className="w-8 h-8" strokeWidth={2.1} />
            </div>

            <div>
              <span className="inline-flex px-3 py-1.5 bg-[#FFF0E9] dark:bg-[#3A2821] text-[#D94E1B] dark:text-[#FF9B70] rounded-full text-[10px] font-extrabold uppercase tracking-[0.09em]">
                {tableId} • Smart Dining Session
              </span>
              <h2 className="text-[25px] sm:text-[27px] font-extrabold tracking-tight text-[#171717] dark:text-white mt-3">Welcome to {tableId}</h2>
              <p className="text-[13px] text-[#78716C] dark:text-[#B8B0AA] mt-1.5 leading-[1.6] max-w-[300px] mx-auto">
                Please verify your email address to unlock the menu and place your order.
              </p>
            </div>

            {otpError && (
              <div className="p-3.5 bg-rose-50 dark:bg-rose-950/35 border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-300 rounded-2xl text-xs font-bold flex items-center space-x-2 text-left">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{otpError}</span>
              </div>
            )}

            {otpSuccess && (
              <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/35 border border-emerald-200 dark:border-emerald-900/60 text-emerald-600 dark:text-emerald-300 rounded-2xl text-xs font-bold flex items-center space-x-2 text-left">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{otpSuccess}</span>
              </div>
            )}

            {!otpSent ? (
              <form onSubmit={handleSendOtp} className="space-y-4 sm:space-y-[18px] text-left">
                <div>
                  <label className="text-xs font-semibold text-[#332E2A] dark:text-[#E7E0DB] block mb-1.5">Your Full Name</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={authName}
                      onChange={(e) => setAuthName(e.target.value)}
                      placeholder="e.g. John Doe"
                      className="w-full h-12 bg-[#FAF9F7] dark:bg-[#292725] border border-[#E7E5E4] dark:border-[#45403D] rounded-[14px] px-4 pr-11 text-[13px] text-[#171717] dark:text-[#F5F5F5] placeholder:text-[#A8A29E] focus:outline-none focus:border-[#E85D2A] focus:bg-white dark:focus:bg-[#302A27] focus:ring-4 focus:ring-[#E85D2A]/[0.08] transition-all"
                    />
                    <User className="w-[17px] h-[17px] text-[#8A817B] dark:text-[#B8B0AA] absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#332E2A] dark:text-[#E7E0DB] block mb-1.5">Email Address <span className="font-normal text-[#8A817B] dark:text-[#B8B0AA]">(for receipt &amp; code)</span></label>
                  <div className="relative">
                    <input
                      type="email"
                      required
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      placeholder="name@university.edu"
                      className="w-full h-12 bg-[#FAF9F7] dark:bg-[#292725] border border-[#E7E5E4] dark:border-[#45403D] rounded-[14px] px-4 pr-11 text-[13px] text-[#171717] dark:text-[#F5F5F5] placeholder:text-[#A8A29E] focus:outline-none focus:border-[#E85D2A] focus:bg-white dark:focus:bg-[#302A27] focus:ring-4 focus:ring-[#E85D2A]/[0.08] transition-all"
                    />
                    <Mail className="w-[17px] h-[17px] text-[#8A817B] dark:text-[#B8B0AA] absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={otpLoading || cooldown > 0}
                  className="w-full min-h-12 py-3 bg-[#E85D2A] hover:bg-[#D94E1B] active:scale-[0.99] text-white font-bold text-[13px] rounded-[14px] shadow-[0_8px_18px_-8px_rgba(232,93,42,0.65)] transition-all cursor-pointer flex items-center justify-center space-x-2 disabled:opacity-60 disabled:cursor-wait"
                >
                  {otpLoading ? (
                    <span>Sending Code...</span>
                  ) : cooldown > 0 ? (
                    <span>Try again in {cooldown}s</span>
                  ) : (
                    <>
                      <span>Send 6-Digit Code</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-4 text-left">
                <div>
                  <div className="flex flex-wrap justify-between items-center gap-x-3 gap-y-1 mb-2">
                    <label className="text-xs font-semibold text-[#332E2A] dark:text-[#E7E0DB]">Enter 6-Digit Code</label>
                    <span className="text-[10px] text-[#78716C] dark:text-[#B8B0AA] font-mono truncate max-w-full">{authEmail}</span>
                  </div>
                  <OtpInputBoxes
                    value={otpCode}
                    onChange={setOtpCode}
                    disabled={otpLoading}
                  />
                </div>

                <button
                  type="submit"
                  disabled={otpLoading || otpCode.length < 6}
                  className="w-full min-h-12 py-3 bg-[#E85D2A] hover:bg-[#D94E1B] active:scale-[0.99] text-white font-bold text-[13px] rounded-[14px] shadow-[0_8px_18px_-8px_rgba(232,93,42,0.65)] transition-all cursor-pointer flex items-center justify-center space-x-2 disabled:opacity-55 disabled:cursor-not-allowed"
                >
                  {otpLoading ? <span>Verifying...</span> : <span>Verify &amp; Enter Menu</span>}
                </button>

                <div className="flex justify-between items-center text-[11px] pt-1">
                  <button
                    type="button"
                    onClick={() => setOtpSent(false)}
                    className="text-[#78716C] dark:text-[#B8B0AA] hover:text-[#171717] dark:hover:text-white cursor-pointer"
                  >
                    Change Email
                  </button>
                  <button
                    type="button"
                    disabled={cooldown > 0 || otpLoading}
                    onClick={handleSendOtp}
                    className="text-[#E85D2A] font-bold hover:underline disabled:opacity-50 cursor-pointer"
                  >
                    {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend Code'}
                  </button>
                </div>
              </form>
            )}
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
              <div className="bg-white dark:bg-[#1E1E1E] border border-[#E85D2A]/25 dark:border-[#E85D2A]/40 p-4 sm:p-5 rounded-3xl shadow-md shadow-[#E85D2A]/8 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-orange-50/60 via-transparent to-transparent pointer-events-none" />
                <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-9 h-9 rounded-2xl bg-[#E85D2A]/10 flex items-center justify-center shrink-0">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#E85D2A] opacity-60"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#E85D2A]"></span>
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <strong className="text-sm font-black text-[#171717] dark:text-[#E5E5E5]">
                          Order {activeOrders[0].orderNumber || `#${activeOrders[0].id}`}
                        </strong>
                        <span className="px-2 py-0.5 text-[10px] font-extrabold rounded-full bg-[#E85D2A]/10 dark:bg-[#E85D2A]/20 text-[#E85D2A] dark:text-orange-400 border border-[#E85D2A]/20 uppercase tracking-wide">
                          {activeOrders[0].status}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#78716C] dark:text-[#A8A29E] mt-0.5">
                        Delivering to:{' '}
                        <strong className="text-[#171717] dark:text-white font-bold bg-[#FAF9F7] dark:bg-[#2A2A2A] px-2 py-0.5 rounded-lg border border-[#E7E5E4] dark:border-[#404040]">
                          {activeOrders[0].tableNumber || tableId}
                        </strong>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
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
                    <button
                      onClick={() => navigate(`/customer/track/${activeOrders[0].trackingToken || activeOrders[0].id}`)}
                      className="px-4 py-2 bg-[#E85D2A] hover:bg-[#D94E1B] active:scale-95 text-white font-extrabold rounded-xl text-xs transition-all shadow-md shadow-[#E85D2A]/20 cursor-pointer flex items-center gap-1.5"
                    >
                      <span>Track Order</span>
                      <ArrowRight className="w-3.5 h-3.5" />
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
                            Delivering to: <strong className="text-orange-700 bg-orange-50 px-1.5 py-0.5 rounded font-bold">{ord.tableNumber || tableId}</strong> • {ord.orderItems?.length || 0} items
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
              {/* PROMOTIONAL CAROUSEL — Auto-rotating, Touch Swipable & Fixed Uniform Sizing */}
              <div
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                className="relative overflow-hidden rounded-[28px] shadow-xl border border-white/10 select-none touch-pan-y min-h-[170px] sm:min-h-[190px] flex items-center bg-[#EA580C]"
              >
                {/* Slides */}
                {promoSlides.map((slide, idx) => (
                  <div
                    key={idx}
                    className={`${idx === promoIndex ? 'flex' : 'hidden'} w-full h-full min-h-[170px] sm:min-h-[190px] relative bg-gradient-to-br ${slide.bg} text-white px-10 py-5 sm:px-14 sm:py-6 lg:px-16 transition-all duration-500 items-center`}
                  >
                    {/* Decorative blurs */}
                    <div className="absolute top-0 right-0 w-72 h-72 bg-white/10 rounded-full blur-3xl pointer-events-none" />
                    <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-black/5 rounded-full blur-2xl pointer-events-none" />

                    <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 w-full">
                      <div className="flex-1 space-y-2">
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/15 backdrop-blur-sm rounded-full text-[10px] sm:text-[11px] font-extrabold tracking-wider uppercase border border-white/20">
                          <Sparkles className="w-3 h-3 text-amber-300" />
                          <span>ZovikPOS • Smart Dining</span>
                        </div>

                        <h1 className="text-xl sm:text-2xl lg:text-3xl font-black tracking-tight leading-tight line-clamp-1">
                          {slide.headline}
                        </h1>

                        <p className="text-[11px] sm:text-xs text-white/90 max-w-md leading-snug line-clamp-2">
                          {slide.sub}
                        </p>

                        <button
                          onClick={() => navigate('/customer/cart')}
                          className="inline-flex items-center gap-2 px-4 py-2 sm:px-5 sm:py-2.5 bg-white hover:bg-white/90 text-[#171717] font-extrabold text-xs rounded-xl shadow-xl active:scale-95 transition-all cursor-pointer mt-1"
                        >
                          <ShoppingBag className="w-3.5 h-3.5" />
                          <span>View Cart {totalCartQuantity > 0 ? `(${totalCartQuantity})` : ''}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Large emoji icon on desktop */}
                      <div className="hidden sm:flex items-center justify-center w-20 h-20 lg:w-24 lg:h-24 text-4xl lg:text-5xl bg-white/10 backdrop-blur-sm rounded-2xl border border-white/20 shadow-xl shrink-0">
                        {slide.icon}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Carousel Arrows (desktop) */}
                <button
                  onClick={() => goToSlide((promoIndex - 1 + promoSlides.length) % promoSlides.length)}
                  className="hidden sm:flex absolute left-2.5 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/20 hover:bg-white/40 backdrop-blur-sm rounded-full items-center justify-center text-white transition-all cursor-pointer z-20 shadow-md"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => goToSlide((promoIndex + 1) % promoSlides.length)}
                  className="hidden sm:flex absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/20 hover:bg-white/40 backdrop-blur-sm rounded-full items-center justify-center text-white transition-all cursor-pointer z-20 shadow-md"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>

                {/* Pagination Dots */}
                <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-20">
                  {promoSlides.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => goToSlide(idx)}
                      className={`rounded-full transition-all duration-300 cursor-pointer ${
                        idx === promoIndex
                          ? 'w-5 h-1.5 bg-white'
                          : 'w-1.5 h-1.5 bg-white/40 hover:bg-white/60'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* SEARCH BAR — PREMIUM */}
              <div className="space-y-5">
                <div className="relative group">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search for biryani, zinger burgers, chai, fries..."
                    className="w-full bg-white dark:bg-[#2A2A2A] border border-[#E7E5E4] dark:border-[#404040] rounded-2xl px-5 py-4 pl-12 text-sm text-[#171717] dark:text-[#E5E5E5] placeholder-[#A8A29E] dark:placeholder-[#6B7280] focus:outline-none focus:border-[#E85D2A] focus:ring-4 focus:ring-[#E85D2A]/10 dark:focus:ring-[#E85D2A]/20 transition-all shadow-sm hover:shadow-md font-medium"
                  />
                  <Search className="w-5 h-5 text-[#A8A29E] dark:text-[#6B7280] group-focus-within:text-[#E85D2A] absolute left-4 top-4 transition-colors" />
                </div>

                {/* CATEGORY FILTERS — Drag-To-Scroll & Mouse Wheel Scroll Enabled */}
                <div
                  ref={categoryScrollRef}
                  onMouseDown={handleCategoryMouseDown}
                  onMouseLeave={handleCategoryMouseLeave}
                  onMouseUp={handleCategoryMouseUp}
                  onMouseMove={handleCategoryMouseMove}
                  onWheel={handleCategoryWheel}
                  className="flex items-center gap-2.5 overflow-x-auto pb-2 scrollbar-none cursor-grab active:cursor-grabbing select-none"
                >
                  {combinedCategories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => {
                        if (isDraggingRef.current) return;
                        setCategory(cat);
                      }}
                      className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold whitespace-nowrap transition-all duration-200 cursor-pointer ${category === cat
                          ? 'bg-[#E85D2A] text-white shadow-md shadow-[#E85D2A]/25 border border-[#E85D2A] scale-105'
                          : 'bg-white dark:bg-[#2A2A2A] border border-[#E7E5E4] dark:border-[#404040] text-[#78716C] dark:text-[#A8A29E] hover:border-[#E85D2A]/40 hover:text-[#E85D2A]'
                        }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* FOOD PRODUCTS GRID — Premium mobile-first layout with uniform card heights */}
              {isMenuLoading && menu.length === 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="bg-white dark:bg-[#2A2A2A] rounded-2xl p-4 border border-[#E7E5E4] dark:border-[#404040] animate-pulse space-y-3">
                      <div className="w-full h-36 bg-stone-200 dark:bg-stone-700 rounded-xl" />
                      <div className="h-4 bg-stone-200 dark:bg-stone-700 rounded w-3/4" />
                      <div className="h-3 bg-stone-200 dark:bg-stone-700 rounded w-1/2" />
                    </div>
                  ))}
                </div>
              ) : filteredGrouped.length === 0 ? (
                <div className="py-16 text-center text-xs font-bold text-[#78716C] bg-white dark:bg-[#2A2A2A] border border-[#E7E5E4] dark:border-[#404040] rounded-3xl p-8 shadow-xs">
                  <div className="text-3xl mb-3">🍽️</div>
                  <p className="text-sm font-extrabold text-[#171717] dark:text-white">No dishes found</p>
                  <p className="text-xs text-[#78716C] dark:text-[#A8A29E] mt-1">Try a different category or search term.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5 items-start">
                  {filteredGrouped.map(({ groupKey, variants }, imageIndex) => {
                    const isExpanded = expandedGroup === groupKey;
                    const selectedVariant = pendingVariant[groupKey] || variants[0];
                    // Per-variant independent quantity — keyed by variant's own id
                    const currentVariantQty = pendingQty[selectedVariant.id] || 1;
                    const inCartQty = variants.reduce((sum, v) => sum + (cart[v.id]?.quantity || 0), 0);
                    const isOutOfStock = variants.every((v) => v.stock <= 0);
                    const isSelectedOutOfStock = selectedVariant.stock <= 0;

                    return (
                      <div
                        key={groupKey}
                        className={`bg-white dark:bg-[#2A2A2A] overflow-hidden flex transition-all duration-300 group ${
                          isExpanded
                            ? 'flex-col rounded-2xl border-2 border-[#E85D2A] shadow-xl ring-4 ring-[#E85D2A]/8'
                            : 'sm:flex-col flex-row rounded-2xl border border-[#E7E5E4] dark:border-[#404040] hover:border-[#E85D2A]/40 hover:shadow-lg hover:-translate-y-0.5'
                        } ${isOutOfStock ? 'opacity-60' : ''}`}
                      >
                        {/* Food Image — fixed square on mobile row, fixed ratio on tablet/desktop */}
                        <div className={`relative overflow-hidden bg-[#FAF9F7] shrink-0 ${
                          isExpanded
                            ? 'aspect-[16/9] w-full'
                            : 'w-32 h-32 sm:w-full sm:h-44 rounded-l-2xl sm:rounded-t-2xl sm:rounded-bl-none'
                        }`}>
                          <CustomerMenuImage
                            src={getItemImage(selectedVariant)}
                            alt={groupKey}
                            priority={imageIndex < 4}
                            onError={(e) => {
                              e.target.onerror = null;
                              e.target.src = 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=700&auto=format&fit=crop&q=80';
                            }}
                          />
                          {/* Gradient overlay */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-70" />
                          {/* Category Badge */}
                          <div className="absolute top-2 left-2 bg-black/55 backdrop-blur-sm text-white text-[9px] sm:text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wide">
                            {selectedVariant.category}
                          </div>
                          {/* Prep time */}
                          {selectedVariant.prepTime && (
                            <div className="absolute top-2 right-2 bg-white/95 text-[#171717] text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 shadow-sm">
                              <Clock className="w-2.5 h-2.5 text-[#E85D2A]" />
                              <span>{selectedVariant.prepTime}m</span>
                            </div>
                          )}
                          {/* In cart badge */}
                          {inCartQty > 0 && !isExpanded && (
                            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:right-2 bg-[#E85D2A] text-white text-[9px] font-black px-2 py-0.5 rounded-full shadow-md whitespace-nowrap">
                              {inCartQty} in cart
                            </div>
                          )}
                        </div>

                        {/* Card Body */}
                        <div className="p-3 sm:p-4 flex-1 flex flex-col justify-between min-w-0">
                          <div className="flex-1">
                            <h3 className="font-extrabold text-sm text-[#171717] dark:text-white group-hover:text-[#E85D2A] transition-colors leading-snug line-clamp-2">
                              {groupKey}
                            </h3>
                            {!isExpanded && (
                              <p className="text-[10px] sm:text-[11px] text-[#78716C] dark:text-[#A8A29E] mt-1 line-clamp-2 leading-relaxed">
                                {selectedVariant.description || 'Freshly prepared to order.'}
                              </p>
                            )}
                          </div>

                          {/* ── COLLAPSED STATE ── */}
                          {!isExpanded && (
                            <div className="flex items-end justify-between mt-3 pt-2.5 border-t border-[#F5F5F4] dark:border-[#333]">
                              <div>
                                <span className="text-[10px] text-[#78716C] dark:text-[#A8A29E] font-semibold block">
                                  {variants.length > 1 ? variants.map((v) => v.unit).join(' / ') : (selectedVariant.unit || '')}
                                </span>
                                <span className="text-base font-black text-[#E85D2A] leading-none">
                                  Rs. {selectedVariant.price}
                                </span>
                                {variants.length > 1 && (
                                  <span className="text-[9px] text-[#E85D2A] font-bold block mt-0.5">{variants.length} sizes ▾</span>
                                )}
                              </div>
                              {isOutOfStock ? (
                                <span className="text-[10px] font-bold text-rose-500 bg-rose-50 px-2 py-1 rounded-xl border border-rose-100">Sold Out</span>
                              ) : (
                                <button
                                  onClick={() => setExpandedGroup(groupKey)}
                                  className="w-9 h-9 sm:w-auto sm:h-auto sm:px-3.5 sm:py-2 bg-[#E85D2A] hover:bg-[#D94E1B] active:scale-90 text-white font-extrabold text-[11px] rounded-xl transition-all shadow-md shadow-[#E85D2A]/20 cursor-pointer flex items-center justify-center gap-1"
                                >
                                  <CartIcon className="w-3.5 h-3.5" />
                                  <span className="hidden sm:inline">{inCartQty > 0 ? 'More' : 'Add'}</span>
                                </button>
                              )}
                            </div>
                          )}

                          {/* ── EXPANDED STATE ── */}
                          {isExpanded && (
                            <div className="space-y-3 mt-3 pt-3 border-t border-[#F5F5F4]">
                              {/* Variant selector */}
                              {variants.length > 1 && (
                                <div>
                                  <p className="text-[10px] font-extrabold text-[#78716C] dark:text-[#A8A29E] uppercase tracking-wider mb-2">Choose Portion</p>
                                  <div className="grid grid-cols-2 gap-1.5">
                                    {variants.map((v) => (
                                      <button
                                        key={v.id}
                                        onClick={() => setPendingVariant((prev) => ({ ...prev, [groupKey]: v }))}
                                        className={`px-2.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border-2 flex flex-col items-start gap-0.5 ${
                                          selectedVariant.id === v.id
                                            ? 'bg-[#E85D2A] text-white border-[#E85D2A] shadow-md'
                                            : 'bg-[#FAF9F7] dark:bg-[#333] text-[#171717] dark:text-[#E5E5E5] border-[#E7E5E4] dark:border-[#404040] hover:border-[#E85D2A]/50'
                                        }`}
                                      >
                                        <span className="text-[11px]">{v.unit}</span>
                                        <span className={`text-[11px] font-black ${selectedVariant.id === v.id ? 'text-orange-200' : 'text-[#E85D2A]'}`}>
                                          Rs. {v.price}
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Single variant price pill */}
                              {variants.length === 1 && (
                                <div className="flex justify-between items-center px-3 py-2 bg-[#FAF9F7] dark:bg-[#333] rounded-xl border border-[#E7E5E4] dark:border-[#404040]">
                                  <span className="text-xs font-bold text-[#171717] dark:text-[#E5E5E5]">{selectedVariant.unit}</span>
                                  <span className="text-sm font-black text-[#E85D2A]">Rs. {selectedVariant.price}</span>
                                </div>
                              )}

                              {/* Quantity stepper — keyed by selectedVariant.id for independent per-variant qty */}
                              <div>
                                <p className="text-[10px] font-extrabold text-[#78716C] dark:text-[#A8A29E] uppercase tracking-wider mb-2">
                                  Quantity{variants.length > 1 ? ` — ${selectedVariant.unit}` : ''}
                                </p>
                                <div className="flex items-center gap-0 bg-[#FAF9F7] dark:bg-[#333] border border-[#E7E5E4] dark:border-[#404040] rounded-xl overflow-hidden w-fit">
                                  <button
                                    onClick={() => setPendingQty((prev) => ({ ...prev, [selectedVariant.id]: Math.max(1, (prev[selectedVariant.id] || 1) - 1) }))}
                                    disabled={currentVariantQty <= 1}
                                    className="w-11 h-11 flex items-center justify-center text-[#78716C] dark:text-[#A8A29E] hover:bg-[#E7E5E4] dark:hover:bg-[#404040] disabled:opacity-35 disabled:cursor-not-allowed transition-all cursor-pointer border-r border-[#E7E5E4] dark:border-[#404040]"
                                  >
                                    <Minus className="w-4 h-4" />
                                  </button>
                                  <span className="text-base font-black text-[#171717] dark:text-white w-14 text-center select-none">{currentVariantQty}</span>
                                  <button
                                    onClick={() => setPendingQty((prev) => ({ ...prev, [selectedVariant.id]: (prev[selectedVariant.id] || 1) + 1 }))}
                                    className="w-11 h-11 flex items-center justify-center text-[#78716C] dark:text-[#A8A29E] hover:bg-[#E7E5E4] dark:hover:bg-[#404040] transition-all cursor-pointer border-l border-[#E7E5E4] dark:border-[#404040]"
                                  >
                                    <Plus className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>

                              {/* Price preview */}
                              <div className="bg-[#FAF9F7] dark:bg-[#262626] border border-[#E7E5E4] dark:border-[#333] p-2.5 rounded-xl flex items-center justify-between">
                                <span className="text-[11px] font-extrabold text-[#78716C] dark:text-[#A8A29E]">Subtotal:</span>
                                <span className="text-sm font-black text-[#E85D2A]">
                                  Rs. {(selectedVariant.price * currentVariantQty).toLocaleString()}
                                </span>
                              </div>

                              {/* Action buttons */}
                              <div className="flex gap-2 pt-0.5">
                                <button
                                  onClick={() => setExpandedGroup(null)}
                                  className="flex-1 py-3 bg-[#FAF9F7] dark:bg-[#333] hover:bg-[#E7E5E4] dark:hover:bg-[#404040] text-[#78716C] dark:text-[#A8A29E] font-bold text-xs rounded-xl transition-all cursor-pointer border border-[#E7E5E4] dark:border-[#404040]"
                                >
                                  Cancel
                                </button>
                                <button
                                  disabled={isSelectedOutOfStock}
                                  onClick={() => handleAddWithVariantAndQty(selectedVariant, groupKey)}
                                  className="flex-[2] py-3 bg-[#E85D2A] hover:bg-[#D94E1B] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-white font-extrabold text-xs rounded-xl transition-all shadow-lg shadow-[#E85D2A]/20 cursor-pointer flex items-center justify-center gap-1.5"
                                >
                                  <CartIcon className="w-3.5 h-3.5" />
                                  <span>Add to Cart</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* STICKY CART FOOTER BAR — Ultra Clean & Compact */}
      {totalCartQuantity > 0 && isSessionVerified && (
        <div className="fixed inset-x-0 bottom-0 z-40 max-w-lg sm:max-w-xl mx-auto px-3 sm:px-4 pt-3 pb-[max(env(safe-area-inset-bottom),12px)] w-full animate-slide-up pointer-events-none">
          <div className="bg-[#171717]/95 dark:bg-[#1E1E1E]/95 text-white p-2.5 sm:p-3.5 rounded-2xl sm:rounded-3xl shadow-[0_12px_40px_rgba(0,0,0,0.32)] flex items-center justify-between border border-white/10 backdrop-blur-xl ring-1 ring-black/5 gap-2 pointer-events-auto">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              {/* Quantity Circle */}
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-[#E85D2A] text-white flex items-center justify-center font-black text-xs sm:text-sm shadow-md shadow-[#E85D2A]/30 shrink-0">
                {totalCartQuantity}
              </div>
              {/* Subtotal Label + Price in 1 Line */}
              <div className="min-w-0">
                <span className="text-[9px] sm:text-[11px] font-bold text-[#A8A29E] block uppercase tracking-wider whitespace-nowrap leading-none mb-1">
                  Cart Subtotal
                </span>
                <span className="text-[13px] sm:text-base font-black text-white font-mono whitespace-nowrap leading-none flex items-baseline gap-1">
                  <span className="text-[#E85D2A] text-[10px] sm:text-xs font-bold font-sans">Rs.</span>
                  <span>{totalCartPrice.toFixed(2)}</span>
                </span>
              </div>
            </div>

            {/* Action Button */}
            <button
              onClick={() => navigate('/customer/cart')}
              className="px-3.5 py-2.5 sm:px-5 sm:py-3 bg-[#E85D2A] hover:bg-[#D94E1B] active:scale-95 text-white font-extrabold text-[11px] sm:text-sm rounded-xl sm:rounded-2xl shadow-lg shadow-[#E85D2A]/25 transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer"
            >
              <span className="sm:hidden">Checkout</span>
              <span className="hidden sm:inline">View Cart &amp; Checkout</span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerDashboard;
