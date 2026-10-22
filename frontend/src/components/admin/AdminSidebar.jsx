import 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  CreditCard,
  UtensilsCrossed,
  Package,
  Users,
  UserCheck,
  QrCode,
  ChefHat,
  Banknote,
  Bell,
  BrainCircuit,
  FileBarChart,
  ShieldCheck,
  History,
  Building2,
  ChevronLeft,
  ChevronRight,
  LogOut,
} from 'lucide-react';

const navGroups = [
  {
    title: 'MAIN',
    items: [
      { id: 'dashboard', label: 'Dashboard', path: '/admin', icon: LayoutDashboard },
      { id: 'orders', label: 'Orders', path: '/admin/orders', icon: ShoppingCart },
      { id: 'payments', label: 'Payments', path: '/admin/payments', icon: CreditCard },
    ],
  },
  {
    title: 'MANAGEMENT',
    items: [
      { id: 'menu', label: 'Menu Management', path: '/admin/menu', icon: UtensilsCrossed },
      { id: 'inventory', label: 'Inventory', path: '/admin/inventory', icon: Package },
      { id: 'staff', label: 'Staff Accounts', path: '/admin/staff', icon: Users },
      { id: 'customers', label: 'Customers', path: '/admin/customers', icon: UserCheck },
      { id: 'tables', label: 'Tables & QR', path: '/admin/tables', icon: QrCode },
    ],
  },
  {
    title: 'OPERATIONS',
    items: [
      { id: 'kitchen', label: 'Kitchen Monitor', path: '/admin/kitchen', icon: ChefHat },
      { id: 'payment-availability', label: 'Payment Availability', path: '/admin/payment-availability', icon: Banknote },
      { id: 'notifications', label: 'Notifications / Alerts', path: '/admin/notifications', icon: Bell },
    ],
  },
  {
    title: 'ANALYTICS',
    items: [
      { id: 'ai-insights', label: 'AI Insights', path: '/admin/ai-insights', icon: BrainCircuit },
      { id: 'reports', label: 'Reports', path: '/admin/reports', icon: FileBarChart },
    ],
  },
  {
    title: 'SYSTEM',
    items: [
      { id: 'audit-logs', label: 'Audit Logs', path: '/admin/audit-logs', icon: ShieldCheck },
      { id: 'order-history', label: 'Order Status History', path: '/admin/order-history', icon: History },
    ],
  },
  {
    title: 'FUTURE / BRANCH',
    items: [
      { id: 'branches', label: 'Branches', path: '/admin/branches', icon: Building2 },
    ],
  },
];

const AdminSidebar = ({ activeTab, onSelectTab, collapsed, onToggleCollapse, isMobileOpen, onCloseMobile, onLogout }) => {
  return (
    <>
      {/* Mobile Drawer Overlay */}
      {isMobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 glass-overlay z-40 lg:hidden"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`admin-sidebar fixed top-0 left-0 bottom-0 z-50 flex flex-col transition-all duration-300 shadow-2xl ${
          collapsed ? 'w-20' : 'w-64'
        } ${
          isMobileOpen ? 'translate-x-0 w-64' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Sidebar Header Brand */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-[var(--glass-border-subtle)] shrink-0">
          <div className="flex items-center space-x-3 overflow-hidden">
            <img src="/favicon.svg" alt="ZovikPOS logo" className="w-10 h-10 rounded-xl shrink-0 shadow-lg shadow-orange-600/30" />
            {!collapsed && (
              <div className="animate-fade-in truncate">
                <h1 className="font-extrabold text-sm text-[var(--text-main)] tracking-tight font-display">ZOVIKPOS</h1>
                <p className="text-[10px] text-orange-400 font-bold uppercase tracking-wider">Enterprise POS</p>
              </div>
            )}
          </div>

          {/* Desktop Collapse Toggle */}
          <button
            onClick={onToggleCollapse}
            className="hidden lg:flex p-1.5 rounded-lg bg-[var(--bg-color)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors cursor-pointer"
            title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Sidebar Navigation Items */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-6 custom-scrollbar">
          {navGroups.map((group, groupIdx) => (
            <div key={groupIdx} className="space-y-1">
              {!collapsed && (
                <div className="px-3 text-[10px] font-black tracking-widest text-[var(--text-muted)] uppercase mb-2">
                  {group.title}
                </div>
              )}

              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      onSelectTab(item.id);
                      if (isMobileOpen) onCloseMobile();
                    }}
                    className={`admin-sidebar__nav-item ${collapsed ? 'admin-sidebar__nav-item--collapsed' : ''} text-sm font-semibold transition-all duration-200 cursor-pointer relative group ${
                      isActive
                        ? 'bg-gradient-to-r from-[#ff5a1f] to-[#ff7a3d] text-white shadow-md border border-orange-400/20'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                    }`}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-orange-400 group-hover:text-orange-300'}`} />
                    {!collapsed && <span className="truncate">{item.label}</span>}

                    {/* Tooltip for Collapsed Sidebar */}
                    {collapsed && (
                      <div className="admin-sidebar__tooltip fixed left-20 ml-2 hidden bg-slate-900 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg shadow-xl z-50 whitespace-nowrap pointer-events-none border border-slate-700">
                        {item.label}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-[var(--glass-border-subtle)] shrink-0">
          <button
            onClick={onLogout}
            className={`admin-sidebar__nav-item ${collapsed ? 'admin-sidebar__nav-item--collapsed' : ''} text-sm font-semibold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-all cursor-pointer`}
            title={collapsed ? 'Log Out' : undefined}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!collapsed && <span>Log Out</span>}
          </button>
        </div>
      </aside>
    </>
  );
};

export default AdminSidebar;
