import { useState, useRef, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  X
} from 'lucide-react';

const DAYS_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const toDateStr = (d) => {
  if (!d) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Shared by dashboard, orders, payments, and reports date filters.
// eslint-disable-next-line react-refresh/only-export-components
export const getPresetRange = (preset) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = toDateStr(today);

  if (preset === 'TODAY') return { from: todayStr, to: todayStr };
  if (preset === 'YESTERDAY') {
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    const s = toDateStr(y);
    return { from: s, to: s };
  }
  if (preset === 'LAST_7') {
    const s = new Date(today);
    s.setDate(s.getDate() - 6);
    return { from: toDateStr(s), to: todayStr };
  }
  if (preset === 'THIS_MONTH') {
    const s = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: toDateStr(s), to: todayStr };
  }
  if (preset === 'LAST_MONTH') {
    const s = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const e = new Date(today.getFullYear(), today.getMonth(), 0);
    return { from: toDateStr(s), to: toDateStr(e) };
  }
  return null;
};

/**
 * Standard Unified Date Range Picker Component with Custom Dual-Click Calendar Popover
 * Matches premium POS theme (dark/light tokens, orange highlights).
 */
const DateRangeFilterBar = ({
  preset = 'ALL',
  onPresetChange,
  customFrom = '',
  customTo = '',
  onCustomRangeChange,
  presets = [
    { key: 'ALL', label: 'All Time' },
    { key: 'TODAY', label: 'Today' },
    { key: 'YESTERDAY', label: 'Yesterday' },
    { key: 'LAST_7', label: 'Last 7 Days' },
    { key: 'THIS_MONTH', label: 'This Month' },
    { key: 'LAST_MONTH', label: 'Last Month' },
    { key: 'CUSTOM', label: 'Custom Range' },
  ]
}) => {
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(new Date());
  const [hoverDate, setHoverDate] = useState(null);
  const popoverRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setShowPicker(false);
      }
    };
    if (showPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showPicker]);

  const year = pickerMonth.getFullYear();
  const month = pickerMonth.getMonth();

  const prevMonth = () => {
    setPickerMonth(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setPickerMonth(new Date(year, month + 1, 1));
  };

  // Generate calendar days for current month
  const firstDayIndex = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const calendarDays = [];
  for (let i = 0; i < firstDayIndex; i++) {
    calendarDays.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    calendarDays.push(new Date(year, month, d));
  }

  const handleDayClick = (date) => {
    if (!date) return;
    const dateStr = toDateStr(date);

    if (!customFrom || (customFrom && customTo)) {
      // First click in range
      if (onPresetChange) onPresetChange('CUSTOM');
      if (onCustomRangeChange) onCustomRangeChange(dateStr, '');
    } else if (customFrom && !customTo) {
      // Second click
      if (dateStr < customFrom) {
        if (onCustomRangeChange) onCustomRangeChange(dateStr, customFrom);
      } else {
        if (onCustomRangeChange) onCustomRangeChange(customFrom, dateStr);
      }
      setShowPicker(false);
    }
  };

  const isSelected = (date) => {
    if (!date) return false;
    const s = toDateStr(date);
    return s === customFrom || s === customTo;
  };

  const isInRange = (date) => {
    if (!date) return false;
    const s = toDateStr(date);
    if (customFrom && customTo) {
      return s >= customFrom && s <= customTo;
    }
    if (customFrom && hoverDate && !customTo) {
      const start = customFrom < hoverDate ? customFrom : hoverDate;
      const end = customFrom < hoverDate ? hoverDate : customFrom;
      return s >= start && s <= end;
    }
    return false;
  };

  const isToday = (date) => {
    if (!date) return false;
    return toDateStr(date) === toDateStr(new Date());
  };

  const displayRangeStr = () => {
    if (preset !== 'CUSTOM') {
      const r = getPresetRange(preset);
      if (!r) return null;
      return r.from === r.to ? r.from : `${r.from} → ${r.to}`;
    }
    if (customFrom && customTo) {
      return customFrom === customTo ? customFrom : `${customFrom} → ${customTo}`;
    }
    if (customFrom) {
      return `${customFrom} → Pick End Date`;
    }
    return 'Select Range';
  };

  return (
    <div className="bg-[var(--bg-color)]/55 border border-[var(--border-color)] rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 relative shadow-sm">
      {/* Label */}
      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] shrink-0 sm:w-24">
        <CalendarIcon className="w-3.5 h-3.5 text-orange-500" />
        <span>Date Range:</span>
      </div>

      {/* Preset Buttons */}
      <div className="flex flex-1 items-center flex-wrap gap-2">
        {presets.map((p) => {
          const isActive = preset === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => {
                if (p.key === 'CUSTOM') {
                  if (onPresetChange) onPresetChange('CUSTOM');
                  setShowPicker(true);
                } else {
                  if (onPresetChange) onPresetChange(p.key);
                  if (onCustomRangeChange) onCustomRangeChange('', '');
                  setShowPicker(false);
                }
              }}
              className={`px-3.5 py-2 rounded-xl text-[11px] font-bold tracking-wide transition-all cursor-pointer whitespace-nowrap border ${
                isActive
                  ? 'bg-orange-500 text-white border-orange-500 shadow-md shadow-orange-500/20 ring-2 ring-orange-500/20'
                  : 'text-[var(--text-muted)] border-[var(--border-color)] bg-[var(--card-bg)]/60 hover:text-[var(--text-main)] hover:bg-[var(--bg-color)] hover:border-orange-500/40'
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Custom Calendar Trigger & Input View */}
      <div className="sm:ml-auto flex items-center gap-2 relative" ref={popoverRef}>
        <button
          type="button"
          onClick={() => {
            if (preset !== 'CUSTOM' && onPresetChange) onPresetChange('CUSTOM');
            setShowPicker(!showPicker);
          }}
          className={`flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer min-w-36 ${
            preset === 'CUSTOM' || (customFrom && customTo)
              ? 'bg-orange-500/10 border-orange-500/40 text-orange-400'
              : 'bg-[var(--bg-color)] border-[var(--border-color)] text-[var(--text-muted)] hover:border-orange-500/40'
          }`}
        >
          <CalendarIcon className="w-3.5 h-3.5 text-orange-400" />
          <span>{displayRangeStr() || 'Choose dates'}</span>
        </button>

        {/* Clear Button */}
        {(preset !== 'ALL' || customFrom || customTo) && (
          <button
            type="button"
            title="Reset to All Time"
            onClick={() => {
              if (onPresetChange) onPresetChange('ALL');
              if (onCustomRangeChange) onCustomRangeChange('', '');
              setShowPicker(false);
            }}
            className="p-1.5 rounded-xl bg-[var(--bg-color)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-rose-400 hover:border-rose-500/30 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Interactive Dual-Click Calendar Popover */}
        {showPicker && (
          <div className="absolute left-0 right-auto sm:left-auto sm:right-0 top-full mt-2 z-[100] w-[min(18rem,calc(100vw-2rem))] sm:w-80 max-w-[calc(100vw-2rem)] bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl shadow-2xl p-4 backdrop-blur-xl animate-scale-up">
            {/* Popover Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-color)]">
              <span className="text-xs font-black text-[var(--text-main)] font-display">
                {MONTH_NAMES[month]} {year}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={prevMonth}
                  className="p-1 rounded-lg hover:bg-[var(--bg-color)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={nextMonth}
                  className="p-1 rounded-lg hover:bg-[var(--bg-color)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Days of Week Header */}
            <div className="grid grid-cols-7 gap-1 text-center py-2 text-[10px] font-black uppercase text-[var(--text-muted)]">
              {DAYS_SHORT.map((d, i) => (
                <div key={i}>{d}</div>
              ))}
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((date, idx) => {
                if (!date) {
                  return <div key={idx} className="h-8" />;
                }
                const selected = isSelected(date);
                const inRange = isInRange(date);
                const today = isToday(date);

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleDayClick(date)}
                    onMouseEnter={() => setHoverDate(toDateStr(date))}
                    className={`h-8 rounded-lg text-xs font-bold transition-all flex items-center justify-center cursor-pointer ${
                      selected
                        ? 'bg-orange-500 text-white font-black shadow-md shadow-orange-500/30'
                        : inRange
                        ? 'bg-orange-500/20 text-orange-300'
                        : today
                        ? 'border border-orange-500/50 text-orange-400 font-extrabold'
                        : 'text-[var(--text-main)] hover:bg-[var(--bg-color)]'
                    }`}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>

            {/* Range Selection Instructions / Quick Controls */}
            <div className="mt-3 pt-3 border-t border-[var(--border-color)] flex items-center justify-between text-[10px]">
              <span className="text-[var(--text-muted)]">
                {customFrom && !customTo ? 'Click second date for range end' : 'Click start date'}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const todayStr = toDateStr(new Date());
                    if (onCustomRangeChange) onCustomRangeChange(todayStr, todayStr);
                    setShowPicker(false);
                  }}
                  className="px-2 py-0.5 rounded text-orange-400 font-bold hover:bg-orange-500/10 cursor-pointer"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => setShowPicker(false)}
                  className="px-2 py-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DateRangeFilterBar;
