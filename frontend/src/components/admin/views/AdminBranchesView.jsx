import React, { useState, useEffect } from 'react';
import {
  Building2,
  Plus,
  CheckCircle2,
  XCircle,
  MapPin,
  Phone,
  X,
} from 'lucide-react';
import api from '../../../services/api';
import PhoneInput from '../../PhoneInput';
import { formatPhoneDisplay } from '../../../utils/phoneUtils';

const AdminBranchesView = ({ showToast }) => {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({ name: '', address: '', phone: '' });

  const fetchBranches = async () => {
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
  };

  useEffect(() => {
    fetchBranches();
  }, []);

  const handleCreateBranch = async (e) => {
    e.preventDefault();
    try {
      await api.post('/admin/branches', formData);
      if (showToast) showToast('New branch registered successfully!');
      setShowAddModal(false);
      setFormData({ name: '', address: '', phone: '' });
      fetchBranches();
    } catch (err) {
      console.error(err);
      if (showToast) showToast(err.response?.data?.error || 'Failed to create branch', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[var(--card-bg)]/40 border border-[var(--border-color)] p-6 rounded-2xl shadow-xl">
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
        <div className="py-16 text-center text-xs font-bold text-[var(--text-muted)] animate-pulse">
          Loading Branches...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {branches.map((b) => (
            <div key={b.id} className="bg-[var(--card-bg)]/40 border border-[var(--border-color)] p-6 rounded-2xl space-y-4 shadow-lg">
              <div className="flex justify-between items-start">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 flex items-center justify-center">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-[var(--text-main)] font-display">{b.name}</h3>
                    <span className="text-[10px] text-orange-400 font-bold">Branch ID: #{b.id}</span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  ACTIVE
                </span>
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

              <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-bold pt-3 border-t border-[var(--border-color)]">
                <div className="p-2 bg-[var(--bg-color)] rounded-xl border border-[var(--border-color)]">
                  <span className="text-[var(--text-muted)] block uppercase">Tables</span>
                  <strong className="text-orange-400 text-xs font-mono">{b._count?.tables || 20}</strong>
                </div>
                <div className="p-2 bg-[var(--bg-color)] rounded-xl border border-[var(--border-color)]">
                  <span className="text-[var(--text-muted)] block uppercase">Items</span>
                  <strong className="text-emerald-400 text-xs font-mono">{b._count?.menuItems || 15}</strong>
                </div>
                <div className="p-2 bg-[var(--bg-color)] rounded-xl border border-[var(--border-color)]">
                  <span className="text-[var(--text-muted)] block uppercase">Staff</span>
                  <strong className="text-amber-400 text-xs font-mono">{b._count?.users || 4}</strong>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Branch Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl max-w-md w-full p-6 space-y-6 shadow-2xl animate-scale-up">
            <div className="flex justify-between items-center border-b border-[var(--border-color)] pb-4">
              <h3 className="text-base font-extrabold text-[var(--text-main)] font-display">Register New Branch</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 rounded-xl bg-[var(--bg-color)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateBranch} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-[var(--text-muted)] uppercase mb-1">Branch Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Hostel Block B Canteen"
                  className="w-full px-4 py-2.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs text-[var(--text-main)] focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block font-bold text-[var(--text-muted)] uppercase mb-1">Address</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="e.g. Building 4 Ground Floor"
                  className="w-full px-4 py-2.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs text-[var(--text-main)] focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block font-bold text-[var(--text-muted)] uppercase mb-1">Contact Phone</label>
                <PhoneInput
                  value={formData.phone}
                  onChange={(val) => setFormData({ ...formData, phone: val })}
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-[var(--border-color)]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-[var(--bg-color)] text-[var(--text-muted)] font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold transition-all shadow-md cursor-pointer"
                >
                  Register Branch
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
