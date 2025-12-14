// src/components/boxes/BoxDetailModal.tsx
"use client";
import { useState } from "react";
import { fmtWeightPairFromLb } from "@/lib/weight";

// Types
type Box = {
  id: string;
  code: string;
  itemIds: string[];
  clientId: string;
  country?: string;
  type?: "COMERCIAL" | "FRANQUICIA";
  weightLb?: number;
  labelRef?: string;
};

type DetailItem = { id: string; tracking: string; weightLb: number; photoUrl?: string };

interface BrandOption {
  value: string;
  label: string;
}

interface BrandSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: BrandOption[];
  placeholder: string;
  disabled?: boolean;
}

function BrandSelect({ value, onChange, options, placeholder, disabled }: BrandSelectProps) {
  const [open, setOpen] = useState(false);

  const showLabel = value
    ? options.find((o) => o.value === value)?.label ?? value
    : placeholder;

  const inputCls = `h-10 w-full rounded-md border border-[#1f3f36] bg-[#0f2a22] px-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#005f40]`;
  const baseClasses =
    inputCls +
    " flex items-center justify-between pr-8" +
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
        className={baseClasses + (!value ? " text-white/50" : "")}
        onClick={() => {
          if (!disabled) setOpen((prev) => !prev);
        }}
      >
        <span className="truncate text-left">{showLabel}</span>
        <span className="ml-2 text-[#005f40]">▾</span>
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

function IconTrash({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <path d="M3 6h18"/>
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6M14 11v6"/>
    </svg>
  );
}

const CONTROL_BORDER = "border-[#1f3f36]";
const btnSecondaryCls = `inline-flex items-center justify-center h-10 px-4 rounded-md border ${CONTROL_BORDER} bg-white/5 text-white/90 font-medium hover:bg-white/10 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#005f40] disabled:opacity-50 disabled:cursor-not-allowed`;
const inputCls = `h-10 w-full rounded-md border ${CONTROL_BORDER} bg-[#0f2a22] px-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#005f40]`;
const INPUT_BG_STYLE = {
  backgroundColor: "#0f2a22",
  WebkitBoxShadow: "0 0 0px 1000px #0f2a22 inset",
  WebkitTextFillColor: "#ffffff",
} as const;

export interface BoxDetailModalProps {
  open: boolean;
  box: Box | null;
  items: DetailItem[];
  loading: boolean;
  editType: "COMERCIAL" | "FRANQUICIA";
  onChangeType: (v: "COMERCIAL" | "FRANQUICIA") => void;
  onApplyType: () => void;
  labelRef: string;
  onChangeLabelRef: (v: string) => void;
  onBlurSaveLabelRef: () => void;
  onPrintLabel: () => void;
  onRemoveItem: (itemId: string) => void;
  weightText: string;
  onClose: () => void;
}

export function BoxDetailModal({
  open,
  box,
  items,
  loading,
  editType,
  onChangeType,
  onApplyType,
  labelRef,
  onChangeLabelRef,
  onBlurSaveLabelRef,
  onPrintLabel,
  onRemoveItem,
  weightText,
  onClose,
}: BoxDetailModalProps) {
  if (!open || !box) return null;

  return (
    <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center">
      <div className="w-[95vw] max-w-3xl rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm shadow-xl p-4 md:p-6 text-white">
        <div className="flex flex-col gap-3 mb-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold text-white">
              CAJA: {box.code}
            </h3>
            <button
              className={btnSecondaryCls}
              onClick={onClose}
            >
              Cerrar
            </button>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <label className="text-sm text-white/60">Tipo:</label>
            <div className="min-w-[180px]">
              <BrandSelect
                value={editType}
                onChange={(val) => onChangeType(val as any)}
                options={[
                  { value: "COMERCIAL", label: "Comercial" },
                  { value: "FRANQUICIA", label: "Franquicia" },
                ]}
                placeholder="Seleccionar tipo"
              />
            </div>
            <button
              className={btnSecondaryCls}
              onClick={() => {
                void onApplyType();
              }}
            >
              Aplicar
            </button>
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <label className="text-sm text-white/60 md:col-span-2">
              Referencia
              <input
                className={inputCls}
                style={INPUT_BG_STYLE}
                value={labelRef}
                onChange={(e) => onChangeLabelRef(e.target.value)}
                onBlur={() => {
                  void onBlurSaveLabelRef();
                }}
                placeholder="Campo editable"
              />
            </label>
            <div className="flex justify-end">
              <button
                className="h-10 px-4 rounded-md bg-[#eb6619] text-white font-medium shadow hover:brightness-110 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#eb6619]"
                onClick={onPrintLabel}
              >
                Imprimir etiqueta
              </button>
            </div>
          </div>
        </div>
        {loading ? (
          <div className="text-sm text-white/60">Cargando…</div>
        ) : (
          <div className="overflow-x-auto rounded-md border border-[#1f3f36] bg-[#071f19] ring-1 ring-white/10">
            <table className="w-full text-sm tabular-nums">
              <thead className="bg-[#0f2a22]">
                <tr>
                  <th className="text-left p-2 text-white/80 text-xs font-medium">Tracking</th>
                  <th className="text-left p-2 text-white/80 text-xs font-medium">Peso</th>
                  <th className="text-left p-2 text-white/80 text-xs font-medium">Foto</th>
                  <th className="text-left p-2 text-white/80 text-xs font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr
                    key={i.id}
                    className="border-t border-white/10 odd:bg-transparent even:bg-white/5 hover:bg-white/10"
                  >
                    <td className="p-2 font-mono text-white">{i.tracking}</td>
                    <td className="p-2 text-white">
                      {fmtWeightPairFromLb(Number(i.weightLb || 0))}
                    </td>
                    <td className="p-2">
                      {i.photoUrl ? (
                        <a
                          href={i.photoUrl}
                          target="_blank"
                          aria-label="Ver foto"
                          className="underline text-white/90 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#005f40] rounded-sm"
                        >
                          📷
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="p-2">
                      <button
                        className="inline-flex items-center justify-center h-9 w-9 rounded-md border border-red-500/70 bg-[#0f2a22] text-red-300 hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-red-500"
                        title="Eliminar de la caja"
                        onClick={() => {
                          void onRemoveItem(i.id);
                        }}
                      >
                        <IconTrash />
                      </button>
                    </td>
                  </tr>
                ))}
                {!items.length ? (
                  <tr>
                    <td className="p-3 text-white/40" colSpan={4}>
                      Caja sin items.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4 text-sm text-white/80 font-medium">
          Peso total: {weightText}
        </div>
      </div>
    </div>
  );
}

