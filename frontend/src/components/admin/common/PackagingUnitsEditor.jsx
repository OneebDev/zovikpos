import React, { useState } from 'react';
import { Package, Plus, Trash2, Check, AlertCircle, Edit2, X } from 'lucide-react';

const COMMON_PACKAGING_SUGGESTIONS = [
  'BORI',
  'BAG',
  'CARTON',
  'PACK',
  'BOX',
  'BLOCK',
  'TIN',
  'CAN',
  'BOTTLE',
  'CRATE',
  'TRAY',
  'PETI',
  'GALLON'
];

/**
 * PackagingUnitsEditor
 * Responsive row-based packaging unit editor with clean inline editing.
 */
export default function PackagingUnitsEditor({
  packageConversions = {},
  baseUnit = 'KG',
  onChange,
  disabled = false
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [newUnitName, setNewUnitName] = useState('');
  const [newFactor, setNewFactor] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Inline editing state
  const [editingKey, setEditingKey] = useState(null);
  const [editName, setEditName] = useState('');
  const [editFactor, setEditFactor] = useState('');

  const conversions = packageConversions && typeof packageConversions === 'object' ? packageConversions : {};
  const entries = Object.entries(conversions);

  const handleAdd = (e) => {
    e?.preventDefault();
    setErrorMsg('');

    const name = newUnitName.trim().toUpperCase();
    const factorNum = parseFloat(newFactor);

    if (!name) {
      setErrorMsg('Please enter a packaging unit name (e.g., BORI, PACK, BLOCK).');
      return;
    }

    if (name === baseUnit.toUpperCase()) {
      setErrorMsg(`"${name}" is already the Base Unit. Pick a packaging name.`);
      return;
    }

    if (!factorNum || factorNum <= 0) {
      setErrorMsg(`Please enter how many ${baseUnit} are in 1 ${name}.`);
      return;
    }

    const updated = {
      ...conversions,
      [name]: {
        factor: factorNum,
        targetUnit: baseUnit.toUpperCase(),
        label: `${name} (${factorNum} ${baseUnit.toUpperCase()})`
      }
    };

    onChange?.(updated);
    setNewUnitName('');
    setNewFactor('');
  };

  const handleStartEdit = (key, val) => {
    const f = typeof val === 'number' ? val : (val?.factor ?? 1);
    setEditingKey(key);
    setEditName(key);
    setEditFactor(String(f));
    setErrorMsg('');
  };

  const handleCancelEdit = () => {
    setEditingKey(null);
    setEditName('');
    setEditFactor('');
  };

  const handleSaveEdit = (oldKey) => {
    setErrorMsg('');
    const newKey = editName.trim().toUpperCase();
    const factorNum = parseFloat(editFactor);

    if (!newKey) {
      setErrorMsg('Packaging unit name cannot be empty.');
      return;
    }

    if (newKey === baseUnit.toUpperCase()) {
      setErrorMsg(`"${newKey}" is the Base Unit. Packaging name must be different.`);
      return;
    }

    if (!factorNum || factorNum <= 0) {
      setErrorMsg(`Please enter a valid number greater than 0.`);
      return;
    }

    const updated = {};
    for (const [k, v] of Object.entries(conversions)) {
      if (k === oldKey) {
        updated[newKey] = {
          factor: factorNum,
          targetUnit: baseUnit.toUpperCase(),
          label: `${newKey} (${factorNum} ${baseUnit.toUpperCase()})`
        };
      } else {
        updated[k] = v;
      }
    }

    onChange?.(updated);
    handleCancelEdit();
  };

  const handleRemove = (unitKey) => {
    const updated = { ...conversions };
    delete updated[unitKey];
    if (editingKey === unitKey) {
      handleCancelEdit();
    }
    onChange?.(updated);
  };

  return (
    <div className="mt-2 pt-2 border-t border-[var(--border-color)]/60 text-xs">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 text-orange-400 hover:text-orange-300 font-bold transition-all cursor-pointer text-[11px]"
        >
          <Package className="w-3.5 h-3.5" />
          <span>
            {entries.length > 0
              ? `Packaging Sub-Units (${entries.length} defined)`
              : '+ Set Packaging Sub-Units (Bori, Pack, Carton, Block)'}
          </span>
          <span className="text-[10px] text-[var(--text-muted)] font-normal">
            {isOpen ? '▲ Hide' : '▼ Setup'}
          </span>
        </button>

        {entries.length > 0 && !isOpen && (
          <div className="flex flex-wrap gap-1 max-w-[65%] justify-end">
            {entries.slice(0, 3).map(([key, val]) => {
              const f = typeof val === 'number' ? val : val?.factor;
              return (
                <span
                  key={key}
                  className="px-2 py-0.5 rounded-md bg-orange-500/10 text-orange-400 font-mono text-[9px] border border-orange-500/20"
                >
                  1 {key} = {f} {baseUnit}
                </span>
              );
            })}
            {entries.length > 3 && (
              <span className="text-[9px] text-[var(--text-muted)]">+{entries.length - 3} more</span>
            )}
          </div>
        )}
      </div>

      {isOpen && (
        <div className="mt-2.5 p-3 rounded-xl bg-[var(--bg-color)]/60 border border-[var(--border-color)] space-y-3 animate-fade-in">
          <div className="text-[10px] text-[var(--text-muted)] leading-relaxed">
            Define how supplier packs convert into your <strong>Base Unit ({baseUnit})</strong>. Example: 
            <span className="text-orange-400 font-mono font-bold ml-1">1 Bori = 50 {baseUnit}</span>, or 
            <span className="text-orange-400 font-mono font-bold ml-1">1 Carton = 12 {baseUnit}</span>.
          </div>

          {/* Clean Row-Wise Stack of Packaging Units */}
          {entries.length > 0 ? (
            <div className="flex flex-col gap-2">
              {entries.map(([key, val]) => {
                const f = typeof val === 'number' ? val : val?.factor;
                const isEditingThis = editingKey === key;

                if (isEditingThis) {
                  return (
                    <div
                      key={key}
                      className="p-2.5 rounded-xl bg-[var(--card-bg)] border-2 border-orange-500/70 shadow-lg space-y-2"
                    >
                      <div className="flex items-center justify-between text-[10px] font-bold text-orange-400 uppercase">
                        <span className="flex items-center gap-1.5">
                          <Edit2 className="w-3 h-3" />
                          <span>Editing Packaging Unit: {key}</span>
                        </span>
                        <span className="text-[9px] text-[var(--text-muted)] lowercase font-normal">
                          base unit: {baseUnit}
                        </span>
                      </div>

                      {/* Full-width responsive edit row */}
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        {/* Packaging Name Input */}
                        <div className="flex-1 min-w-[120px]">
                          <label className="block text-[9px] font-bold text-[var(--text-muted)] uppercase mb-0.5">
                            Unit Name
                          </label>
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value.toUpperCase())}
                            placeholder="e.g. CARTON"
                            className="h-9 w-full px-2.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-lg text-xs font-bold text-[var(--text-main)] uppercase focus:outline-none focus:border-orange-500"
                          />
                        </div>

                        <span className="hidden sm:inline-block text-xs font-bold text-[var(--text-muted)] pt-3.5">
                          =
                        </span>

                        {/* Factor Input */}
                        <div className="flex-1 min-w-[140px]">
                          <label className="block text-[9px] font-bold text-[var(--text-muted)] uppercase mb-0.5">
                            Quantity in {baseUnit}
                          </label>
                          <div className="relative flex items-center">
                            <input
                              type="number"
                              step="any"
                              min="0.001"
                              value={editFactor}
                              onChange={(e) => setEditFactor(e.target.value)}
                              placeholder={`Amount of ${baseUnit}`}
                              className="h-9 w-full pl-2.5 pr-14 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-lg text-xs font-mono font-bold text-orange-400 focus:outline-none focus:border-orange-500"
                            />
                            <span className="absolute right-2.5 text-[10px] font-bold text-[var(--text-muted)] uppercase pointer-events-none">
                              {baseUnit}
                            </span>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1.5 sm:pt-3.5">
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(key)}
                            className="h-9 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm flex items-center justify-center gap-1 cursor-pointer transition-all active:scale-95 flex-1 sm:flex-initial"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Save</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelEdit}
                            className="h-9 px-2.5 rounded-lg bg-[var(--bg-color)] hover:bg-rose-500/10 text-[var(--text-muted)] hover:text-rose-400 text-xs font-bold cursor-pointer border border-[var(--border-color)] flex items-center justify-center gap-1 transition-all"
                            title="Cancel editing"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span className="sm:hidden">Cancel</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={key}
                    className="flex flex-row items-center justify-between p-2.5 rounded-xl bg-[var(--card-bg)] border border-[var(--border-color)] hover:border-orange-500/40 transition-all text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0" />
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-bold text-[var(--text-main)] text-xs tracking-wide">
                          1 {key}
                        </span>
                        <span className="text-[var(--text-muted)] text-[11px]">=</span>
                        <span className="font-mono font-extrabold text-orange-400 text-xs">
                          {f} {baseUnit}
                        </span>
                      </div>
                    </div>

                    {!disabled && (
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(key, val)}
                          className="px-2 py-1 rounded-lg text-[var(--text-muted)] hover:text-orange-400 hover:bg-orange-500/10 border border-transparent hover:border-orange-500/20 transition-all cursor-pointer flex items-center gap-1 text-[11px] font-semibold"
                          title={`Edit 1 ${key} multiplier`}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemove(key)}
                          className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                          title={`Delete ${key}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-[var(--card-bg)]/40 border border-dashed border-[var(--border-color)] text-[11px] text-[var(--text-muted)] italic text-center">
              No custom packaging defined yet. Add one below (e.g. BORI, PACK, BLOCK, CARTON).
            </div>
          )}

          {/* Form to Add New Packaging Unit */}
          {!disabled && (
            <div className="pt-2 border-t border-[var(--border-color)]/50 space-y-2.5">
              <div className="text-[10px] font-bold text-[var(--text-main)] uppercase tracking-wider">
                + Add Custom Packaging Unit
              </div>

              {/* Quick suggestions pills */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[9px] text-[var(--text-muted)]">Quick:</span>
                {COMMON_PACKAGING_SUGGESTIONS.map((sug) => (
                  <button
                    key={sug}
                    type="button"
                    onClick={() => setNewUnitName(sug)}
                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold border transition-all cursor-pointer ${
                      newUnitName === sug
                        ? 'bg-orange-500 text-white border-orange-500'
                        : 'bg-[var(--card-bg)] hover:bg-orange-500/10 text-[var(--text-muted)] hover:text-orange-400 border-[var(--border-color)]'
                    }`}
                  >
                    {sug}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.3fr_auto] gap-2 items-end">
                <div>
                  <label className="block text-[9px] font-bold text-[var(--text-muted)] uppercase mb-1">
                    Packaging Name *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. BORI, BLOCK, PACK"
                    value={newUnitName}
                    onChange={(e) => setNewUnitName(e.target.value.toUpperCase())}
                    className="h-9 w-full px-2.5 py-1 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg text-xs font-bold text-[var(--text-main)] focus:outline-none focus:border-orange-500 uppercase"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-[var(--text-muted)] uppercase mb-1">
                    1 {newUnitName || 'Unit'} contains how many {baseUnit}? *
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type="number"
                      step="any"
                      min="0.001"
                      placeholder={`e.g. 50 (for 50 ${baseUnit})`}
                      value={newFactor}
                      onChange={(e) => setNewFactor(e.target.value)}
                      className="h-9 w-full pl-2.5 pr-14 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg text-xs font-mono font-bold text-orange-400 focus:outline-none focus:border-orange-500"
                    />
                    <span className="absolute right-2.5 text-[10px] font-bold text-[var(--text-muted)] uppercase pointer-events-none">
                      {baseUnit}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAdd}
                  className="h-9 px-3.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Unit</span>
                </button>
              </div>

              {errorMsg && (
                <div className="flex items-center gap-1.5 text-rose-400 text-[10px] font-bold">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
