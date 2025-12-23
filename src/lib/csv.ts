// src/lib/csv.ts
export function csvEscape(value: any): string {
  const s = String(value ?? "");
  return '"' + s.replace(/"/g, '""') + '"';
}

export function downloadCsvWithBom(rows: Record<string, any>[], headers: { key: string; label: string }[], filename: string) {
  const headerLine = headers.map(h => csvEscape(h.label)).join(",");
  const dataLines = rows.map(r => headers.map(h => csvEscape(r[h.key])).join(","));
  const csv = "\uFEFF" + [headerLine, ...dataLines].join("\r\n"); // BOM + CRLF
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

