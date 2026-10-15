import React, { useState, useEffect, useMemo } from 'react';
import {
  UserCheck,
  Search,
  Download,
  Printer,
  Eye,
  ShoppingBag,
  DollarSign,
  Calendar,
  X,
  Trash2,
} from 'lucide-react';
import { exportToCSV, printPDFReport } from '../../../utils/exportUtils';
import api from '../../../services/api';
import GlobalDeleteModal from '../../common/GlobalDeleteModal';
import BulkSelectionModeButton from '../../common/BulkSelectionModeButton';

const AdminCustomersView = ({ showToast }) => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  // Global Delete State
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/customers');
      setCustomers(res.data.customers || []);
    } catch (err) {
      console.error(err);
      if (showToast) showToast('Failed to retrieve customer roster', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const filteredCustomers = useMemo(() => {
    return customers.filter(
      (c) =>
        c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.name?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [customers, searchTerm]);

  const toggleSelectCustomer = (id) => {
    setSelectedCustomerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedCustomerIds.size === filteredCustomers.length) {
      setSelectedCustomerIds(new Set());
    } else {
      setSelectedCustomerIds(new Set(filteredCustomers.map((c) => c.id)));
    }
  };

  const toggleSelectionMode = () => {
    if (selectionMode) setSelectedCustomerIds(new Set());
    setSelectionMode((active) => !active);
  };

  const handleBulkDelete = () => {
    if (selectedCustomerIds.size === 0) return;
    setIsBulkDeleting(true);
    setCustomerToDelete(null);
    setDeleteModalOpen(true);
  };

  const handleExportCSV = () => {
    const csvData = filteredCustomers.map((c) => ({
      Name: c.name,
      Email: c.email,
      TotalOrders: c.totalOrders,
      PaidOrdersCount: c.paidOrdersCount,
      TotalSpent: c.totalSpent,
      LastOrderDate: c.lastOrderDate ? new Date(c.lastOrderDate).toLocaleString() : 'No Orders Yet',
      AccountStatus: c.isActive ? 'Active' : 'Inactive',
    }));

    exportToCSV(`customer_roster_${Date.now()}.csv`, csvData, [
      { key: 'Name', label: 'Customer Name' },
      { key: 'Email', label: 'Email' },
      { key: 'TotalOrders', label: 'Total Orders' },
      { key: 'PaidOrdersCount', label: 'Paid Orders' },
      { key: 'TotalSpent', label: 'Total Spent (Rs.)' },
      { key: 'LastOrderDate', label: 'Last Order Date' },
      { key: 'AccountStatus', label: 'Status' },
    ]);
  };

  const handleExportPDF = () => {
    const tableHtml = `
      <table>
        <thead>
          <tr>
            <th>Customer Name</th>
            <th>Email</th>
            <th>Total Orders</th>
            <th>Total Spent (Rs.)</th>
            <th>Last Order Date</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${filteredCustomers
            .map(
              (c) => `
            <tr>
              <td><strong>${c.name}</strong></td>
              <td>${c.email}</td>
              <td>${c.totalOrders}</td>
              <td>Rs. ${Number(c.totalSpent || 0).toFixed(2)}</td>
              <td>${c.lastOrderDate ? new Date(c.lastOrderDate).toLocaleString() : 'N/A'}</td>
              <td><span class="badge badge-success">${c.isActive ? 'Active' : 'Inactive'}</span></td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    `;
    printPDFReport('Customer Analytics & Roster Report', tableHtml);
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[var(--card-bg)]/40 border border-[var(--border-color)] p-6 rounded-2xl shadow-xl">
        <div>
          <h2 className="text-xl font-extrabold text-[var(--text-main)] font-display">Customer Roster & Analytics</h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Track total spending, order history, and dining session activity.</p>
        </div>

        <div className="flex items-center space-x-2">
          <BulkSelectionModeButton active={selectionMode} onClick={toggleSelectionMode} selectedCount={selectedCustomerIds.size} />
          {selectionMode && selectedCustomerIds.size > 0 && (
            <button
              onClick={handleBulkDelete}
              className="px-3.5 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-xl text-xs font-bold transition-all shadow-md flex items-center space-x-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Selected ({selectedCustomerIds.size})</span>
            </button>
          )}
          <button
            onClick={handleExportCSV}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center space-x-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={handleExportPDF}
            className="px-3.5 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center space-x-1.5 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Export PDF</span>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-3" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by customer email or name..."
          className="w-full pl-10 pr-4 py-2.5 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl text-xs text-[var(--text-main)] focus:outline-none focus:border-orange-500"
        />
      </div>

      {/* Customer Roster Table */}
      <div className="bg-[var(--card-bg)]/40 border border-[var(--border-color)] rounded-2xl shadow-xl overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-xs font-bold text-[var(--text-muted)] animate-pulse">
            Loading Customer Analytics...
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="py-16 text-center text-xs font-bold text-[var(--text-muted)]">
            No customer accounts found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[var(--border-color)] bg-[var(--bg-color)]/50 text-[10px] uppercase font-black tracking-wider text-[var(--text-muted)]">
                  {selectionMode && <th className="p-4 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={filteredCustomers.length > 0 && selectedCustomerIds.size === filteredCustomers.length}
                      onChange={toggleSelectAll}
                      className="rounded border-[var(--border-color)] text-orange-600 focus:ring-orange-500 cursor-pointer"
                    />
                  </th>}
                  <th className="p-4">Customer</th>
                  <th className="p-4">Email</th>
                  <th className="p-4">Total Orders</th>
                  <th className="p-4">Total Spending</th>
                  <th className="p-4">Last Order</th>
                  <th className="p-4">Account Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {filteredCustomers.map((c) => {
                  const isChecked = selectedCustomerIds.has(c.id);
                  return (
                    <tr key={c.id} className={`hover:bg-[var(--bg-color)]/40 transition-colors ${isChecked ? 'bg-orange-500/5' : ''}`}>
                      {selectionMode && <td className="p-4 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectCustomer(c.id)}
                          className="rounded border-[var(--border-color)] text-orange-600 focus:ring-orange-500 cursor-pointer"
                        />
                      </td>}
                      <td className="p-4 font-bold text-[var(--text-main)]">{c.name}</td>
                      <td className="p-4 font-mono text-[var(--text-muted)]">{c.email}</td>
                      <td className="p-4 font-bold text-[var(--text-main)]">{c.totalOrders} orders</td>
                      <td className="p-4 font-mono font-extrabold text-emerald-400">Rs. {Number(c.totalSpent || 0).toFixed(2)}</td>
                      <td className="p-4 text-[11px] text-[var(--text-muted)]">
                        {c.lastOrderDate ? new Date(c.lastOrderDate).toLocaleString() : 'No orders'}
                      </td>
                      <td className="p-4">
                        <span className="px-2.5 py-1 rounded-md text-[10px] font-extrabold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          {c.isActive ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => setSelectedCustomer(c)}
                            className="px-3 py-1.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/20 rounded-xl font-bold transition-all flex items-center space-x-1 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>View Details</span>
                          </button>
                          <button
                            onClick={() => {
                              setIsBulkDeleting(false);
                              setCustomerToDelete(c);
                              setDeleteModalOpen(true);
                            }}
                          title="Delete / Archive Customer"
                          className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl border border-transparent hover:border-rose-500/20 transition-all cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Customer Detail Modal */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl animate-scale-up max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-start border-b border-[var(--border-color)] pb-4">
              <div>
                <h3 className="text-xl font-extrabold text-[var(--text-main)] font-display">{selectedCustomer.name}</h3>
                <p className="text-xs text-[var(--text-muted)]">{selectedCustomer.email}</p>
              </div>
              <button
                onClick={() => setSelectedCustomer(null)}
                className="p-2 rounded-xl bg-[var(--bg-color)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Metrics Overview */}
            <div className="grid grid-cols-3 gap-4 text-center text-xs">
              <div className="p-4 bg-[var(--bg-color)] rounded-2xl border border-[var(--border-color)]">
                <span className="text-[10px] text-[var(--text-muted)] font-bold uppercase block">Total Orders</span>
                <strong className="text-lg font-extrabold text-[var(--text-main)] block">{selectedCustomer.totalOrders}</strong>
              </div>
              <div className="p-4 bg-[var(--bg-color)] rounded-2xl border border-[var(--border-color)]">
                <span className="text-[10px] text-[var(--text-muted)] font-bold uppercase block">Paid Orders</span>
                <strong className="text-lg font-extrabold text-orange-400 block">{selectedCustomer.paidOrdersCount}</strong>
              </div>
              <div className="p-4 bg-[var(--bg-color)] rounded-2xl border border-[var(--border-color)]">
                <span className="text-[10px] text-[var(--text-muted)] font-bold uppercase block">Total Spending</span>
                <strong className="text-lg font-mono font-extrabold text-emerald-400 block">Rs. {Number(selectedCustomer.totalSpent || 0).toFixed(2)}</strong>
              </div>
            </div>

            {/* Recent Orders History */}
            <div className="space-y-3">
              <h4 className="text-xs font-extrabold text-[var(--text-main)] uppercase tracking-wider">Recent Orders History</h4>
              <div className="divide-y divide-[var(--border-color)] bg-[var(--bg-color)]/40 rounded-2xl border border-[var(--border-color)] text-xs">
                {selectedCustomer.recentOrders?.map((order) => (
                  <div key={order.id} className="p-3 flex justify-between items-center">
                    <div>
                      <strong className="text-orange-400 font-mono block">{order.orderNumber}</strong>
                      <span className="text-[10px] text-[var(--text-muted)]">{new Date(order.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-bold text-emerald-400 block">Rs. {order.total?.toFixed(2)}</span>
                      <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase">{order.status}</span>
                    </div>
                  </div>
                ))}

                {(!selectedCustomer.recentOrders || selectedCustomer.recentOrders.length === 0) && (
                  <p className="p-4 text-center text-xs text-[var(--text-muted)]">No recent orders recorded.</p>
                )}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex justify-between items-center pt-2 border-t border-[var(--border-color)]">
              <button
                type="button"
                onClick={() => {
                  setCustomerToDelete(selectedCustomer);
                  setDeleteModalOpen(true);
                }}
                className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Customer Account</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                className="px-5 py-2 bg-[var(--bg-color)] hover:bg-[var(--border-color)] text-[var(--text-main)] rounded-xl text-xs font-bold border border-[var(--border-color)] transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Delete Confirmation Modal */}
      <GlobalDeleteModal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setCustomerToDelete(null);
        }}
        onConfirm={async () => {
          setDeleteLoading(true);
          try {
            if (isBulkDeleting) {
              const res = await api.delete('/admin/customers/bulk', {
                data: { ids: Array.from(selectedCustomerIds) }
              });
              if (showToast) showToast(res.data?.message || 'Customers processed.');
              setSelectedCustomerIds(new Set());
            } else if (customerToDelete) {
              const res = await api.delete(`/admin/customers/${customerToDelete.id}`);
              if (showToast) showToast(res.data?.message || 'Customer account removed.');
              if (selectedCustomer?.id === customerToDelete.id) setSelectedCustomer(null);
            }
            setDeleteModalOpen(false);
            setCustomerToDelete(null);
            fetchCustomers();
          } catch (err) {
            console.error('Delete customer error:', err);
            if (showToast) showToast(err.response?.data?.error || 'Failed to delete customer', 'error');
          } finally {
            setDeleteLoading(false);
          }
        }}
        title={isBulkDeleting ? `Delete ${selectedCustomerIds.size} Selected Customers` : `Delete Customer (${customerToDelete?.name || ''})`}
        message={
          isBulkDeleting
            ? `Are you sure you want to delete ${selectedCustomerIds.size} selected customer accounts? Accounts with past dining or order records will be safely archived to protect order ledgers.`
            : `Are you sure you want to remove customer "${customerToDelete?.name}"? If this customer has existing orders, they will be safely deactivated and archived.`
        }
        itemCount={isBulkDeleting ? selectedCustomerIds.size : 1}
        itemName={customerToDelete ? `${customerToDelete.name} (${customerToDelete.email})` : ''}
        isBulk={isBulkDeleting}
        confirmButtonText={isBulkDeleting ? 'Delete Selected' : 'Delete Customer'}
        loading={deleteLoading}
        warningNotes={[
          'Customers with zero orders are permanently deleted.',
          'Customers with past dining records are safely archived to protect sales ledger integrity.',
        ]}
      />
    </div>
  );
};

export default AdminCustomersView;
