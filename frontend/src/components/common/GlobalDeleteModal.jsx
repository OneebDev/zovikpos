import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Trash2, ShieldAlert, X, Loader2 } from 'lucide-react';

/**
 * Universal Global Delete Confirmation Modal
 * Supports:
 * - Single item deletion
 * - Scoped "Delete All" with typed confirmation phrase (e.g. "DELETE")
 * - Detailed list of items/impact scope
 * - Strict backend error and permission handling
 */
const GlobalDeleteModal = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Deletion',
  message = 'Are you sure you want to permanently delete this record? This action cannot be undone.',
  itemCount = 1,
  itemName = '',
  itemDetails = null,
  isScopeAll = false,
  requiredConfirmationText = '',
  warningNotes = [],
  confirmButtonText = 'Delete Record',
  loading = false,
  dangerLevel = 'danger', // 'danger' | 'warning'
}) => {
  const [typedConfirmation, setTypedConfirmation] = useState('');

  useEffect(() => {
    if (isOpen) {
      setTypedConfirmation('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const requiresTyping = Boolean(requiredConfirmationText && requiredConfirmationText.trim().length > 0);
  const isConfirmDisabled = loading || (requiresTyping && typedConfirmation.trim().toUpperCase() !== requiredConfirmationText.trim().toUpperCase());

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div
        className="w-full max-w-lg bg-[#141518] border border-stone-800 rounded-3xl shadow-2xl overflow-hidden transition-all duration-200 transform scale-100 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-stone-800/80 bg-stone-900/40">
          <div className="flex items-center space-x-3">
            <div className={`p-2.5 rounded-2xl border ${
              dangerLevel === 'danger'
                ? 'bg-rose-500/10 border-rose-500/20 text-rose-500'
                : 'bg-amber-500/10 border-amber-500/20 text-amber-500'
            }`}>
              {isScopeAll ? <ShieldAlert className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-extrabold text-stone-100 font-display">
                {title}
              </h3>
              {itemCount > 1 && (
                <span className="text-[11px] font-bold text-amber-400">
                  Target Scope: {itemCount} Records
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1.5 rounded-xl hover:bg-stone-800 text-stone-400 hover:text-stone-200 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {/* Main prompt */}
          <p className="text-sm text-stone-300 leading-relaxed">
            {message}
          </p>

          {/* Record name preview if provided */}
          {itemName && (
            <div className="p-3.5 bg-stone-900/80 rounded-2xl border border-stone-800/90 flex items-center justify-between">
              <span className="text-xs font-semibold text-stone-400">Target Record:</span>
              <span className="text-xs font-bold text-stone-100 max-w-[280px] truncate">{itemName}</span>
            </div>
          )}

          {/* Extra details (key-values) */}
          {itemDetails && (
            <div className="p-3.5 bg-stone-900/60 rounded-2xl border border-stone-800/70 space-y-1.5 text-xs">
              {Object.entries(itemDetails).map(([k, v]) => (
                <div key={k} className="flex justify-between items-center text-stone-400">
                  <span className="capitalize">{k.replace(/([A-Z])/g, ' $1')}:</span>
                  <span className="font-semibold text-stone-200 truncate max-w-[200px]">{String(v ?? 'N/A')}</span>
                </div>
              ))}
            </div>
          )}

          {/* Warnings List */}
          {warningNotes && warningNotes.length > 0 && (
            <div className="p-3.5 bg-rose-950/20 border border-rose-900/30 rounded-2xl space-y-1">
              {warningNotes.map((note, idx) => (
                <p key={idx} className="text-xs text-rose-300 flex items-start space-x-1.5">
                  <span className="text-rose-400 font-bold">•</span>
                  <span>{note}</span>
                </p>
              ))}
            </div>
          )}

          {/* Scoped Delete Confirmation Input */}
          {requiresTyping && (
            <div className="pt-2 space-y-2">
              <label className="block text-xs font-bold text-stone-300">
                Type <span className="text-rose-400 font-black tracking-wider px-1.5 py-0.5 bg-rose-500/10 rounded border border-rose-500/30">{requiredConfirmationText}</span> to authorize deletion:
              </label>
              <input
                type="text"
                value={typedConfirmation}
                onChange={(e) => setTypedConfirmation(e.target.value)}
                placeholder={`Type "${requiredConfirmationText}" here...`}
                disabled={loading}
                autoFocus
                className="w-full px-4 py-2.5 bg-stone-900 border border-stone-700/80 rounded-xl text-stone-100 text-sm font-semibold focus:outline-none focus:border-rose-500 transition-colors"
              />
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t border-stone-800/80 bg-stone-900/30">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2.5 rounded-xl border border-stone-800 hover:bg-stone-800/80 text-stone-300 font-bold text-xs transition-colors disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm()}
            disabled={isConfirmDisabled}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center space-x-2 transition-all shadow-lg cursor-pointer ${
              dangerLevel === 'danger'
                ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/20 disabled:bg-rose-900/40 disabled:text-rose-300/50'
                : 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-900/20 disabled:bg-amber-900/40 disabled:text-amber-300/50'
            } disabled:cursor-not-allowed`}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Processing Deletion...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                <span>{confirmButtonText}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default GlobalDeleteModal;
