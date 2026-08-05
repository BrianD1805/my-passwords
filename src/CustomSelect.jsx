import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

function normaliseOptions(options = []) {
  return options.map((option) => {
    if (typeof option === 'string') return { value: option, label: option, disabled: false };
    return {
      value: String(option?.value ?? ''),
      label: String(option?.label ?? option?.value ?? ''),
      disabled: Boolean(option?.disabled)
    };
  });
}

function nextEnabledIndex(options, startIndex, direction) {
  if (!options.length) return -1;
  let index = startIndex;
  for (let step = 0; step < options.length; step += 1) {
    index = (index + direction + options.length) % options.length;
    if (!options[index]?.disabled) return index;
  }
  return -1;
}

export default function CustomSelect({
  value = '',
  onChange,
  options = [],
  disabled = false,
  placeholder = 'Select an option',
  ariaLabel = 'Choose an option',
  className = '',
  name = ''
}) {
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const listboxId = useId();
  const normalisedOptions = useMemo(() => normaliseOptions(options), [options]);
  const selectedIndex = normalisedOptions.findIndex((option) => option.value === String(value ?? ''));
  const selectedOption = selectedIndex >= 0 ? normalisedOptions[selectedIndex] : null;
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 280, openUpward: false });

  function calculatePosition() {
    const trigger = triggerRef.current;
    if (!trigger || typeof window === 'undefined') return;

    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const edge = 10;
    const gap = 7;
    const estimatedHeight = Math.min(286, Math.max(64, normalisedOptions.length * 48 + 12));
    const spaceBelow = viewportHeight - rect.bottom - edge - gap;
    const spaceAbove = rect.top - edge - gap;
    const openUpward = spaceBelow < Math.min(estimatedHeight, 190) && spaceAbove > spaceBelow;
    const availableHeight = Math.max(112, openUpward ? spaceAbove : spaceBelow);
    const maxHeight = Math.min(estimatedHeight, availableHeight);
    const width = Math.min(Math.max(rect.width, 180), viewportWidth - (edge * 2));
    const left = Math.min(Math.max(edge, rect.left), viewportWidth - edge - width);
    const top = openUpward
      ? Math.max(edge, rect.top - maxHeight - gap)
      : Math.min(viewportHeight - edge - maxHeight, rect.bottom + gap);

    setPosition({ top, left, width, maxHeight, openUpward });
  }

  function openMenu(preferredDirection = 1) {
    if (disabled || !normalisedOptions.length) return;
    const preferredIndex = selectedIndex >= 0 && !normalisedOptions[selectedIndex]?.disabled
      ? selectedIndex
      : nextEnabledIndex(normalisedOptions, preferredDirection > 0 ? -1 : 0, preferredDirection);
    setActiveIndex(preferredIndex);
    calculatePosition();
    setOpen(true);
  }

  function closeMenu({ returnFocus = false } = {}) {
    setOpen(false);
    if (returnFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function chooseOption(option, index) {
    if (!option || option.disabled) return;
    onChange?.(option.value, option, index);
    closeMenu({ returnFocus: true });
  }

  function handleTriggerKeyDown(event) {
    if (disabled) return;

    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        openMenu(event.key === 'ArrowUp' ? -1 : 1);
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openMenu(1);
      }
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((current) => nextEnabledIndex(normalisedOptions, current, direction));
      return;
    }

    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const direction = event.key === 'Home' ? 1 : -1;
      const start = event.key === 'Home' ? -1 : 0;
      setActiveIndex(nextEnabledIndex(normalisedOptions, start, direction));
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      chooseOption(normalisedOptions[activeIndex], activeIndex);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu({ returnFocus: true });
      return;
    }

    if (event.key === 'Tab') closeMenu();
  }

  useEffect(() => {
    if (!open) return undefined;
    calculatePosition();

    const update = () => calculatePosition();
    const handlePointerDown = (event) => {
      if (triggerRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      closeMenu();
    };

    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    document.addEventListener('pointerdown', handlePointerDown);

    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [open, normalisedOptions.length]);

  useEffect(() => {
    if (disabled && open) closeMenu();
  }, [disabled, open]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const activeOption = menuRef.current?.querySelector(`[data-option-index="${activeIndex}"]`);
    activeOption?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  return (
    <div className={`custom-select ${open ? 'is-open' : ''} ${disabled ? 'is-disabled' : ''} ${className}`.trim()}>
      {name ? <input type="hidden" name={name} value={String(value ?? '')} /> : null}
      <button
        ref={triggerRef}
        type="button"
        className="custom-select-trigger"
        disabled={disabled}
        onClick={() => (open ? closeMenu() : openMenu(1))}
        onKeyDown={handleTriggerKeyDown}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
      >
        <span className={selectedOption ? 'custom-select-value' : 'custom-select-value placeholder'}>
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDown className="custom-select-chevron" size={18} aria-hidden="true" />
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          className={`custom-select-menu ${position.openUpward ? 'opens-upward' : 'opens-downward'}`}
          role="presentation"
          style={{
            top: `${position.top}px`,
            left: `${position.left}px`,
            width: `${position.width}px`,
            maxHeight: `${position.maxHeight}px`
          }}
        >
          <div
            id={listboxId}
            ref={menuRef}
            className="custom-select-scroll"
            role="listbox"
            aria-label={ariaLabel}
            style={{ maxHeight: `${Math.max(80, position.maxHeight - 14)}px` }}
          >
            {normalisedOptions.map((option, index) => {
              const selected = option.value === String(value ?? '');
              const active = index === activeIndex;
              return (
                <button
                  key={`${option.value}-${index}`}
                  id={`${listboxId}-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  aria-disabled={option.disabled || undefined}
                  disabled={option.disabled}
                  data-option-index={index}
                  className={`custom-select-option ${selected ? 'selected' : ''} ${active ? 'active' : ''}`.trim()}
                  onMouseEnter={() => !option.disabled && setActiveIndex(index)}
                  onClick={() => chooseOption(option, index)}
                >
                  <span>{option.label}</span>
                  {selected ? <Check size={17} aria-hidden="true" /> : <span className="custom-select-check-space" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
