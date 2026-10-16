import  { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Lock, LogIn, X } from 'lucide-react';

const DemoRestrictionModal = ({ onLogout }) => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleShowModal = () => {
      setIsOpen(true);
    };

    window.addEventListener('show-demo-restriction-modal', handleShowModal);
    return () => window.removeEventListener('show-demo-restriction-modal', handleShowModal);
  }, []);

  if (!isOpen) return null;

  const handleGoToLogin = () => {
    setIsOpen(false);
    if (onLogout) {
      onLogout();
    } else {
      const path = typeof window !== 'undefined' ? window.location.pathname || '' : '';
      if (path.startsWith('/kitchen')) navigate('/kitchen/login');
      else if (path.startsWith('/cashier') || path.startsWith('/vendor')) navigate('/cashier/login');
      else if (path.startsWith('/admin')) navigate('/admin/login');
      else navigate('/customer');
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[999999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-[var(--card-bg)] border border-amber-500/50 rounded-3xl max-w-md w-full p-6 sm:p-8 space-y-6 shadow-2xl text-center relative animate-scale-up">
        {/* Close button */}
        <button
          onClick={() => setIsOpen(false)}
          className="absolute top-4 right-4 p-2 rounded-xl bg-[var(--bg-color)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Lock Icon */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-500 mx-auto shadow-inner">
          <Lock className="w-8 h-8" />
        </div>

        {/* Text Details */}
        <div className="space-y-2">
          <span className="text-[10px] font-extrabold text-amber-500 dark:text-amber-400 uppercase tracking-widest bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full">
            Read-Only Demo Mode
          </span>
          <h3 className="text-xl sm:text-2xl font-black font-display text-[var(--text-main)] pt-1">
            Action Restricted
          </h3>
          <p className="text-xs sm:text-sm text-[var(--text-muted)] leading-relaxed font-medium max-w-xs mx-auto">
            This is a read-only demo account. Modifying system data or performing administrative write actions is restricted.
          </p>
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-500 dark:text-amber-400 text-xs font-bold mt-2">
            💡 Please log in with a Real Staff Account to perform write actions.
          </div>
        </div>

        {/* Buttons */}
        <div className="space-y-2.5 pt-2">
          <button
            onClick={handleGoToLogin}
            className="w-full py-3.5 bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-500 hover:to-orange-600 text-white font-extrabold text-xs sm:text-sm rounded-xl transition-all shadow-lg shadow-orange-600/20 cursor-pointer flex items-center justify-center space-x-2 active:scale-[0.99]"
          >
            <LogIn className="w-4 h-4" />
            <span>Sign In with Real Account</span>
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="w-full py-2.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-main)] font-bold transition-colors cursor-pointer"
          >
            Dismiss &amp; Continue Browsing
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default DemoRestrictionModal;
