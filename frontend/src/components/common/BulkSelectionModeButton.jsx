import 'react';
import { CheckSquare, Square } from 'lucide-react';

const BulkSelectionModeButton = ({ active, onClick, selectedCount = 0, className = '', mobileLabel, mobileActiveLabel }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    aria-label={`${active ? 'Done selecting' : 'Select items'}${selectedCount > 0 ? `, ${selectedCount} selected` : ''}`}
    className={`inline-flex shrink-0 items-center justify-center ${mobileLabel ? 'gap-1 px-1 sm:gap-2 sm:px-3' : 'gap-2 px-3'} py-2.5 rounded-xl border text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${className} ${
      active
        ? 'bg-orange-500/10 border-orange-500/30 text-orange-400'
        : 'bg-[var(--bg-color)] border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-main)]'
    }`}
  >
    {active ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
    {mobileLabel ? (
      <>
        <span className="hidden sm:inline">{active ? 'Done selecting' : 'Select items'}</span>
        <span className="sm:hidden">{active ? (mobileActiveLabel || mobileLabel) : mobileLabel}</span>
      </>
    ) : (
      <span>{active ? 'Done selecting' : 'Select items'}</span>
    )}
    {selectedCount > 0 && <span className="rounded-md bg-[var(--card-bg)] px-1 py-0.5 text-[9px] sm:px-1.5 sm:text-[10px]">{selectedCount}</span>}
  </button>
);

export default BulkSelectionModeButton;
