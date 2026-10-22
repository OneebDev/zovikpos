import  { useState, useEffect, useRef } from 'react';
import AdminSidebar from './AdminSidebar';
import {
  Menu,
  Building2,
  RefreshCw,
  ChevronDown,
  Check,
} from 'lucide-react';
import DemoStatusBadge from '../DemoStatusBadge';

const AdminLayout = ({ activeTab, onSelectTab, user, onLogout, children, onRefresh, refreshing = false, branches = [], selectedBranchId = 'all', onSelectBranch }) => {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('admin_sidebar_collapsed') === 'true');
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const branchMenuRef = useRef(null);

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
    <div className="responsive-shell admin-responsive min-h-screen w-full min-w-0 text-[var(--text-main)] flex font-sans transition-colors duration-300 relative">
      {/* ── Animated Textured Background (Phase 3) ── */}
      <div className="app-bg" aria-hidden="true">
        <div className="app-bg__gradient" />
        <div className="app-bg__blob app-bg__blob--orange" />
        <div className="app-bg__blob app-bg__blob--blue" />
        <div className="app-bg__blob app-bg__blob--violet" />
        <div className="app-bg__dots" />
        <div className="app-bg__grain" />
        <div className="app-bg__glow" />
      </div>
      {/* Sidebar */}
      <AdminSidebar
        activeTab={activeTab}
        onSelectTab={onSelectTab}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(!collapsed)}
        isMobileOpen={isMobileOpen}
        onCloseMobile={() => setIsMobileOpen(false)}
        onLogout={onLogout}
      />

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col min-w-0 overflow-x-auto transition-all duration-300 relative z-[1] ${
          collapsed ? 'lg:ml-20' : 'lg:ml-64'
        }`}
      >
        {/* Main Content Canvas */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl w-full mx-auto min-w-0 animate-fade-in">
          {/* Action Toolbar: Branch Selector & Refresh Button */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 pb-4 border-b border-[var(--glass-border-subtle)]">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 w-full sm:w-auto">
              {/* Mobile Sidebar Toggle Button */}
              <button
                onClick={() => setIsMobileOpen(true)}
                className="lg:hidden p-2 rounded-xl bg-[var(--card-bg)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors cursor-pointer icon-btn"
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

            {/* Mode Indicator Badge (Demo vs Live DB) */}
            <div className="flex items-center gap-3 self-end sm:self-auto">
              <DemoStatusBadge user={user} />
            </div>
          </div>

          {children}
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
