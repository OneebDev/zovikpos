import React, { useState, useEffect } from 'react';
import AdminSidebar from './AdminSidebar';
import {
  Menu,
  Sun,
  Moon,
  Search,
  Bell,
  Building2,
  User,
  Shield,
  RefreshCw,
} from 'lucide-react';
import DemoStatusBadge from '../DemoStatusBadge';

const titleMap = {
  dashboard: 'Executive Dashboard Overview',
  orders: 'Orders Management & Transactions',
  payments: 'Payment Monitoring & Verification',
  menu: 'Menu Catalog & Categories',
  inventory: 'Stock Inventory & Audit Logs',
  staff: 'Staff Account Management & Roles',
  customers: 'Customer Roster & Analytics',
  tables: 'Tables & Cryptographic QR Cards',
  kitchen: 'Kitchen Live Operations Monitor',
  'payment-availability': 'Payment Availability Controls',
  notifications: 'System Notifications & Alerts Center',
  'ai-insights': 'AI Demand Forecasts & Analytics',
  reports: 'Executive Reports & Analytics',
  'audit-logs': 'System Immutable Audit Logs',
  'order-history': 'Order Status Transition Timeline',
  branches: 'Branch Management & Outlets',
};

const AdminLayout = ({ activeTab, onSelectTab, user, onLogout, children, onRefresh, branches = [], selectedBranchId = 'all', onSelectBranch }) => {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('admin_sidebar_collapsed') === 'true');
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    localStorage.setItem('admin_sidebar_collapsed', collapsed);
  }, [collapsed]);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('theme', nextTheme);
    const root = window.document.documentElement;
    if (nextTheme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  };

  return (
    <div className="responsive-shell admin-responsive min-h-screen w-full min-w-0 bg-[var(--bg-color)] text-[var(--text-main)] flex font-sans transition-colors duration-300">
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
        className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${
          collapsed ? 'lg:ml-20' : 'lg:ml-64'
        }`}
      >
        {/* Main Content Canvas */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl w-full mx-auto animate-fade-in">
          {/* Action Toolbar: Branch Selector & Refresh Button */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 pb-4 border-b border-[var(--border-color)]">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 w-full sm:w-auto">
              {/* Mobile Sidebar Toggle Button */}
              <button
                onClick={() => setIsMobileOpen(true)}
                className="lg:hidden p-2 rounded-xl bg-[var(--card-bg)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors cursor-pointer"
              >
                <Menu className="w-5 h-5" />
              </button>

              {/* Dynamic Branch Selector Dropdown */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--card-bg)] border border-[var(--border-color)] text-xs text-[var(--text-muted)] font-bold shadow-sm min-w-0 flex-1 sm:flex-none">
                <Building2 className="w-4 h-4 text-orange-400 shrink-0" />
                <select
                  value={selectedBranchId}
                  onChange={(e) => onSelectBranch && onSelectBranch(e.target.value)}
                  className="bg-transparent text-[var(--text-main)] focus:outline-none cursor-pointer font-bold min-w-0 w-full sm:w-auto"
                >
                  <option value="all">All Outlets / Branches</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Refresh Button */}
              {onRefresh && (
                <button
                  onClick={onRefresh}
                  className="p-2 shrink-0 rounded-xl bg-[var(--card-bg)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors cursor-pointer shadow-sm hover:border-orange-500/40"
                  title="Refresh Page Data"
                >
                  <RefreshCw className="w-4 h-4 text-orange-400" />
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
