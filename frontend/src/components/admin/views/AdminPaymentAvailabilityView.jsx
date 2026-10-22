import  { useState, useEffect, useCallback } from 'react';
import {
  Banknote,
  CreditCard,
  Loader2,
} from 'lucide-react';
import api from '../../../services/api';
import { getSocket } from '../../../services/socket';

const AdminPaymentAvailabilityView = ({ showToast }) => {
  const [settings, setSettings] = useState({ codEnabled: true, onlineEnabled: true, updatedAt: null });
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/payments/settings');
      const data = res.data.settings || res.data;
      if (data && typeof data.codEnabled === 'boolean') {
        setSettings(data);
      }
    } catch (err) {
      console.error(err);
      if (showToast) showToast('Failed to load payment availability settings', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchSettings();
    const socket = getSocket();
    if (socket) {
      const handleUpdate = (payload) => {
        const data = payload.settings || payload;
        if (data && typeof data.codEnabled === 'boolean') {
          setSettings(data);
        }
      };
      socket.on('paymentSettings:update', handleUpdate);
      return () => socket.off('paymentSettings:update', handleUpdate);
    }
  }, [fetchSettings]);

  const handleToggle = async (key, value) => {
    setUpdating(true);
    try {
      const updated = { ...settings, [key]: value };
      const res = await api.put('/payments/settings', {
        codEnabled: updated.codEnabled,
        onlineEnabled: updated.onlineEnabled,
      });
      const data = res.data.settings || res.data;
      if (data && typeof data.codEnabled === 'boolean') {
        setSettings(data);
      }
      if (showToast) showToast('Payment availability updated!');
    } catch (err) {
      console.error(err);
      if (showToast) showToast('Failed to update settings', 'error');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="glass-card p-6">
        <h2 className="text-xl font-extrabold text-[var(--text-main)] font-display">Payment Availability Controls</h2>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">Control whether Cash on Delivery (Pay at Counter) and Online Wallet payments are currently accepted by the canteen.</p>
      </div>

      {/* Toggles Grid */}
      {loading ? (
        <div className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)]/40 text-xs font-semibold text-[var(--text-muted)]">
          <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
          <span>Loading payment settingsâ€¦</span>
        </div>
      ) : <div className="grid md:grid-cols-2 gap-6">
        {/* COD Toggle Card */}
        <div className="glass-card p-6 space-y-6">
          <div className="flex justify-between items-start">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <Banknote className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-[var(--text-main)] font-display">Pay at Counter (COD)</h3>
                <span className="text-xs text-[var(--text-muted)]">Cash payments at POS counter</span>
              </div>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border ${
                settings.codEnabled
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                  : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
              }`}
            >
              {settings.codEnabled ? 'OPEN' : 'CLOSED'}
            </span>
          </div>

          <div className="flex justify-between items-center pt-4 border-t border-[var(--border-color)] text-xs">
            <span className="text-[var(--text-muted)] font-bold">Accept Cash Orders:</span>
            <button
              onClick={() => handleToggle('codEnabled', !settings.codEnabled)}
              disabled={updating}
              className={`px-4 py-2 rounded-xl font-extrabold text-xs transition-all cursor-pointer shadow-md ${
                settings.codEnabled
                  ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white'
              }`}
            >
              {settings.codEnabled ? 'Close COD Payment' : 'Open COD Payment'}
            </button>
          </div>
        </div>

        {/* Online Payment Toggle Card */}
        <div className="glass-card p-6 space-y-6">
          <div className="flex justify-between items-start">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/20 text-orange-400 flex items-center justify-center">
                <CreditCard className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-[var(--text-main)] font-display">Online Payment</h3>
                <span className="text-xs text-[var(--text-muted)]">Easypaisa & JazzCash Wallets</span>
              </div>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border ${
                settings.onlineEnabled
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                  : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
              }`}
            >
              {settings.onlineEnabled ? 'OPEN' : 'CLOSED'}
            </span>
          </div>

          <div className="flex justify-between items-center pt-4 border-t border-[var(--border-color)] text-xs">
            <span className="text-[var(--text-muted)] font-bold">Accept Online Orders:</span>
            <button
              onClick={() => handleToggle('onlineEnabled', !settings.onlineEnabled)}
              disabled={updating}
              className={`px-4 py-2 rounded-xl font-extrabold text-xs transition-all cursor-pointer shadow-md ${
                settings.onlineEnabled
                  ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20'
                  : 'bg-orange-600 hover:bg-orange-500 text-white'
              }`}
            >
              {settings.onlineEnabled ? 'Close Online Payment' : 'Open Online Payment'}
            </button>
          </div>
        </div>
      </div>}
    </div>
  );
};

export default AdminPaymentAvailabilityView;

