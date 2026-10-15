import React from 'react';
import { CheckSquare, Square } from 'lucide-react';

const BulkSelectionModeButton = ({ active, onClick, selectedCount = 0 }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`inline-flex shrink-0 items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
      active
        ? 'bg-orange-500/10 border-orange-500/30 text-orange-400'
        : 'bg-[var(--bg-color)] border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-main)]'
    }`}
  >
    {active ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
    <span>{active ? 'Done selecting' : 'Select items'}</span>
    {selectedCount > 0 && <span className="px-1.5 py-0.5 rounded-md bg-[var(--card-bg)] text-[10px]">{selectedCount}</span>}
  </button>
);

export default BulkSelectionModeButton;
