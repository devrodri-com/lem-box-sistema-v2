// src/components/ui/StatusBadge.tsx
import clsx from "clsx";

type PackageStatus = "received" | "boxed" | "void";
type ShipmentStatus = "open" | "shipped" | "arrived" | "closed";
type BoxStatus = "open" | "closed";

type Scope = "package" | "shipment" | "box";

type Props =
  | { scope: "package"; status: PackageStatus; className?: string }
  | { scope: "shipment"; status: ShipmentStatus; className?: string }
  | { scope: "box"; status: BoxStatus; className?: string };

type Conf = { label: string; classes: string };

const PKG: Record<PackageStatus, Conf> = {
  received: { label: "Recibido",   classes: "bg-slate-100 text-slate-700 ring-slate-200" },
  boxed:    { label: "Consolidado",classes: "bg-sky-100 text-sky-700 ring-sky-200" },
  void:     { label: "Anulado",    classes: "bg-rose-100 text-rose-700 ring-rose-200" },
};

const SHP: Record<ShipmentStatus, Conf> = {
  open:    { label: "Abierto",     classes: "bg-slate-100 text-slate-700 ring-slate-200" },
  shipped: { label: "En tránsito", classes: "bg-indigo-100 text-indigo-700 ring-indigo-200" },
  arrived: { label: "En destino",  classes: "bg-teal-100 text-teal-700 ring-teal-200" },
  closed:  { label: "Cerrado",     classes: "bg-zinc-100 text-zinc-700 ring-zinc-200" },
};

const BOX: Record<BoxStatus, Conf> = {
  open:   { label: "Abierta",  classes: "bg-slate-100 text-slate-700 ring-slate-200" },
  closed: { label: "Cerrada",  classes: "bg-zinc-100 text-zinc-700 ring-zinc-200" },
};

export function StatusBadge(props: Props) {
  const { className } = props;

  const conf =
    props.scope === "package"
      ? PKG[props.status]
      : props.scope === "shipment"
      ? SHP[props.status]
      : BOX[props.status];

  return (
    <span
      role="status"
      aria-label={conf.label}
      data-scope={props.scope}
      data-status={("status" in props ? props.status : "") as string}
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset transition-[transform,opacity] duration-300 ease-out",
        "hover:opacity-90",
        conf.classes,
        className
      )}
    >
      <Dot />
      {conf.label}
    </span>
  );
}

function Dot() {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true" className="shrink-0">
      <circle cx="4" cy="4" r="4" />
    </svg>
  );
}

export default StatusBadge;