import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, LogIn, Flame, CreditCard, Crown, Mail } from 'lucide-react';
import { getSocket } from '../services/socket';

const ROLE_DISPLAY = {
  ADMIN: {
    label: 'System Administrator',
    route: '/admin/login',
    icon: Crown,
    color: 'text-orange-500 bg-orange-500/10 border-orange-500/30',
  },
  VENDOR: {
    label: 'Cashier / Vendor',
    route: '/cashier/login',
    icon: CreditCard,
    color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30',
  },
  KITCHEN: {
    label: 'Kitchen Staff',
    route: '/kitchen/login',
    icon: Flame,
    color: 'text-amber-500 bg-amber-500/10 border-amber-500/30',
  },
  CUSTOMER: {
    label: 'Customer',
    route: '/customer',
    icon: ShieldAlert,
    color: 'text-rose-500 bg-rose-500/10 border-rose-500/30',
  },
};

const RoleChangeModal = ({ currentUser, onLogout }) => {
  const navigate = useNavigate();
  const [modalData, setModalData] = useState(null);

  useEffect(() => {
    // 1. Listen for real-time WebSocket event from backend
    const socket = getSocket();

    const handleAccountUpdated = (data) => {
      if (!data) return;

      // Check if logged in user is affected by this update
      const storedUserRaw = localStorage.getItem('user');
      const storedCustomerRaw = localStorage.getItem('customer_user');
      const storedUser = storedUserRaw
        ? JSON.parse(storedUserRaw)
        : (storedCustomerRaw ? JSON.parse(storedCustomerRaw) : currentUser);

      if (!storedUser || storedUser.isGuest) return;

      const isMatchingUser =
        (data.userId && Number(data.userId) === Number(storedUser.id)) ||
        (data.email && data.email.toLowerCase() === storedUser.email?.toLowerCase());

      if (isMatchingUser) {
        const isDeactivatedOrBlocked =
          data.action === 'ACCOUNT_DEACTIVATED' ||
          data.action === 'ACCOUNT_BLOCKED' ||
          data.action === 'ACCOUNT_DELETED' ||
          data.action === 'STAFF_ACCOUNT_DEACTIVATED' ||
          data.isActive === false;

        // Perform immediate background logout so the deactivated/blocked user cannot perform any further actions
        if (isDeactivatedOrBlocked && onLogout) {
          try {
            onLogout();
          } catch (e) {
            console.error('Logout on deactivation error:', e);
          }
        }

        setModalData({
          newRole: data.newRole || storedUser.role,
          oldRole: data.oldRole || storedUser.role,
          isActive: !isDeactivatedOrBlocked,
          action: data.action,
          userEmail: storedUser.email || '',
          message:
            data.message ||
            (isDeactivatedOrBlocked
              ? 'Your account has been deactivated or disabled by Admin.'
              : `Your account role has been updated to ${data.newRole}.`),
        });
      }
    };

    if (socket) {
      socket.on('staff:account-updated', handleAccountUpdated);
      socket.on('customer:account-blocked', handleAccountUpdated);
      socket.on('customer:account-deactivated', handleAccountUpdated);
    }

    // 2. Custom event listener for HTTP interceptors (e.g. 401/403 deactivation response)
    const handleCustomModalEvent = (event) => {
      if (event.detail) {
        if (event.detail.isActive === false && onLogout) {
          try {
            onLogout();
          } catch (e) {
            console.error('Logout on custom deactivation error:', e);
          }
        }
        setModalData(event.detail);
      }
    };
    window.addEventListener('show-role-change-modal', handleCustomModalEvent);

    return () => {
      if (socket) {
        socket.off('staff:account-updated', handleAccountUpdated);
        socket.off('customer:account-blocked', handleAccountUpdated);
        socket.off('customer:account-deactivated', handleAccountUpdated);
      }
      window.removeEventListener('show-role-change-modal', handleCustomModalEvent);
    };
  }, [currentUser, onLogout]);

  if (!modalData) return null;

  const targetRoleConfig = ROLE_DISPLAY[modalData.newRole] || ROLE_DISPLAY.VENDOR;
  const RoleIcon = targetRoleConfig.icon;

  const handleProceedToLogin = () => {
    const targetRoute = targetRoleConfig.route;
    setModalData(null);
    if (onLogout) {
      onLogout();
    }
    navigate(targetRoute);
  };

  const handleContactSupport = () => {
    const supportEmail = 'support@zovikpos.store';
    const emailSubject = encodeURIComponent('Account Deactivation Appeal / Support Inquiry');
    const emailBody = encodeURIComponent(
      `Hello Zovik POS Support Team,\n\nMy account has been deactivated or disabled.\nAccount Email: ${modalData.userEmail || (currentUser && currentUser.email) || ''}\n\nPlease review my account status.\n\nThank you.`
    );

    // Deep link directly to Gmail compose with support@zovikpos.store pre-filled
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${supportEmail}&su=${emailSubject}&body=${emailBody}`;
    const mailtoUrl = `mailto:${supportEmail}?subject=${emailSubject}&body=${emailBody}`;

    // Try opening Gmail directly in a new tab; fallback to standard mailto
    const opened = window.open(gmailUrl, '_blank', 'noopener,noreferrer');
    if (!opened || opened.closed || typeof opened.closed === 'undefined') {
      window.location.href = mailtoUrl;
    }
  };

  return (
    <div className="fixed inset-0 z-[99999] bg-black/85 backdrop-blur-xl flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-[var(--card-bg)] border border-orange-500/40 rounded-3xl max-w-md w-full p-6 sm:p-8 space-y-6 shadow-2xl text-center relative animate-scale-up">

        {/* Ambient Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-orange-500/10 blur-[80px] pointer-events-none rounded-full" />

        {/* Icon */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-orange-500/15 border border-orange-500/30 text-orange-500 mx-auto shadow-inner">
          <ShieldAlert className="w-8 h-8 animate-pulse" />
        </div>

        {/* Title & Details */}
        <div className="space-y-3 relative z-10">
          <span className="text-[10px] font-extrabold text-orange-500 uppercase tracking-widest bg-orange-500/10 border border-orange-500/20 px-3 py-1 rounded-full">
            Real-Time Security Notice
          </span>

          <h3 className="text-xl sm:text-2xl font-black font-display text-[var(--text-main)]">
            {modalData.isActive === false ? 'Account Deactivated' : 'Account Role Updated'}
          </h3>

          <p className="text-xs sm:text-sm text-[var(--text-muted)] leading-relaxed font-medium max-w-xs mx-auto">
            {modalData.isActive === false
              ? 'Your account has been deactivated or disabled by Admin.'
              : modalData.message}
          </p>

          {/* New Role Card Badge (Only if role was changed, NOT when deactivated) */}
          {modalData.isActive !== false && (
            <div className={`p-3.5 rounded-2xl border ${targetRoleConfig.color} flex items-center justify-center space-x-3 mt-3 shadow-sm`}>
              <RoleIcon className="w-5 h-5 shrink-0" />
              <div className="text-left">
                <span className="text-[10px] uppercase tracking-wider font-extrabold block opacity-80">New Assigned Role</span>
                <span className="text-sm font-black">{targetRoleConfig.label}</span>
              </div>
            </div>
          )}
        </div>

        {/* Action Button */}
        <div className="pt-2 relative z-10 space-y-2">
          {modalData.isActive === false ? (
            // Deactivated/Blocked: Contact Support button directly opening Gmail to support@zovikpos.store
            <button
              onClick={handleContactSupport}
              className="w-full py-3.5 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-extrabold text-xs sm:text-sm rounded-xl transition-all shadow-lg shadow-orange-600/20 cursor-pointer flex items-center justify-center space-x-2 active:scale-[0.99]"
            >
              <Mail className="w-4 h-4" />
              <span>Contact Support (support@zovikpos.store)</span>
            </button>
          ) : (
            // Role changed: Navigate to relevant login
            <button
              onClick={handleProceedToLogin}
              className="w-full py-3.5 bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-500 hover:to-orange-600 text-white font-extrabold text-xs sm:text-sm rounded-xl transition-all shadow-lg shadow-orange-600/20 cursor-pointer flex items-center justify-center space-x-2 active:scale-[0.99]"
            >
              <LogIn className="w-4 h-4" />
              <span>Go to {targetRoleConfig.label} Login</span>
            </button>
          )}
        </div>

      </div>
    </div>
  );
};

export default RoleChangeModal;
