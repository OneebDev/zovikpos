import React from 'react';
import { AlertTriangle, X, RefreshCw, Settings, ArrowRight } from 'lucide-react';

/**
 * PersistentErrorDialog Component
 * Displays critical errors that require explicit user acknowledgment or action.
 * Does NOT auto-dismiss like toasts.
 */
const PersistentErrorDialog = ({
  isOpen,
  title = 'Action Could Not Be Completed',
  message,
  itemName = null,
  fromUnit = null,
  toUnit = null,
  missingConfig = null,
  details = null,
  onClose,
  onRetry = null,
  onConfigure = null,
  actionLabel = null,
  onAction = null,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="persistent-error-title"
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-red-500/30 bg-neutral-900 shadow-2xl text-white">
        {/* Header with warning icon */}
        <div className="flex items-start justify-between p-6 border-b border-neutral-800 bg-red-950/20">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-500/20 text-red-400 border border-red-500/30">
              <AlertTriangle className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <h2 id="persistent-error-title" className="text-lg font-bold text-red-200">
                {title}
              </h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Attention required to proceed safely
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div className="text-sm text-neutral-200 leading-relaxed">
            {message}
          </div>

          {/* Structured item and unit details badge */}
          {(itemName || (fromUnit && toUnit)) && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 space-y-2 text-xs">
              {itemName && (
                <div className="flex justify-between items-center py-1 border-b border-neutral-800/60">
                  <span className="text-neutral-400">Inventory Item:</span>
                  <span className="font-semibold text-neutral-200">{itemName}</span>
                </div>
              )}
              {fromUnit && toUnit && (
                <div className="flex justify-between items-center py-1">
                  <span className="text-neutral-400">Conversion Attempted:</span>
                  <div className="flex items-center gap-1.5 font-mono text-neutral-200">
                    <span className="px-2 py-0.5 rounded bg-neutral-800 border border-neutral-700">{fromUnit}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-neutral-500" />
                    <span className="px-2 py-0.5 rounded bg-orange-950/60 border border-orange-700/60 text-orange-300 font-bold">{toUnit}</span>
                  </div>
                </div>
              )}
              {missingConfig && (
                <div className="pt-2 text-xs text-amber-300/90 font-medium">
                  💡 {missingConfig}
                </div>
              )}
            </div>
          )}

          {details && (
            <p className="text-xs text-neutral-400 bg-neutral-950/40 p-3 rounded-lg font-mono break-all">
              {typeof details === 'object' ? JSON.stringify(details, null, 2) : String(details)}
            </p>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-end gap-2.5 p-4 border-t border-neutral-800 bg-neutral-950/40">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-xl border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition-colors"
          >
            Close
          </button>

          {onConfigure && (
            <button
              type="button"
              onClick={onConfigure}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl border border-orange-500/40 bg-orange-600/20 hover:bg-orange-600/30 text-orange-300 transition-colors"
            >
              <Settings className="h-4 w-4" />
              Configure Item
            </button>
          )}

          {onAction && actionLabel && (
            <button
              type="button"
              onClick={onAction}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-semibold transition-colors"
            >
              {actionLabel}
            </button>
          )}

          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Retry Action
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PersistentErrorDialog;
