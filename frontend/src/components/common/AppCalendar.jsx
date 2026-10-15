import React, { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  Filter,
  Search,
  List,
  Grid3X3,
  CalendarDays,
  CalendarRange,
  X,
  ExternalLink,
  ChevronDown
} from 'lucide-react';

const VIEW_MONTH = 'MONTH';
const VIEW_WEEK = 'WEEK';
const VIEW_DAY = 'DAY';
const VIEW_AGENDA = 'AGENDA';

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Universal Global Application Calendar Component
 * Matches dark theme, orange/amber accents, responsive layout.
 * Supports Month, Week, Day, and Agenda views.
 *
 * @param {Array} events - Array of { id, title, date, time, status, type, severity, meta, rawData }
 * @param {Function} onSelectEvent - Callback when an event card/item is clicked
 * @param {Array} filterOptions - Optional type/status filter categories
 * @param {String} activeCategory - Controlled active category
 * @param {Function} onChangeCategory - Callback to change category
 * @param {String} title - Heading label
 * @param {String} subtitle - Subheading description
 */
const AppCalendar = ({
  events = [],
  onSelectEvent,
  onSelectDate,
  filterOptions = [],
  activeCategory = 'ALL',
  onChangeCategory,
  title = 'Application Calendar',
  subtitle = 'Schedule, real-time activity and date-wise record tracking',
  badgeCount = null,
  headerActions = null
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentView, setCurrentView] = useState(VIEW_MONTH);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEventModal, setSelectedEventModal] = useState(null);

  // Month navigation
  const prevPeriod = () => {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      if (currentView === VIEW_MONTH) {
        d.setMonth(d.getMonth() - 1);
      } else if (currentView === VIEW_WEEK) {
        d.setDate(d.getDate() - 7);
      } else {
        d.setDate(d.getDate() - 1);
      }
      return d;
    });
  };

  const nextPeriod = () => {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      if (currentView === VIEW_MONTH) {
        d.setMonth(d.getMonth() + 1);
      } else if (currentView === VIEW_WEEK) {
        d.setDate(d.getDate() + 7);
      } else {
        d.setDate(d.getDate() + 1);
      }
      return d;
    });
  };

  const jumpToToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(today);
  };

  const isSameDay = (d1, d2) => {
    if (!d1 || !d2) return false;
    const a = new Date(d1);
    const b = new Date(d2);
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  };

  // Filter events based on active category & search query
  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      const matchesCategory =
        !activeCategory ||
        activeCategory === 'ALL' ||
        ev.type === activeCategory ||
        ev.status === activeCategory;

      const matchesSearch =
        !searchQuery ||
        ev.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ev.status?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ev.id?.toString().includes(searchQuery);

      return matchesCategory && matchesSearch;
    });
  }, [events, activeCategory, searchQuery]);

  // Compute month matrix
  const monthDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInCurrentMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const days = [];

    // Previous month padding
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, daysInPrevMonth - i),
        isCurrentMonth: false,
      });
    }

    // Current month days
    for (let day = 1; day <= daysInCurrentMonth; day++) {
      days.push({
        date: new Date(year, month, day),
        isCurrentMonth: true,
      });
    }

    // Next month padding (complete grid to multiple of 7)
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      days.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false,
      });
    }

    return days;
  }, [currentDate]);

  // Events grouped by date string (YYYY-MM-DD)
  const eventsByDate = useMemo(() => {
    const map = new Map();
    filteredEvents.forEach((ev) => {
      if (!ev.date) return;
      const d = new Date(ev.date);
      if (isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(ev);
    });
    return map;
  }, [filteredEvents]);

  const getEventsForDay = (d) => {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return eventsByDate.get(key) || [];
  };

  const getSeverityStyle = (severity = 'default', status = '') => {
    const s = String(status || severity).toUpperCase();
    if (s.includes('EXPIRED') || s.includes('CRITICAL') || s.includes('FAILED') || s.includes('CANCELLED')) {
      return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
    }
    if (s.includes('TODAY') || s.includes('HIGH') || s.includes('URGENT') || s.includes('PREPARING')) {
      return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
    }
    if (s.includes('PAID') || s.includes('COMPLETED') || s.includes('RECEIVED') || s.includes('FRESH')) {
      return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
    }
    if (s.includes('DRAFT') || s.includes('PENDING')) {
      return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
    }
    return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
  };

  const handleCardClick = (ev) => {
    if (onSelectEvent) {
      onSelectEvent(ev);
    } else {
      setSelectedEventModal(ev);
    }
  };

  return (
    <div className="space-y-4">
      {/* Calendar Top Toolbar */}
      <div className="bg-[#141518] border border-stone-800/80 rounded-3xl p-5 shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left: Heading & Status */}
        <div className="flex items-center space-x-3.5">
          <div className="p-3 rounded-2xl bg-orange-500/10 border border-orange-500/20 text-orange-400">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2.5">
              <h2 className="text-lg font-black text-stone-100 font-display tracking-tight">
                {title}
              </h2>
              {badgeCount !== null && (
                <span className="px-2.5 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20 text-[11px] font-black">
                  {badgeCount}
                </span>
              )}
            </div>
            <p className="text-xs text-stone-400 mt-0.5">{subtitle}</p>
          </div>
        </div>

        {/* Center / Right Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search records / events..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-1.5 bg-stone-900/90 border border-stone-800 rounded-xl text-xs text-stone-200 focus:outline-none focus:border-orange-500 transition-colors w-44 sm:w-56"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Category Filter dropdown/buttons if provided */}
          {filterOptions && filterOptions.length > 0 && (
            <div className="flex items-center bg-stone-900 border border-stone-800 rounded-xl p-0.5">
              {filterOptions.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => onChangeCategory && onChangeCategory(opt.key)}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    activeCategory === opt.key
                      ? 'bg-orange-500 text-stone-950 shadow'
                      : 'text-stone-400 hover:text-stone-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* View Mode Switcher */}
          <div className="flex items-center bg-stone-900 border border-stone-800 rounded-xl p-0.5">
            <button
              onClick={() => setCurrentView(VIEW_MONTH)}
              title="Month View"
              className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                currentView === VIEW_MONTH ? 'bg-orange-500 text-stone-950' : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              <Grid3X3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentView(VIEW_AGENDA)}
              title="Agenda / Timeline List"
              className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                currentView === VIEW_AGENDA ? 'bg-orange-500 text-stone-950' : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          {/* Today Button & Navigation */}
          <div className="flex items-center space-x-1 bg-stone-900 border border-stone-800 rounded-xl p-0.5">
            <button
              onClick={prevPeriod}
              className="p-1.5 rounded-lg text-stone-400 hover:text-stone-200 hover:bg-stone-800 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={jumpToToday}
              className="px-2.5 py-1 text-xs font-bold text-stone-300 hover:text-orange-400 hover:bg-stone-800 rounded-lg transition-colors cursor-pointer"
            >
              Today
            </button>
            <button
              onClick={nextPeriod}
              className="p-1.5 rounded-lg text-stone-400 hover:text-stone-200 hover:bg-stone-800 transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Extra header actions (e.g. Export, Add) */}
          {headerActions}
        </div>
      </div>

      {/* Current Month & Year Display Banner */}
      <div className="flex items-center justify-between px-2">
        <h3 className="text-base font-extrabold text-stone-200 font-display flex items-center space-x-2">
          <span>
            {MONTH_NAMES[currentDate.getMonth()]} {currentDate.getFullYear()}
          </span>
          <span className="text-xs font-bold text-stone-500">
            • {filteredEvents.length} Active Records
          </span>
        </h3>
      </div>

      {/* MONTH VIEW */}
      {currentView === VIEW_MONTH && (
        <div className="app-calendar-month overflow-x-auto bg-[#141518] border border-stone-800/80 rounded-3xl shadow-2xl">
          {/* Days of Week Header */}
          <div className="app-calendar-month-grid grid grid-cols-7 border-b border-stone-800/90 bg-stone-900/60">
            {DAYS_OF_WEEK.map((d, i) => (
              <div
                key={d}
                className={`py-2.5 text-center text-xs font-black uppercase tracking-wider ${
                  i === 0 || i === 6 ? 'text-orange-400/80' : 'text-stone-400'
                }`}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="app-calendar-month-grid grid grid-cols-7 divide-x divide-y divide-stone-800/60">
            {monthDays.map((cell, idx) => {
              const dayEvents = getEventsForDay(cell.date);
              const isToday = isSameDay(cell.date, new Date());
              const isSelected = isSameDay(cell.date, selectedDate);

              return (
                <div
                  key={idx}
                  onClick={() => {
                    setSelectedDate(cell.date);
                    if (onSelectDate) {
                      const ds = `${cell.date.getFullYear()}-${String(cell.date.getMonth() + 1).padStart(2, '0')}-${String(cell.date.getDate()).padStart(2, '0')}`;
                      onSelectDate(ds);
                    }
                  }}
                  className={`min-h-[105px] p-2 flex flex-col justify-between transition-colors cursor-pointer ${
                    !cell.isCurrentMonth
                      ? 'bg-stone-950/40 text-stone-600'
                      : isSelected
                      ? 'bg-orange-500/5'
                      : 'bg-stone-900/20 hover:bg-stone-900/40'
                  }`}
                >
                  {/* Date badge */}
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-bold px-1.5 py-0.5 rounded-lg ${
                        isToday
                          ? 'bg-orange-500 text-stone-950 font-black shadow-md'
                          : cell.isCurrentMonth
                          ? 'text-stone-300'
                          : 'text-stone-600'
                      }`}
                    >
                      {cell.date.getDate()}
                    </span>

                    {dayEvents.length > 0 && (
                      <span className="text-[10px] font-extrabold text-amber-400 bg-amber-500/10 px-1.5 py-0.2 rounded-full border border-amber-500/20">
                        {dayEvents.length}
                      </span>
                    )}
                  </div>

                  {/* Day Events Preview (max 3) */}
                  <div className="mt-1.5 space-y-1 flex-1">
                    {dayEvents.slice(0, 3).map((ev) => (
                      <div
                        key={ev.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCardClick(ev);
                        }}
                        className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border truncate transition-transform hover:scale-[1.02] cursor-pointer ${getSeverityStyle(
                          ev.severity,
                          ev.status
                        )}`}
                        title={`${ev.title} (${ev.time || ev.status || ''})`}
                      >
                        {ev.time && <span className="mr-1 opacity-75">{ev.time}</span>}
                        {ev.title}
                      </div>
                    ))}

                    {dayEvents.length > 3 && (
                      <div className="text-[10px] text-stone-400 font-bold px-1 hover:text-orange-400">
                        +{dayEvents.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Selected Day Events Panel (Month view) */}
      {currentView === VIEW_MONTH && (() => {
        const selEvents = getEventsForDay(selectedDate);
        const selDateStr = selectedDate.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        return (
          <div className="bg-[#141518] border border-stone-800/80 rounded-3xl p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <CalendarDays className="w-4 h-4 text-orange-400" />
                <span className="text-sm font-black text-stone-200">{selDateStr}</span>
                <span className="px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20 text-[10px] font-black">
                  {selEvents.length} {selEvents.length === 1 ? 'record' : 'records'}
                </span>
              </div>
              {onSelectDate && selEvents.length > 0 && (
                <button
                  onClick={() => {
                    const ds = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
                    onSelectDate(ds);
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-black transition-all shadow cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  View All ({selEvents.length}) in List
                </button>
              )}
            </div>

            {selEvents.length === 0 ? (
              <div className="py-10 text-center text-xs font-bold text-stone-500 flex flex-col items-center gap-2">
                <CalendarDays className="w-8 h-8 opacity-30" />
                <p>No records on this date</p>
                <p className="text-stone-600 font-normal">Select a day with events (shown in orange) to view details</p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                {selEvents.map((ev) => (
                  <div
                    key={ev.id}
                    onClick={() => handleCardClick(ev)}
                    className={`p-3 rounded-2xl border cursor-pointer transition-all hover:scale-[1.02] hover:shadow-lg ${getSeverityStyle(ev.severity, ev.status)}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      {ev.time && <span className="text-[10px] font-bold opacity-70">{ev.time}</span>}
                      {ev.status && (
                        <span className="text-[9px] font-black uppercase tracking-wider opacity-80 ml-auto">
                          {ev.status}
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-bold truncate">{ev.title}</p>
                    {ev.subtitle && <p className="text-[10px] opacity-60 mt-0.5 truncate">{ev.subtitle}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* AGENDA / LIST VIEW */}
      {currentView === VIEW_AGENDA && (
        <div className="bg-[#141518] border border-stone-800/80 rounded-3xl p-5 shadow-2xl space-y-4">
          {filteredEvents.length === 0 ? (
            <div className="py-16 text-center text-xs font-bold text-stone-500">
              No calendar events found matching the selected filters.
            </div>
          ) : (
            <div className="divide-y divide-stone-800/80">
              {filteredEvents.map((ev) => (
                <div
                  key={ev.id}
                  onClick={() => handleCardClick(ev)}
                  className="py-3.5 px-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-stone-900/50 rounded-2xl transition-colors cursor-pointer group"
                >
                  <div className="flex items-start space-x-3.5">
                    <div className="p-2.5 rounded-xl bg-stone-900 border border-stone-800 text-orange-400 shrink-0 mt-0.5">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-black text-stone-200 group-hover:text-orange-400 transition-colors">
                          {ev.title}
                        </span>
                        {ev.status && (
                          <span
                            className={`px-2 py-0.2 rounded text-[10px] font-bold border uppercase ${getSeverityStyle(
                              ev.severity,
                              ev.status
                            )}`}
                          >
                            {ev.status}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-stone-400 mt-0.5">
                        {ev.subtitle || ev.description || 'Record details'}
                      </p>
                      <div className="flex items-center space-x-3 text-[11px] text-stone-500 mt-1">
                        <span>Date: {new Date(ev.date).toLocaleDateString()}</span>
                        {ev.time && <span>• Time: {ev.time}</span>}
                        {ev.branchName && <span>• Branch: {ev.branchName}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center">
                    <span className="text-xs font-bold text-orange-400 flex items-center space-x-1 group-hover:translate-x-0.5 transition-transform">
                      <span>View Record</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Selected Event Details Modal (Fallback if no custom handler provided) */}
      {selectedEventModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div
            className="w-full max-w-md bg-[#141518] border border-stone-800 rounded-3xl shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <h4 className="text-sm font-extrabold text-stone-100 font-display">
                Record Event Details
              </h4>
              <button
                onClick={() => setSelectedEventModal(null)}
                className="p-1 rounded-lg hover:bg-stone-800 text-stone-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-3 bg-stone-900 rounded-2xl border border-stone-800 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-stone-400">Event:</span>
                  <span className="font-bold text-stone-100">{selectedEventModal.title}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-400">Date:</span>
                  <span className="font-bold text-stone-200">
                    {new Date(selectedEventModal.date).toLocaleDateString()}
                  </span>
                </div>
                {selectedEventModal.status && (
                  <div className="flex justify-between">
                    <span className="text-stone-400">Status:</span>
                    <span className="font-bold text-orange-400">{selectedEventModal.status}</span>
                  </div>
                )}
                {selectedEventModal.description && (
                  <p className="text-stone-300 pt-1 border-t border-stone-800">
                    {selectedEventModal.description}
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setSelectedEventModal(null)}
                className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-bold rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppCalendar;
