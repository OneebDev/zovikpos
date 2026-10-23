import  { useState, useEffect, useRef } from 'react';
import AdminSidebar from './AdminSidebar';
import {
  Menu,
  Building2,
  RefreshCw,
  ChevronDown,
  Check,
  Sun,
  Moon,
  LogOut,
} from 'lucide-react';
import DemoStatusBadge from '../DemoStatusBadge';
import AppBackground from '../common/AppBackground';

const AdminLayout = ({ activeTab, onSelectTab, user, onLogout, children, onRefresh, refreshing = false, branches = [], selectedBranchId = 'all', onSelectBranch }) => {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('admin_sidebar_collapsed') === 'true');
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const branchMenuRef = useRef(null);

  // Track current theme so toggle icon always reflects active theme
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    const html = document.documentElement;
    const observer = new MutationObserver(() => {
      setIsDark(html.classList.contains('dark'));
    });
    observer.observe(html, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    localStorage.setItem('admin_sidebar_collapsed', collapsed);
  }, [collapsed]);

  useEffect(() => {
    if (!branchMenuOpen) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!branchMenuRef.current?.contains(event.target)) setBranchMenuOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setBranchMenuOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [branchMenuOpen]);

  const selectedBranchName = selectedBranchId === 'all'
    ? 'All Outlets / Branches'
    : branches.find((branch) => String(branch.id) === String(selectedBranchId))?.name || 'Select Branch';



  return (
    <div className="admin-floating-root min-h-screen w-full min-w-0 text-[var(--text-main)] font-sans transition-colors duration-300 relative">
      {/* ── Background: Blurred Photo / Animated Fallback Mesh (Phase 1) ── */}
      <AppBackground />

      {/* Floating Sidebar Rail */}
      <AdminSidebar
        activeTab={activeTab}
        onSelectTab={onSelectTab}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(!collapsed)}
        isMobileOpen={isMobileOpen}
        onCloseMobile={() => setIsMobileOpen(false)}
        onLogout={onLogout}
      />

      {/* Floating Main Content Panel */}
      <div className="floating-main flex-1 flex flex-col min-w-0 transition-all duration-300 relative z-[1]">
        {/* Floating Topbar / Header */}
        <header className="floating-header staff-admin-header flex-wrap">
          <div className="staff-admin-header__controls flex flex-1 items-center gap-2 sm:gap-3 min-w-0">
            {/* Mobile Sidebar Toggle Button */}
            <button
              onClick={() => setIsMobileOpen(true)}
              className="lg:hidden p-2 rounded-xl bg-[var(--card-bg)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors cursor-pointer icon-btn"
              aria-label="Toggle Navigation Menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Dynamic Branch Selector Dropdown */}
            <div className="relative min-w-0 flex-1 sm:flex-none" ref={branchMenuRef}>
              <button
                type="button"
                onClick={() => setBranchMenuOpen((open) => !open)}
                aria-label={`Selected branch: ${selectedBranchName}`}
                aria-haspopup="listbox"
                aria-expanded={branchMenuOpen}
                className="flex w-full min-w-0 items-center gap-2 rounded-xl border border-[var(--glass-border)] glass-subtle px-3 py-2 text-left text-xs font-bold text-[var(--text-main)] shadow-sm transition hover:border-orange-400/60 focus:outline-none focus:ring-2 focus:ring-orange-500/30 sm:w-auto sm:max-w-80"
              >
                <Building2 className="h-4 w-4 shrink-0 text-orange-500" />
                <span className="min-w-0 flex-1 truncate">{selectedBranchName}</span>
                <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] transition-transform ${branchMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {branchMenuOpen && (
                <div role="listbox" aria-label="Branches" className="absolute left-0 top-[calc(100%+0.5rem)] z-50 max-h-72 w-full min-w-64 overflow-y-auto p-1.5 sm:min-w-72 glass-dropdown">
                  {[
                    { id: 'all', name: 'All Outlets / Branches' },
                    ...branches.filter((branch) => branch.isActive !== false).map((branch) => ({ id: String(branch.id), name: branch.name })),
                  ].map((branch) => {
                    const isSelected = String(selectedBranchId) === String(branch.id);
                    return (
                      <button
                        key={branch.id}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => {
                          onSelectBranch?.(branch.id);
                          setBranchMenuOpen(false);
                        }}
                        className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-semibold transition-colors ${isSelected ? 'bg-orange-500/10 text-orange-600 dark:text-orange-300' : 'text-[var(--text-main)] hover:bg-[var(--bg-color)]'}`}
                      >
                        <span className="min-w-0 flex-1 truncate">{branch.name}</span>
                        {isSelected && <Check className="h-4 w-4 shrink-0 text-orange-500" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Refresh Button */}
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={refreshing}
                aria-label={refreshing ? 'Refreshing page data' : 'Refresh page data'}
                className="p-2 shrink-0 icon-btn disabled:cursor-wait disabled:opacity-60 cursor-pointer"
                title={refreshing ? 'Refreshing page data…' : 'Refresh page data'}
              >
                <RefreshCw className={`w-4 h-4 text-orange-400 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>

          {/* Mode Indicator Badge (Demo vs Live DB), Theme Toggle, User info & Logout */}
          <div className="staff-admin-header__account flex shrink-0 items-center gap-2 sm:gap-3 self-center min-w-0">
            <DemoStatusBadge user={user} />

            {/* Theme Toggle Button — shows active theme icon highlighted */}
            <button
              onClick={() => {
                const nextTheme = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
                if (nextTheme === 'dark') document.documentElement.classList.add('dark');
                else document.documentElement.classList.remove('dark');
                localStorage.setItem('theme', nextTheme);
                window.dispatchEvent(new Event('storage'));
              }}
              className="theme-toggle-btn staff-admin-header__theme"
              aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {isDark ? (
                /* Dark mode active — show Moon icon highlighted */
                <Moon className="w-4 h-4" />
              ) : (
                /* Light mode active — show Sun icon highlighted */
                <Sun className="w-4 h-4" />
              )}
            </button>

            {/* Admin User Badge */}
            {user?.name && (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[var(--surface-inset)] border border-[var(--border-1)] text-xs min-w-0">
                <span className="font-semibold text-[var(--text-1)] truncate max-w-[120px]">{user.name}</span>
                <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-orange-500/10 text-orange-500 text-[9px] font-bold uppercase border border-orange-500/20">
                  {user.role || 'ADMIN'}
                </span>
              </div>
            )}

            {/* Logout Button */}
            {onLogout && (
              <button
                onClick={onLogout}
                className="btn-icon staff-admin-header__logout text-rose-500 hover:text-rose-600 hover:border-rose-400/40"
                aria-label="Log Out"
                title="Log Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </header>

        {/* Floating Content Body */}
        <div className="floating-content">
          <main className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl w-full mx-auto min-w-0 animate-fade-in">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
};

export default AdminLayout;
