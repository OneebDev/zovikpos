import  { useState, useMemo } from 'react';
import {
  Bell,
  Package,
  CreditCard,
  CheckCircle2,
  Trash2,
} from 'lucide-react';
import GlobalDeleteModal from '../../common/GlobalDeleteModal';

const DISMISSED_ALERTS_STORAGE_KEY = 'pos_dismissed_alerts_v1';

const AdminNotificationsView = ({ stats, orders = [], onNavigate }) => {
  const [resolvedIds, setResolvedIds] = useState(() => {
    try {
      const stored = localStorage.getItem(DISMISSED_ALERTS_STORAGE_KEY);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const notifications = useMemo(() => {
    const list = [];

    // 1. Stock Alerts
    stats?.lowStockAlerts?.forEach((item) => {
      list.push({
        id: `stock-${item.id}`,
        type: 'STOCK',
        title: `${item.statusLevel}: ${item.name}`,
        description: `Current stock level is ${item.stockLevel} ${item.unit} (Safety min: ${item.minThreshold}).`,
        severity: item.stockLevel <= 0 ? 'CRITICAL' : 'WARNING',
        timestamp: new Date(item.updatedAt).toLocaleString(),
        targetTab: 'inventory',
        targetContext: { itemId: item.id, action: 'inspect' },
      });
    });

    // 2. Pending Payment Verifications
    orders.forEach((o) => {
      if (o.status === 'PAYMENT_PENDING') {
        list.push({
          id: `payment-${o.id}`,
          type: 'PAYMENT',
          title: `Pending Online Verification: ${o.orderNumber}`,
          description: `Customer submitted transaction ${o.payment?.transactionId || 'N/A'} for Rs. ${o.total.toFixed(2)}.`,
          severity: 'HIGH',
          timestamp: new Date(o.createdAt).toLocaleString(),
          targetTab: 'payments',
        });
      }
    });

    return list;
  }, [stats, orders]);

  const activeNotifications = notifications.filter((n) => !resolvedIds.has(n.id));

  const handleResolve = (id) => {
    setResolvedIds((prev) => {
      const next = new Set([...prev, id]);
      try {
        localStorage.setItem(DISMISSED_ALERTS_STORAGE_KEY, JSON.stringify(Array.from(next)));
      } catch (e) {
        console.error('Failed to save dismissed alerts:', e);
      }
      return next;
    });
  };

  const handleResetDismissed = () => {
    setResolvedIds(new Set());
    try {
      localStorage.removeItem(DISMISSED_ALERTS_STORAGE_KEY);
    } catch (e) {
      console.error('Failed to clear dismissed alerts:', e);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="glass-card p-4 sm:p-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-orange-400 shrink-0" />
            <h2 className="text-xl font-extrabold text-[var(--text-main)] font-display min-w-0">
              System Notifications &amp; Action Center
            </h2>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-1 ml-7">Urgent operations alerts requiring administrator attention.</p>
          <div className="flex flex-wrap items-center gap-2 mt-4 ml-7">
            {activeNotifications.length > 0 && (
              <button
                onClick={() => setDeleteModalOpen(true)}
                className="px-3.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Dismiss All Alerts</span>
              </button>
            )}

            <span className="px-3 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full text-xs font-black uppercase tracking-wider">
              {activeNotifications.length} Action Items
            </span>
          </div>
        </div>
      </div>

      {/* Notifications List */}
      <div className="space-y-4">
        {activeNotifications.map((n) => (
          <div
            key={n.id}
            className={`p-5 rounded-2xl border flex items-start gap-3 transition-all shadow-lg ${
              n.severity === 'CRITICAL'
                ? 'bg-rose-500/10 border-rose-500/30'
                : n.severity === 'HIGH'
                ? 'bg-orange-500/10 border-orange-500/30'
                : 'bg-amber-500/10 border-amber-500/30'
            }`}
          >
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div className="p-2.5 rounded-xl bg-[var(--card-bg)] border border-[var(--border-color)] text-orange-400 shrink-0">
                {n.type === 'STOCK' ? <Package className="w-5 h-5 text-amber-400" /> : <CreditCard className="w-5 h-5 text-orange-400" />}
              </div>
              <div className="min-w-0 flex-1">
                <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                  n.severity === 'CRITICAL' ? 'bg-rose-500 text-white' : 'bg-amber-500/20 text-amber-400'
                }`}>
                  {n.severity}
                </span>
                <h3 className="text-sm font-extrabold text-[var(--text-main)] mt-1">{n.title}</h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">{n.description}</p>
                <span className="text-[10px] text-[var(--text-muted)] mt-1 block">{n.timestamp}</span>
                <div className="flex flex-wrap items-center gap-2 mt-4">
                  <button
                    onClick={() => onNavigate(n.targetTab, n.targetContext)}
                    className="px-3.5 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-bold text-xs transition-all shadow-md cursor-pointer"
                  >
                    Inspect â†’
                  </button>
                  <button
                    onClick={() => handleResolve(n.id)}
                    className="px-3.5 py-1.5 bg-[var(--bg-color)] hover:bg-[var(--border-color)] text-[var(--text-muted)] font-bold text-xs rounded-xl border border-[var(--border-color)] transition-all cursor-pointer"
                  >
                    Mark Resolved
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}

        {activeNotifications.length === 0 && (
          <div className="py-16 text-center text-xs font-bold text-[var(--text-muted)] bg-[var(--card-bg)]/40 rounded-2xl border border-[var(--border-color)] space-y-3">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
            <p>All system notifications resolved. No action required!</p>
            {resolvedIds.size > 0 && (
              <button
                onClick={handleResetDismissed}
                className="px-3.5 py-1.5 bg-[var(--bg-color)] hover:bg-[var(--border-color)] text-[var(--text-main)] border border-[var(--border-color)] rounded-xl font-bold text-xs transition-all cursor-pointer inline-flex items-center space-x-1.5"
              >
                <span>Restore Dismissed Alerts ({resolvedIds.size})</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Global Delete Confirmation Modal */}
      <GlobalDeleteModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={() => {
          const allIds = new Set(notifications.map(n => n.id));
          setResolvedIds(allIds);
          try {
            localStorage.setItem(DISMISSED_ALERTS_STORAGE_KEY, JSON.stringify(Array.from(allIds)));
          } catch (e) {
            console.error('Failed to save dismissed alerts:', e);
          }
          setDeleteModalOpen(false);
        }}
        title="Dismiss All Operational Notifications"
        message={`Are you sure you want to dismiss and clear all ${activeNotifications.length} active notifications from the Action Center?`}
        itemCount={activeNotifications.length}
        isScopeAll={true}
        confirmButtonText="Dismiss All"
        dangerLevel="warning"
        warningNotes={[
          'Underlying stock levels and pending order verifications will remain in their respective modules until resolved.',
        ]}
      />
    </div>
  );
};

export default AdminNotificationsView;

