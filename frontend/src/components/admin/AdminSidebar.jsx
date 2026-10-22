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
      {/* Mobile Drawer Backdrop Overlay */}
      {isMobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
        />
      )}

      {/* Floating Sidebar Rail */}
      <aside
        className={`floating-sidebar ${
          collapsed ? 'w-20' : 'w-64'
        } ${
          isMobileOpen ? 'floating-sidebar--visible w-64' : 'floating-sidebar--hidden lg:translate-x-0'
        }`}
      >
        {/* Sidebar Header Brand */}
        <div className="floating-sidebar__header">
          <div className="flex items-center space-x-3 overflow-hidden">
            <img src="/assets/zovikpos-mark.svg" alt="ZovikPOS logo" className="w-10 h-10 rounded-xl shrink-0 shadow-lg shadow-orange-600/30" />
            {!collapsed && (
              <div className="animate-fade-in truncate">
                <h1 className="font-extrabold text-sm text-[var(--panel-text)] tracking-tight font-display">ZOVIKPOS</h1>
                <p className="text-[10px] text-orange-400 font-bold uppercase tracking-wider">Enterprise POS</p>
              </div>
            )}
          </div>

          {/* Desktop Collapse Toggle */}
          <button
            onClick={onToggleCollapse}
            className="hidden lg:flex btn-icon shrink-0"
            title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            aria-label={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4 shrink-0" /> : <ChevronLeft className="w-4 h-4 shrink-0" />}
          </button>
        </div>

        {/* Sidebar Navigation Items */}
        <div className="floating-sidebar__nav">
          {navGroups.map((group, groupIdx) => (
            <div key={groupIdx} className="mb-4">
              {!collapsed && (
                <div className="floating-sidebar__section-title">
                  {group.title}
                </div>
              )}

              <div className="space-y-1">
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
                      className={`floating-sidebar__item ${collapsed ? 'floating-sidebar__item--collapsed' : ''} ${
                        isActive ? 'floating-sidebar__item--active' : ''
                      }`}
                      title={collapsed ? item.label : undefined}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-orange-400'}`} />
                      {!collapsed && <span className="truncate">{item.label}</span>}

                      {/* Tooltip for Collapsed Sidebar */}
                      {collapsed && (
                        <div className="floating-sidebar__tooltip">
                          {item.label}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Sidebar Footer */}
        <div className="floating-sidebar__footer">
          <button
            onClick={onLogout}
            className={`floating-sidebar__item ${collapsed ? 'floating-sidebar__item--collapsed' : ''} text-rose-400 hover:text-rose-300 hover:bg-rose-500/15`}
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
