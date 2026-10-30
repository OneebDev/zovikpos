import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Package, Check, X, AlertCircle, ArrowRight, Lock } from 'lucide-react';
import PackagingUnitsEditor from './PackagingUnitsEditor';

const STANDARD_BASE_UNITS = ['KG', 'G', 'L', 'ML', 'PCS', 'PACK', 'DOZEN'];

/**
 * ReviewSubUnitsModal
 * Pops up before "Save New Item Names", "Save Draft", or "Confirm Stock"
 * if there are new items or items requiring packaging/sub-unit setup.
 */
export default function ReviewSubUnitsModal({
  isOpen,
  items = [],
  onClose,
  onConfirm,
  actionTitle = 'Proceed'
}) {
  const [itemsState, setItemsState] = useState(() =>
    items.map(it => ({
      ...it,
      baseUnit: (it.baseUnit || it.unit || 'KG').toUpperCase(),
      receivingUnit: (it.receivingUnit || it.unit || 'KG').toUpperCase(),
      packageConversions: it.packageConversions || {}
    }))
  );

  // Sync state if items change
  React.useEffect(() => {
    setItemsState(
      items.map(it => ({
        ...it,
        baseUnit: (it.baseUnit || it.unit || 'KG').toUpperCase(),
        receivingUnit: (it.receivingUnit || it.unit || 'KG').toUpperCase(),
        packageConversions: it.packageConversions || {}
      }))
    );
  }, [items]);

  if (!isOpen || !items || items.length === 0) return null;

  const handleBaseUnitChange = (index, newBaseUnit) => {
    setItemsState(prev =>
      prev.map((it, i) => (i === index ? { ...it, baseUnit: newBaseUnit } : it))
    );
  };

  const handlePackagingChange = (index, updatedPackaging) => {
    setItemsState(prev =>
      prev.map((it, i) => (i === index ? { ...it, packageConversions: updatedPackaging } : it))
    );
  };

  const handleProceed = () => {
    onConfirm?.(itemsState);
  };

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4 animate-fade-in">
      <div className="relative w-full max-w-3xl max-h-[90vh] bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-scale-up">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)] bg-[var(--bg-color)]/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-500/15 text-orange-400 flex items-center justify-center font-bold">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-[var(--text-main)] flex items-center gap-2">
                Review &amp; Set Sub-Units
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-orange-500/20 text-orange-400">
                  {itemsState.length} {itemsState.length === 1 ? 'item' : 'items'}
                </span>
              </h3>
              <p className="text-xs text-[var(--text-muted)]">
                Confirm the <strong>Base Unit</strong> and <strong>Packaging Sub-Units</strong> for these items to ensure accurate inventory tracking.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--card-bg)] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Items List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {itemsState.map((item, idx) => {
            const isReceivingDifferent = item.receivingUnit !== item.baseUnit;

            return (
              <div
                key={item.id || idx}
                className="p-4 rounded-2xl bg-[var(--bg-color)]/70 border border-[var(--border-color)] space-y-3"
              >
                {/* Item Name & Quick Info */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border-color)]/60 pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-lg bg-orange-500/10 text-orange-400 text-xs font-bold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <div>
                      <h4 className="text-sm font-black text-[var(--text-main)]">
                        {item.name || 'Unnamed Item'}
                      </h4>
                      {item.category && (
                        <span className="text-[10px] font-semibold text-[var(--text-muted)]">
                          Category: {item.category}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Base Unit Selector (Locked for existing catalog items) */}
                  {item.inventoryItemId || item.originalRef?.inventoryItemId ? (
                    <div className="flex items-center gap-1.5 bg-[var(--card-bg)] px-3 py-1.5 rounded-xl border border-[var(--border-color)]" title="Base unit is permanently locked in catalog. To change it, delete the item and recreate it.">
                      <Lock className="w-3 h-3 text-[var(--text-muted)]" />
                      <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase shrink-0">
                        Base Unit:
                      </span>
                      <span className="text-xs font-black text-orange-400 font-mono">
                        {item.baseUnit}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 bg-[var(--card-bg)] px-3 py-1.5 rounded-xl border border-[var(--border-color)]">
                      <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase shrink-0">
                        Base Unit:
                      </label>
                      <select
                        value={item.baseUnit}
                        onChange={(e) => handleBaseUnitChange(idx, e.target.value)}
                        className="bg-transparent text-xs font-bold text-orange-400 focus:outline-none cursor-pointer"
                      >
                        {STANDARD_BASE_UNITS.map(u => (
                          <option key={u} value={u} className="bg-[var(--card-bg)] text-[var(--text-main)]">
                            {u}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Receiving Context Notice in Professional English */}
                {isReceivingDifferent && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300">
                    <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                    <span>
                      Receiving as <strong>{item.receivingUnit}</strong> while catalog Base Unit is <strong>{item.baseUnit}</strong>. Please confirm the packaging conversion factor below.
                    </span>
                  </div>
                )}

                {/* Packaging Sub-Units Editor */}
                <PackagingUnitsEditor
                  baseUnit={item.baseUnit}
                  packageConversions={item.packageConversions}
                  onChange={(updated) => handlePackagingChange(idx, updated)}
                />
              </div>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-[var(--border-color)] bg-[var(--bg-color)]/70">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-[var(--border-color)] text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--card-bg)] transition-all cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleProceed}
            className="px-6 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-black text-xs shadow-lg transition-all flex items-center gap-2 cursor-pointer active:scale-95"
          >
            <Check className="w-4 h-4" />
            <span>Confirm &amp; {actionTitle}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
