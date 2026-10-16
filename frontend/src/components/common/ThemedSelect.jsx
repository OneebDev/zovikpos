import { Children, isValidElement, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const flattenOptions = (children, groupLabel = null) => Children.toArray(children).flatMap((child) => {
  if (!isValidElement(child)) return [];
  if (child.type === 'optgroup') {
    return flattenOptions(child.props.children, child.props.label);
  }
  if (child.type !== 'option') return [];
  return [{
    value: String(child.props.value ?? child.props.children ?? ''),
    label: child.props.children,
    disabled: Boolean(child.props.disabled),
    groupLabel,
  }];
});

const ThemedSelect = ({
  value,
  defaultValue,
  onChange,
  children,
  className = '',
  disabled = false,
  id,
  name,
  title,
  style,
  menuMinWidth = 0,
  containerClassName = '',
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  ...buttonProps
}) => {
  const generatedId = useId();
  const menuId = `${generatedId}-options`;
  const options = useMemo(() => flattenOptions(children), [children]);
  const [uncontrolledValue, setUncontrolledValue] = useState(String(defaultValue ?? options[0]?.value ?? ''));
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState(null);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const selectedValue = String(value ?? uncontrolledValue);
  const selectedOption = options.find((option) => option.value === selectedValue) || options[0];

  const updateMenuPosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, menuMinWidth), window.innerWidth - 16);
    setMenuPosition({
      top: rect.bottom + 4,
      left: Math.min(rect.left, window.innerWidth - width - 8),
      width,
      maxHeight: Math.max(96, window.innerHeight - rect.bottom - 12),
    });
  }, [menuMinWidth]);

  useEffect(() => {
    if (!open) return undefined;
    updateMenuPosition();
    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    const handleViewportChange = () => updateMenuPosition();
    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [open, updateMenuPosition]);

  const chooseOption = (option) => {
    if (!option || option.disabled) return;
    if (value === undefined) setUncontrolledValue(option.value);
    if (option.value !== selectedValue) {
      onChange?.({ target: { value: option.value, name }, currentTarget: { value: option.value, name } });
    }
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleKeyDown = (event) => {
    buttonProps.onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) setOpen(true);
      else {
        const enabled = options.filter((option) => !option.disabled);
        const index = enabled.findIndex((option) => option.value === selectedValue);
        const next = enabled[(index + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length];
        if (next) chooseOption(next);
      }
    } else if ((event.key === 'Enter' || event.key === ' ') && !open) {
      event.preventDefault();
      setOpen(true);
    }
  };

  let previousGroup = null;
  const menu = open && menuPosition ? createPortal(
    <div
      id={menuId}
      ref={menuRef}
      role="listbox"
      aria-label={ariaLabel}
      style={{ position: 'fixed', top: menuPosition.top, left: menuPosition.left, width: menuPosition.width, maxHeight: menuPosition.maxHeight }}
      className="z-[10000] overflow-y-auto overscroll-contain rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-1.5 text-[var(--text-main)] shadow-2xl"
    >
      {options.map((option, index) => {
        const showGroup = option.groupLabel && option.groupLabel !== previousGroup;
        previousGroup = option.groupLabel;
        return (
          <div key={`${option.value}-${index}`}>
            {showGroup && <div className="px-3 pb-1 pt-2 text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">{option.groupLabel}</div>}
            <button
              type="button"
              role="option"
              aria-selected={option.value === selectedValue}
              disabled={option.disabled}
              onClick={() => chooseOption(option)}
              className={`block min-h-9 w-full rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${option.value === selectedValue ? 'bg-orange-500/15 text-orange-400' : 'text-[var(--text-main)] hover:bg-[var(--bg-color)]'}`}
            >
              {option.label}
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  ) : null;

  return (
    <div ref={rootRef} className={`relative min-w-0 ${containerClassName}`}>
      <button
        {...buttonProps}
        ref={triggerRef}
        id={id}
        type="button"
        title={title}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        onKeyDown={handleKeyDown}
        onClick={(event) => {
          buttonProps.onClick?.(event);
          if (!event.defaultPrevented && !disabled) setOpen((current) => !current);
        }}
        style={style}
        className={`flex w-full min-w-0 cursor-pointer items-center justify-between gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50 disabled:cursor-not-allowed ${className}`}
      >
        <span className="min-w-0 truncate">{selectedOption?.label ?? ''}</span>
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {name && <input type="hidden" name={name} value={selectedValue} />}
      {menu}
    </div>
  );
};

export default ThemedSelect;
