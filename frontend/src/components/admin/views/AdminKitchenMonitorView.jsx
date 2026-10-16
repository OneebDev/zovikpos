import  { useMemo } from 'react';
import {
  ChefHat,
  Clock,
  BrainCircuit,
} from 'lucide-react';

const AdminKitchenMonitorView = ({ orders = [] }) => {
  const kitchenQueue = useMemo(() => {
    return orders.filter((o) => ['PAID', 'PREPARING', 'READY'].includes(o.status));
  }, [orders]);

  const newOrders = kitchenQueue.filter((o) => o.status === 'PAID');
  const preparingOrders = kitchenQueue.filter((o) => o.status === 'PREPARING');
  const readyOrders = kitchenQueue.filter((o) => o.status === 'READY');

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="bg-[var(--card-bg)]/40 border border-[var(--border-color)] p-5 sm:p-6 rounded-2xl shadow-xl flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-extrabold text-[var(--text-main)] font-display flex items-center gap-2">
            <ChefHat className="h-5 w-5 shrink-0 text-orange-400" />
            <span className="min-w-0">Kitchen Operations Oversight Monitor</span>
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Live read-only oversight monitor for kitchen order preparation workflow.</p>
        </div>

        <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-1.5 bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded-full text-xs font-black uppercase tracking-wider">
          <span>{kitchenQueue.length}</span>
          <span>Orders Active</span>
        </span>
      </div>

      {/* Kanban Board Columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Column 1: NEW ORDERS */}
        <div className="bg-[var(--card-bg)]/40 border border-[var(--border-color)] rounded-2xl p-4 space-y-4 shadow-xl">
          <div className="flex justify-between items-center pb-3 border-b border-[var(--border-color)]">
            <h3 className="font-extrabold text-sm text-[var(--text-main)] flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <span>NEW / PAID ({newOrders.length})</span>
            </h3>
            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded">Awaiting Kitchen</span>
          </div>

          <div className="space-y-3">
            {newOrders.map((order) => (
              <div key={order.id} className="p-4 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl space-y-3 shadow-md">
                <div className="flex justify-between items-start">
                  <div>
                    <strong className="font-mono font-extrabold text-orange-400 block">{order.orderNumber}</strong>
                    <span className="text-xs font-bold text-[var(--text-main)]">{order.tableNumber || (order.tableId ? `Table ${order.tableId}` : 'Takeaway')}</span>
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono">
                    {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                <div className="divide-y divide-[var(--border-color)] text-xs">
                  {order.orderItems?.map((item) => (
                    <div key={item.id} className="py-1 flex justify-between text-[var(--text-main)]">
                      <span>{item.quantity}× {item.nameSnapshot || item.menuItem?.name}</span>
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t border-[var(--border-color)] flex justify-between items-center text-[10px] text-[var(--text-muted)]">
                  <span className="flex items-center space-x-1">
                    <BrainCircuit className="w-3 h-3 text-orange-400" />
                    <span>AI ETA: ~{order.estimatedPrepTime || 15} mins</span>
                  </span>
                </div>
              </div>
            ))}

            {newOrders.length === 0 && (
              <p className="py-8 text-center text-xs text-[var(--text-muted)] italic">No new incoming orders.</p>
            )}
          </div>
        </div>

        {/* Column 2: PREPARING ORDERS */}
        <div className="bg-[var(--card-bg)]/40 border border-[var(--border-color)] rounded-2xl p-4 space-y-4 shadow-xl">
          <div className="flex justify-between items-center pb-3 border-b border-[var(--border-color)]">
            <h3 className="font-extrabold text-sm text-[var(--text-main)] flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
              <span>PREPARING ({preparingOrders.length})</span>
            </h3>
            <span className="text-[10px] font-bold text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded">In Kitchen</span>
          </div>

          <div className="space-y-3">
            {preparingOrders.map((order) => (
              <div key={order.id} className="p-4 bg-[var(--bg-color)] border border-amber-500/30 rounded-xl space-y-3 shadow-md">
                <div className="flex justify-between items-start">
                  <div>
                    <strong className="font-mono font-extrabold text-amber-400 block">{order.orderNumber}</strong>
                    <span className="text-xs font-bold text-[var(--text-main)]">{order.tableNumber || (order.tableId ? `Table ${order.tableId}` : 'Takeaway')}</span>
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono">
                    {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                <div className="divide-y divide-[var(--border-color)] text-xs">
                  {order.orderItems?.map((item) => (
                    <div key={item.id} className="py-1 flex justify-between text-[var(--text-main)]">
                      <span>{item.quantity}× {item.nameSnapshot || item.menuItem?.name}</span>
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t border-[var(--border-color)] flex justify-between items-center text-[10px] text-[var(--text-muted)]">
                  <span className="flex items-center space-x-1">
                    <Clock className="w-3 h-3 text-amber-400" />
                    <span>In Prep</span>
                  </span>
                </div>
              </div>
            ))}

            {preparingOrders.length === 0 && (
              <p className="py-8 text-center text-xs text-[var(--text-muted)] italic">No orders currently preparing.</p>
            )}
          </div>
        </div>

        {/* Column 3: READY FOR PICKUP */}
        <div className="bg-[var(--card-bg)]/40 border border-[var(--border-color)] rounded-2xl p-4 space-y-4 shadow-xl">
          <div className="flex justify-between items-center pb-3 border-b border-[var(--border-color)]">
            <h3 className="font-extrabold text-sm text-[var(--text-main)] flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-400" />
              <span>READY ({readyOrders.length})</span>
            </h3>
            <span className="text-[10px] font-bold text-orange-400 bg-orange-500/20 px-2 py-0.5 rounded">Ready for Pickup</span>
          </div>

          <div className="space-y-3">
            {readyOrders.map((order) => (
              <div key={order.id} className="p-4 bg-[var(--bg-color)] border border-orange-500/30 rounded-xl space-y-3 shadow-md">
                <div className="flex justify-between items-start">
                  <div>
                    <strong className="font-mono font-extrabold text-orange-400 block">{order.orderNumber}</strong>
                    <span className="text-xs font-bold text-[var(--text-main)]">{order.tableNumber || (order.tableId ? `Table ${order.tableId}` : 'Takeaway')}</span>
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono">
                    {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                <div className="divide-y divide-[var(--border-color)] text-xs">
                  {order.orderItems?.map((item) => (
                    <div key={item.id} className="py-1 flex justify-between text-[var(--text-main)]">
                      <span>{item.quantity}× {item.nameSnapshot || item.menuItem?.name}</span>
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t border-[var(--border-color)] text-[10px] text-orange-400 font-bold">
                  ✓ Ready at counter
                </div>
              </div>
            ))}

            {readyOrders.length === 0 && (
              <p className="py-8 text-center text-xs text-[var(--text-muted)] italic">No orders ready at counter.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminKitchenMonitorView;
