import  { useState, useEffect, useCallback } from 'react';
import {
  Building2,
  Plus,
  MapPin,
  Phone,
  X,
  Pencil,
  Trash2,
  Loader2,
} from 'lucide-react';
import api from '../../../services/api';
import PhoneInput from '../../PhoneInput';
import { formatPhoneDisplay } from '../../../utils/phoneUtils';

const AdminBranchesView = ({ showToast, onBranchesChanged }) => {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingBranchId, setDeletingBranchId] = useState(null);
  const [formData, setFormData] = useState({ name: '', address: '', phone: '' });

  const fetchBranches = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/branches');
      setBranches(res.data.branches || []);
    } catch (err) {
      console.error(err);
      if (showToast) showToast('Failed to load branches', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  const handleCreateBranch = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingBranch) {
        await api.put(`/admin/branches/${editingBranch.id}`, formData);
        if (showToast) showToast('Branch details updated successfully!');
      } else {
        await api.post('/admin/branches', formData);
        if (showToast) showToast('New branch registered successfully!');
      }
      setShowAddModal(false);
      setEditingBranch(null);
      setFormData({ name: '', address: '', phone: '' });
      await fetchBranches();
      onBranchesChanged?.();
    } catch (err) {
      console.error(err);
      if (showToast) showToast(err.response?.data?.error || `Failed to ${editingBranch ? 'update' : 'create'} branch`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const openEditBranch = (branch) => {
    setEditingBranch(branch);
    setFormData({ name: branch.name || '', address: branch.address || '', phone: branch.phone || '' });
    setShowAddModal(true);
  };

  const handleDeleteBranch = async (branch) => {
    const confirmed = window.confirm(`Remove “${branch.name}”? Branches with linked orders, staff, or inventory will be safely deactivated instead of permanently deleted.`);
    if (!confirmed) return;
    setDeletingBranchId(branch.id);
    try {
      const response = await api.delete(`/admin/branches/${branch.id}`);
      if (showToast) showToast(response.data.message || 'Branch removed successfully.');
      await fetchBranches();
      onBranchesChanged?.();
    } catch (err) {
      if (showToast) showToast(err.response?.data?.error || 'Failed to remove branch', 'error');
    } finally {
      setDeletingBranchId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 glass-card p-6">
        <div>
          <h2 className="text-xl font-extrabold text-[var(--text-main)] font-display">Branch & Campus Outlet Management</h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Manage multi-outlet canteen locations, addresses, and table allocations.</p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center space-x-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Branch</span>
        </button>
      </div>

      {/* Branch Cards */}
      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-xs font-bold text-[var(--text-muted)]">
          <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
          <span>Loading Branches...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {branches.map((b) => (
            <div key={b.id} className="bg-[var(--card-bg)]/40 border border-[var(--border-color)] p-6 rounded-2xl space-y-4 shadow-lg">
              <div className="flex justify-between items-start gap-3">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 flex items-center justify-center">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-[var(--text-main)] font-display">{b.name}</h3>
                    <span className="text-[10px] text-orange-400 font-bold">Branch ID: #{b.id}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold border ${b.isActive === false ? 'bg-slate-500/10 text-slate-400 border-slate-500/30' : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'}`}>
                    {b.isActive === false ? 'INACTIVE' : 'ACTIVE'}
                  </span>
                  <button type="button" onClick={() => openEditBranch(b)} aria-label={`Edit ${b.name}`} title="Edit branch" className="rounded-lg border border-[var(--border-color)] p-1.5 text-[var(--text-muted)] transition hover:border-orange-400/50 hover:text-orange-500 icon-btn">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => handleDeleteBranch(b)} disabled={deletingBranchId === b.id} aria-label={`Remove ${b.name}`} title="Remove branch" className="rounded-lg border border-rose-500/20 p-1.5 text-rose-400 transition hover:bg-rose-500/10 disabled:opacity-50 icon-btn">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="space-y-2 text-xs text-[var(--text-muted)] pt-2 border-t border-[var(--border-color)]">
                <div className="flex items-center space-x-2">
                  <MapPin className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                  <span>{b.address || 'University Main Campus'}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>{b.phone ? formatPhoneDisplay(b.phone) : '+92 300 1234567'}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 border-t border-[var(--border-color)] pt-3 sm:grid-cols-3">
                <div className="flex min-h-[68px] min-w-0 flex-col items-center justify-center rounded-xl border border-orange-500/20 bg-orange-500/[0.08] dark:bg-orange-500/[0.12] px-1.5 py-2 text-center">
                  <strong className="font-mono text-xl font-extrabold leading-none text-orange-600 dark:text-orange-400">{b._count?.tables ?? 0}</strong>
                  <span className="mt-1.5 block text-[11px] font-bold uppercase tracking-wider text-[var(--text-2)]">Tables</span>
                </div>
                <div className="flex min-h-[68px] min-w-0 flex-col items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/[0.08] dark:bg-emerald-500/[0.12] px-1.5 py-2 text-center">
                  <strong className="font-mono text-xl font-extrabold leading-none text-emerald-600 dark:text-emerald-400">{b._count?.menuItems ?? 0}</strong>
                  <span className="mt-1.5 block text-[11px] font-bold uppercase tracking-wider text-[var(--text-2)]">Menu Items</span>
                </div>
                <div className="flex min-h-[68px] min-w-0 flex-col items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/[0.08] dark:bg-amber-500/[0.12] px-1.5 py-2 text-center">
                  <strong className="font-mono text-xl font-extrabold leading-none text-amber-600 dark:text-amber-400">{b._count?.users ?? 0}</strong>
                  <span className="mt-1.5 block text-[11px] font-bold uppercase tracking-wider text-[var(--text-2)]">Staff</span>
                </div>
                <div className="flex min-h-[68px] min-w-0 flex-col items-center justify-center rounded-xl border border-sky-500/20 bg-sky-500/[0.08] dark:bg-sky-500/[0.12] px-1.5 py-2 text-center">
                  <strong className="font-mono text-xl font-extrabold leading-none text-sky-600 dark:text-sky-400">{b._count?.orders ?? 0}</strong>
                  <span className="mt-1.5 block text-[11px] font-bold uppercase tracking-wider text-[var(--text-2)]">Orders</span>
                </div>
                <div className="flex min-h-[68px] min-w-0 flex-col items-center justify-center rounded-xl border border-violet-500/20 bg-violet-500/[0.08] dark:bg-violet-500/[0.12] px-1.5 py-2 text-center">
                  <strong className="font-mono text-xl font-extrabold leading-none text-violet-600 dark:text-violet-400">{b._count?.inventoryItems ?? 0}</strong>
                  <span className="mt-1.5 block text-[11px] font-bold uppercase tracking-wider text-[var(--text-2)]">Inventory</span>
                </div>
                <div className="flex min-h-[68px] min-w-0 flex-col items-center justify-center rounded-xl border border-rose-500/20 bg-rose-500/[0.08] dark:bg-rose-500/[0.12] px-1.5 py-2 text-center">
                  <strong className="font-mono text-xl font-extrabold leading-none text-rose-600 dark:text-rose-400">{b._count?.receivings ?? 0}</strong>
                  <span className="mt-1.5 block text-[11px] font-bold uppercase tracking-wider text-[var(--text-2)]">Receivings</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Branch Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 glass-overlay flex items-center justify-center p-4 animate-fade-in">
          <div className="glass-modal max-w-md w-full p-6 space-y-6 animate-scale-up border border-[var(--border-1)]">
            <div className="flex justify-between items-center border-b border-[var(--border-1)] pb-4">
              <h3 className="text-base font-extrabold text-[var(--text-1)] font-display">{editingBranch ? 'Edit Branch Details' : 'Register New Branch'}</h3>
              <button
                onClick={() => { setShowAddModal(false); setEditingBranch(null); setFormData({ name: '', address: '', phone: '' }); }}
                className="p-1.5 rounded-xl bg-[var(--surface-inset)] hover:bg-[var(--surface-hover)] text-[var(--text-3)] hover:text-[var(--text-1)] transition-colors cursor-pointer icon-btn"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateBranch} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-[var(--text-2)] uppercase mb-1 tracking-wider text-[11px]">Branch Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Hostel Block B Canteen"
                  className="w-full px-4 py-2.5 bg-[var(--field-bg)] border border-[var(--field-border)] rounded-xl text-xs text-[var(--text-1)] focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block font-bold text-[var(--text-2)] uppercase mb-1 tracking-wider text-[11px]">Address</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="e.g. Building 4 Ground Floor"
                  className="w-full px-4 py-2.5 bg-[var(--field-bg)] border border-[var(--field-border)] rounded-xl text-xs text-[var(--text-1)] focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block font-bold text-[var(--text-2)] uppercase mb-1 tracking-wider text-[11px]">Contact Phone</label>
                <PhoneInput
                  value={formData.phone}
                  onChange={(val) => setFormData({ ...formData, phone: val })}
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-[var(--border-1)]">
                <button
                  type="button"
                  onClick={() => { setShowAddModal(false); setEditingBranch(null); setFormData({ name: '', address: '', phone: '' }); }}
                  className="px-4 py-2.5 rounded-xl border border-[var(--border-1)] bg-[var(--surface-inset)] hover:bg-[var(--surface-hover)] text-[var(--text-1)] font-bold cursor-pointer text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold transition-all shadow-md cursor-pointer disabled:opacity-60 text-xs"
                >
                  {saving ? 'Saving…' : editingBranch ? 'Save Changes' : 'Register Branch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminBranchesView;


