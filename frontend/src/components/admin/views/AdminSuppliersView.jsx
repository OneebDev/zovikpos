import  { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import api from '../../../services/api';
import {
  Building2,
  Search,
  Plus,
  X,
  CheckCircle2,
  Edit3,
  Trash2,
  AlertTriangle,
  MessageSquare
} from 'lucide-react';
import PhoneInput from '../../PhoneInput';
import { formatPhoneDisplay, getWhatsAppLink } from '../../../utils/phoneUtils';
import GlobalDeleteModal from '../../common/GlobalDeleteModal';
import BulkSelectionModeButton from '../../common/BulkSelectionModeButton';

const AdminSuppliersView = ({ suppliers = [], inventory = [], receivings = [], onRefresh, showToast }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [selectedSupplierDetails, setSelectedSupplierDetails] = useState(null);

  // Global Delete & Bulk State
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [supplierToDelete, setSupplierToDelete] = useState(null);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [selectedSupplierIds, setSelectedSupplierIds] = useState(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const hasSelectedSuppliers = selectionMode && selectedSupplierIds.size > 0;
  const mobileActionWidth = hasSelectedSuppliers ? 'mobile-action-third' : 'mobile-action-half';

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
    notes: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState(null);

  // Summary Metrics
  const summary = useMemo(() => {
    const totalSuppliers = suppliers.length;
    const activeSuppliers = suppliers.filter(s => s.isActive !== false).length;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const usedSupplierIds = new Set();
    receivings.forEach(r => {
      if (r.createdAt && new Date(r.createdAt) >= thirtyDaysAgo && r.supplierId) {
        usedSupplierIds.add(String(r.supplierId));
      }
    });

    return {
      totalSuppliers,
      activeSuppliers,
      usedThisMonth: usedSupplierIds.size
    };
  }, [suppliers, receivings]);

  // Filtered Suppliers
  const filteredSuppliers = useMemo(() => {
    return suppliers.filter(s => {
      const q = searchQuery.toLowerCase().trim();
      return !q ||
        s.name.toLowerCase().includes(q) ||
        (s.contactPerson && s.contactPerson.toLowerCase().includes(q)) ||
        (s.phone && s.phone.toLowerCase().includes(q)) ||
        (s.email && s.email.toLowerCase().includes(q));
    });
  }, [suppliers, searchQuery]);

  const toggleSelectSupplier = (id) => {
    setSelectedSupplierIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedSupplierIds.size === filteredSuppliers.length) {
      setSelectedSupplierIds(new Set());
    } else {
      setSelectedSupplierIds(new Set(filteredSuppliers.map(s => s.id)));
    }
  };

  const toggleSelectionMode = () => {
    if (selectionMode) setSelectedSupplierIds(new Set());
    setSelectionMode((active) => !active);
  };

  const openAddModal = () => {
    setFormData({ name: '', contactPerson: '', phone: '', email: '', address: '', notes: '' });
    setDuplicateWarning(null);
    setEditingSupplier(null);
    setShowAddModal(true);
  };

  const openEditModal = (supplier) => {
    setFormData({
      name: supplier.name || '',
      contactPerson: supplier.contactPerson || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      address: supplier.address || '',
      notes: supplier.notes || ''
    });
    setDuplicateWarning(null);
    setEditingSupplier(supplier);
    setShowAddModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      if (showToast) showToast('Supplier Name is required', 'error');
      return;
    }

    setIsSubmitting(true);
    setDuplicateWarning(null);

    try {
      if (editingSupplier) {
        await api.put(`/inventory/suppliers/${editingSupplier.id}`, formData);
        if (showToast) showToast(`Updated supplier "${formData.name.trim()}" successfully!`, 'success');
      } else {
        await api.post('/inventory/suppliers', formData);
        if (showToast) showToast(`Added supplier "${formData.name.trim()}"!`, 'success');
      }

      setShowAddModal(false);
      setEditingSupplier(null);
      setFormData({ name: '', contactPerson: '', phone: '', email: '', address: '', notes: '' });
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Supplier save error:', err);
      if (err.response?.status === 409) {
        setDuplicateWarning(err.response?.data?.error || 'A supplier with this name already exists.');
      } else {
        if (showToast) showToast(err.response?.data?.error || 'Failed to save supplier', 'error');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = (supplier) => {
    setSupplierToDelete(supplier);
    setIsBulkDeleting(false);
    setDeleteModalOpen(true);
  };

  const handleBulkDelete = () => {
    if (selectedSupplierIds.size === 0) return;
    setIsBulkDeleting(true);
    setSupplierToDelete(null);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    setDeleteLoading(true);
    try {
      if (isBulkDeleting) {
        const res = await api.delete('/inventory/suppliers/bulk', {
          data: { ids: Array.from(selectedSupplierIds) }
        });
        if (showToast) showToast(res.data?.message || 'Suppliers processed.');
        setSelectedSupplierIds(new Set());
      } else if (supplierToDelete) {
        const res = await api.delete(`/inventory/suppliers/${supplierToDelete.id}`);
        if (showToast) showToast(res.data?.message || `Deleted supplier "${supplierToDelete.name}".`);
      }
      setDeleteModalOpen(false);
      setSupplierToDelete(null);
      if (selectedSupplierDetails && supplierToDelete && selectedSupplierDetails.id === supplierToDelete.id) {
        setSelectedSupplierDetails(null);
      }
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Delete supplier error:', err);
      const msg = err.response?.data?.error || 'Failed to delete supplier.';
      if (showToast) showToast(msg, 'error');
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 glass-card p-5 sm:p-6">
        <div>
          <h2 className="text-xl font-black text-[var(--text-main)] font-display flex items-center gap-2.5">
            <span className="p-2 rounded-2xl bg-sky-500/10 text-sky-400">ðŸ¢</span>
            Suppliers Management
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Manage vendor details, track supplied items & order receiving history.
          </p>
        </div>

        <div className="flex w-full min-w-0 items-center gap-1.5 overflow-x-auto pb-1 lg:w-auto lg:shrink-0 lg:overflow-visible">
          <BulkSelectionModeButton active={selectionMode} onClick={toggleSelectionMode} selectedCount={selectedSupplierIds.size} className={`${mobileActionWidth} h-10 justify-center px-1 text-[10px] sm:h-auto sm:w-auto sm:px-3 sm:py-2 sm:text-xs`} mobileLabel="Select" mobileActiveLabel="Done" />
          {hasSelectedSuppliers && (
            <button
              onClick={handleBulkDelete}
              className={`flex h-10 ${mobileActionWidth} shrink-0 items-center justify-center gap-1 rounded-xl border border-rose-500/30 bg-rose-500/10 px-1 text-[10px] font-bold text-rose-400 shadow-lg transition-all hover:bg-rose-500/20 cursor-pointer sm:h-auto sm:w-auto sm:gap-2 sm:px-3.5 sm:py-2.5 sm:text-xs`}
            >
              <Trash2 className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
              <span><span className="sm:hidden">Delete</span><span className="hidden sm:inline">Delete Selected ({selectedSupplierIds.size})</span></span>
            </button>
          )}

          <button
            onClick={openAddModal}
            className={`${mobileActionWidth} flex h-10 shrink-0 items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-1 text-[10px] font-bold text-white shadow-lg transition-all cursor-pointer sm:h-auto sm:w-auto sm:gap-2 sm:px-4 sm:py-2.5 sm:text-xs`}
          >
            <Plus className="h-3.5 w-3.5 shrink-0 stroke-[3] sm:h-4 sm:w-4" />
            <span><span className="sm:hidden">Add</span><span className="hidden sm:inline">Add Supplier</span></span>
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[var(--card-bg)]/60 border border-[var(--border-color)] p-4 rounded-2xl space-y-1">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)] block">Total Suppliers</span>
          <div className="text-2xl font-black text-[var(--text-main)] font-mono">{summary.totalSuppliers}</div>
          <div className="text-[10px] text-[var(--text-muted)]">Registered vendor partners</div>
        </div>

        <div className="bg-[var(--card-bg)]/60 border border-[var(--border-color)] p-4 rounded-2xl space-y-1">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)] block">Active Suppliers</span>
          <div className="text-2xl font-black text-emerald-400 font-mono">{summary.activeSuppliers}</div>
          <div className="text-[10px] text-[var(--text-muted)]">Available for stock receivings</div>
        </div>

        <div className="bg-[var(--card-bg)]/60 border border-[var(--border-color)] p-4 rounded-2xl space-y-1">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)] block">Used This Month</span>
          <div className="text-2xl font-black text-sky-400 font-mono">{summary.usedThisMonth}</div>
          <div className="text-[10px] text-[var(--text-muted)]">Active in recent receivings</div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-[var(--card-bg)]/40 border border-[var(--border-color)] p-4 rounded-2xl">
        <div className="relative max-w-md">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search suppliers by name, contact, phone, email..."
            className="w-full pl-9 pr-4 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs text-[var(--text-main)] focus:outline-none focus:border-orange-500 font-bold"
          />
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--text-muted)]" />
        </div>
      </div>

      {/* Supplier List */}
      <div className="glass-table overflow-hidden">
        {filteredSuppliers.length === 0 ? (
          <div className="p-12 text-center text-[var(--text-muted)] text-xs space-y-3">
            <Building2 className="w-8 h-8 mx-auto text-[var(--text-muted)] opacity-50" />
            <p className="font-bold text-[var(--text-main)] text-sm">No suppliers found</p>
            <p className="text-[var(--text-muted)]">Add your first supplier to track orders and vendor items.</p>
            <button
              onClick={openAddModal}
              className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs inline-flex items-center gap-2 cursor-pointer shadow-lg"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>+ Add Supplier</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="inventory-single-row-table w-full min-w-max text-left text-xs divide-y divide-[var(--border-color)]">
              <thead className="bg-[var(--bg-color)]/80 text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                <tr>
                  {selectionMode && <th className="py-3.5 px-4 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={filteredSuppliers.length > 0 && selectedSupplierIds.size === filteredSuppliers.length}
                      onChange={toggleSelectAll}
                      className="rounded border-[var(--border-color)] text-orange-600 focus:ring-orange-500 cursor-pointer"
                    />
                  </th>}
                  <th className="py-3.5 px-4">Supplier</th>
                  <th className="py-3.5 px-4">Contact Person</th>
                  <th className="py-3.5 px-4">Phone / Email</th>
                  <th className="py-3.5 px-4 text-center">Supplied Items</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)] font-medium text-[var(--text-main)]">
                {filteredSuppliers.map((s) => {
                  const suppliedItems = inventory.filter(i => String(i.supplierId) === String(s.id));
                  const isChecked = selectedSupplierIds.has(s.id);

                  return (
                    <tr key={s.id} className={`hover:bg-[var(--bg-color)]/50 transition-colors ${isChecked ? 'bg-orange-500/5' : ''}`}>
                      {selectionMode && <td className="py-3.5 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectSupplier(s.id)}
                          className="rounded border-[var(--border-color)] text-orange-600 focus:ring-orange-500 cursor-pointer"
                        />
                      </td>}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center font-bold text-sky-400 shrink-0">
                            ðŸ¢
                          </div>
                          <div>
                            <strong className="text-[var(--text-main)] block">{s.name}</strong>
                            {s.address && <span className="text-[10px] text-[var(--text-muted)] truncate block max-w-xs">{s.address}</span>}
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-[var(--text-main)] font-semibold">
                        {s.contactPerson || 'â€”'}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-[11px] text-[var(--text-muted)]">
                        {s.phone ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-[var(--text-main)]">{formatPhoneDisplay(s.phone)}</span>
                            <a
                              href={getWhatsAppLink(s.phone, `Hi ${s.name}, regarding inventory supply order`)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-emerald-400 hover:text-emerald-300 p-0.5 rounded hover:bg-emerald-500/10 transition-colors"
                              title="Chat on WhatsApp"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        ) : (
                          <div>â€”</div>
                        )}
                        {s.email && <div className="text-[10px] text-sky-400">{s.email}</div>}
                      </td>

                      <td className="py-3.5 px-4 text-center font-mono font-bold">
                        <span className="px-2 py-0.5 rounded text-[11px] bg-sky-500/10 text-sky-400">
                          {suppliedItems.length} Items
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3" /> Active
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex flex-nowrap items-center justify-end gap-1.5 whitespace-nowrap">
                          <button
                            onClick={() => setSelectedSupplierDetails(s)}
                            className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-color)] hover:bg-[var(--card-bg)] text-[var(--text-main)] border border-[var(--border-color)] font-bold text-[11px] transition-colors cursor-pointer"
                          >
                            View
                          </button>
                          <button
                            onClick={() => openEditModal(s)}
                            className="p-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/20 font-bold transition-colors cursor-pointer icon-btn"
                            title="Edit Supplier"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(s)}
                            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 font-bold transition-colors cursor-pointer icon-btn"
                            title="Delete / Archive Supplier"
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

      {/* Add / Edit Supplier Modal via Portal */}
      {showAddModal && createPortal(
        <div className="fixed inset-0 z-[9999] glass-overlay flex items-center justify-center p-4">
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-scale-up max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-[var(--border-color)] pb-3">
              <h3 className="text-base font-black text-[var(--text-main)] flex items-center gap-2">
                <span className="p-1.5 rounded-xl bg-orange-500/10 text-orange-400">ðŸ¢</span>
                {editingSupplier ? 'Edit Supplier' : 'Add New Supplier'}
              </h3>
              <button onClick={() => setShowAddModal(false)} className="p-1.5 rounded-xl bg-[var(--bg-color)] text-[var(--text-muted)] icon-btn">
                <X className="w-5 h-5" />
              </button>
            </div>

            {duplicateWarning && (
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                <div>
                  <strong className="block font-bold">Possible Existing Supplier</strong>
                  <span>{duplicateWarning}</span>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-[var(--text-main)] uppercase mb-1 tracking-wider text-[10px]">Supplier Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Metro Wholesale Pakistan"
                  className="w-full px-3.5 py-2.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs font-bold text-[var(--text-main)] focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[var(--text-main)] uppercase mb-1 tracking-wider text-[10px]">Contact Person</label>
                  <input
                    type="text"
                    value={formData.contactPerson}
                    onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                    placeholder="e.g. Ali Ahmed"
                    className="w-full px-3.5 py-2.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs font-bold text-[var(--text-main)]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-[var(--text-main)] uppercase mb-1 tracking-wider text-[10px]">Phone Number</label>
                  <PhoneInput
                    value={formData.phone}
                    onChange={(val) => setFormData({ ...formData, phone: val })}
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-[var(--text-main)] uppercase mb-1 tracking-wider text-[10px]">Email Address</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="e.g. orders@metrowholesale.pk"
                  className="w-full px-3.5 py-2.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs text-[var(--text-main)]"
                />
              </div>

              <div>
                <label className="block font-bold text-[var(--text-main)] uppercase mb-1 tracking-wider text-[10px]">Address</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="e.g. Depot #4, Wholesale Market, Lahore"
                  className="w-full px-3.5 py-2.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs text-[var(--text-main)]"
                />
              </div>

              <div>
                <label className="block font-bold text-[var(--text-main)] uppercase mb-1 tracking-wider text-[10px]">Notes</label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="e.g. Preferred supplier for fresh dairy products."
                  className="w-full px-3.5 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs text-[var(--text-main)] resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-color)]">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 rounded-xl bg-[var(--bg-color)] font-bold text-[var(--text-muted)] cursor-pointer">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="px-5 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold shadow-md cursor-pointer">
                  {isSubmitting ? 'Saving...' : (editingSupplier ? 'Update Supplier' : 'Save Supplier')}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Supplier Details Modal via Portal */}
      {selectedSupplierDetails && createPortal(
        <div className="fixed inset-0 z-[9999] glass-overlay flex items-center justify-center p-4">
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl max-w-xl w-full p-6 space-y-4 shadow-2xl animate-scale-up max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-[var(--border-color)] pb-3">
              <div>
                <h3 className="text-base font-black text-[var(--text-main)]">{selectedSupplierDetails.name}</h3>
                <span className="text-[10px] text-sky-400 font-bold uppercase">Contact: {selectedSupplierDetails.contactPerson || 'Not Provided'}</span>
              </div>
              <button onClick={() => setSelectedSupplierDetails(null)} className="p-1.5 rounded-xl bg-[var(--bg-color)] text-[var(--text-muted)] icon-btn">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Contact Details */}
            <div className="grid grid-cols-2 gap-3 bg-[var(--bg-color)] p-4 rounded-2xl text-xs font-mono">
              <div>Phone: <strong className="text-[var(--text-main)]">{selectedSupplierDetails.phone || 'â€”'}</strong></div>
              <div>Email: <strong className="text-[var(--text-main)]">{selectedSupplierDetails.email || 'â€”'}</strong></div>
              <div className="col-span-2">Address: <strong className="text-[var(--text-muted)]">{selectedSupplierDetails.address || 'â€”'}</strong></div>
            </div>

            {/* Supplied Items */}
            <div className="space-y-2">
              <h4 className="text-xs font-extrabold uppercase text-[var(--text-main)] tracking-wider">Supplied Items</h4>
              <div className="bg-[var(--bg-color)]/60 border border-[var(--border-color)] rounded-2xl p-3 max-h-36 overflow-y-auto flex flex-wrap gap-1.5">
                {(() => {
                  const items = inventory.filter(i => String(i.supplierId) === String(selectedSupplierDetails.id));
                  if (items.length === 0) return <span className="text-[11px] text-[var(--text-muted)]">No inventory items linked to this supplier yet.</span>;
                  return items.map((inv, idx) => (
                    <span key={idx} className="px-2.5 py-1 rounded-lg bg-[var(--card-bg)] text-[11px] font-bold text-sky-400 border border-[var(--border-color)]">
                      {inv.name} ({inv.stockLevel} {inv.unit})
                    </span>
                  ));
                })()}
              </div>
            </div>

            {/* Recent Receivings */}
            <div className="space-y-2">
              <h4 className="text-xs font-extrabold uppercase text-[var(--text-main)] tracking-wider">Recent Receivings</h4>
              <div className="bg-[var(--bg-color)]/60 border border-[var(--border-color)] rounded-2xl divide-y divide-[var(--border-color)] max-h-36 overflow-y-auto text-xs font-mono">
                {(() => {
                  const supReceivings = receivings.filter(r => String(r.supplierId) === String(selectedSupplierDetails.id));
                  if (supReceivings.length === 0) return <div className="p-3 text-center text-[var(--text-muted)] text-[11px]">No receiving history recorded for this supplier.</div>;
                  return supReceivings.slice(0, 5).map((rcv, idx) => (
                    <div key={idx} className="p-2.5 flex justify-between items-center">
                      <div>
                        <strong className="text-[var(--text-main)]">{rcv.receivingRef || rcv.receivingNumber || `RCV-${rcv.id}`}</strong>
                        <span className="text-[10px] text-[var(--text-muted)] block">{new Date(rcv.createdAt).toLocaleDateString()}</span>
                      </div>
                      <span className="font-bold text-amber-400">Rs. {rcv.totalCost || 0}</span>
                    </div>
                  ));
                })()}
              </div>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-[var(--border-color)]">
              <button
                type="button"
                onClick={() => {
                  const s = selectedSupplierDetails;
                  handleDelete(s);
                }}
                className="px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Supplier</span>
              </button>

              <button
                onClick={() => setSelectedSupplierDetails(null)}
                className="px-4 py-2 rounded-xl bg-[var(--bg-color)] hover:bg-[var(--card-bg)] border border-[var(--border-color)] font-bold text-xs text-[var(--text-muted)] cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Global Delete Confirmation Modal */}
      <GlobalDeleteModal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setSupplierToDelete(null);
        }}
        onConfirm={handleConfirmDelete}
        title={isBulkDeleting ? `Delete ${selectedSupplierIds.size} Selected Suppliers` : `Delete Supplier "${supplierToDelete?.name || ''}"`}
        message={
          isBulkDeleting
            ? `Are you sure you want to delete ${selectedSupplierIds.size} selected suppliers? Suppliers with historical receiving records or linked inventory items will be preserved safely.`
            : `Are you sure you want to delete supplier "${supplierToDelete?.name}"? If they have linked purchase receivings or inventory items, deletion will be blocked to preserve historical records.`
        }
        itemCount={isBulkDeleting ? selectedSupplierIds.size : 1}
        itemName={supplierToDelete ? supplierToDelete.name : ''}
        isBulk={isBulkDeleting}
        confirmButtonText={isBulkDeleting ? 'Delete Selected' : 'Delete Supplier'}
        loading={deleteLoading}
        dangerLevel="danger"
        warningNotes={[
          'Suppliers with linked purchase deliveries or active catalog inventory cannot be permanently deleted.',
        ]}
      />
    </div>
  );
};

export default AdminSuppliersView;


