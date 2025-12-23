"use client";
import { useState } from "react";

export interface BrandOption {
  value: string;
  label: string;
}

export interface BrandSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: BrandOption[];
  placeholder: string;
  disabled?: boolean;
}

export function BrandSelect({ value, onChange, options, placeholder, disabled }: BrandSelectProps) {
  const [open, setOpen] = useState(false);

  const showLabel = value
    ? options.find((o) => o.value === value)?.label ?? value
    : placeholder;

  const baseClasses =
    "mt-1 h-10 w-full rounded-md border border-[#1f3f36] bg-[#0f2a22] text-white px-4 pr-10 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#005f40] flex items-center justify-between" +
    (disabled ? " opacity-60 cursor-not-allowed" : " cursor-pointer");

  return (
    <div
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        disabled={disabled}
        className={baseClasses + (!value ? " text-white/40" : "")}
        onClick={() => {
          if (!disabled) setOpen((prev) => !prev);
        }}
      >
        <span className="truncate text-left">{showLabel}</span>
        <span className="ml-2 text-white/50">▾</span>
      </button>
      {open && !disabled && options.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md bg-[#071f19] py-1 text-sm shadow-lg ring-1 ring-white/10">
          {options.map((opt) => (
            <li key={opt.value}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-white/90 hover:bg-white/5"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

