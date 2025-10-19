// src/lib/printBoxLabel.ts
// Genera una etiqueta 6×4" (horizontal) similar al sistema viejo:
// Arriba: #REFERENCIA + texto grande
// Abajo: 2 columnas -> #CLIENTE  /  #CAJA
// Abre en una pestaña lista para imprimir.

export type PrintBoxLabelArgs = {
  reference: string;
  clientCode: string | number;
  boxCode: string | number;
};


function loadJsPdfFromCdn(): Promise<any> {
  return new Promise((resolve, reject) => {
    const g = (globalThis as any);
    if (g.jspdf?.jsPDF) { resolve(g.jspdf.jsPDF); return; }
    const id = "jspdf-cdn";
    if (document.getElementById(id)) {
      // ya insertado: esperar a que esté disponible
      const check = () => g.jspdf?.jsPDF ? resolve(g.jspdf.jsPDF) : setTimeout(check, 50);
      check();
      return;
    }
    const s = document.createElement("script");
    s.id = id;
    s.src = "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js";
    s.async = true;
    s.onload = () => {
      if (g.jspdf?.jsPDF) resolve(g.jspdf.jsPDF); else reject(new Error("jsPDF no disponible"));
    };
    s.onerror = () => reject(new Error("No se pudo cargar jsPDF"));
    document.head.appendChild(s);
  });
}

function getJsPDF(): Promise<any> {
  const g = (globalThis as any);
  if (g.jspdf?.jsPDF) return Promise.resolve(g.jspdf.jsPDF);
  return loadJsPdfFromCdn();
}

// Ajusta el tamaño de fuente para que el texto entre en el ancho máximo y lo dibuja centrado
function fitCenteredText(doc: any, text: string, centerX: number, centerY: number, maxW: number, initialFs = 36, minFs = 14) {
  let fs = initialFs;
  doc.setFontSize(fs);
  let tw = doc.getTextWidth(text);
  while (tw > maxW && fs > minFs) {
    fs -= 2;
    doc.setFontSize(fs);
    tw = doc.getTextWidth(text);
  }
  doc.text(text, centerX, centerY, { align: 'center', baseline: 'middle' as any });
}

export async function printBoxLabel({ reference, clientCode, boxCode }: PrintBoxLabelArgs) {
  const jsPDF = await getJsPDF();

  // 6×4 pulgadas, orientación horizontal
  const doc = new jsPDF({ orientation: 'landscape', unit: 'in', format: [6, 4] });

  // Constantes de layout
  const W = 6, H = 4;        // tamaño total (horizontal)
  const m = 0.2;             // margen exterior
  const thick = 0.04;        // grosor de borde
  const topH = 1.52;         // ~38% de la altura para referencia
  const gap = 0.06;          // separación entre top y bottom
  const bottomH = H - (m * 2) - topH;            // alto de fila inferior
  const bottomColW = (W - (m * 2) - gap) / 2;    // ancho de cada columna

  // Estilos base
  doc.setLineWidth(thick);
  doc.setDrawColor(0, 0, 0);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');

  // ===== TOP: Referencia =====
  const refTitle = '#REFERENCIA';
  const refText = (reference || '').toUpperCase() || '—';

  // Rect del bloque superior
  doc.rect(m, m, W - 2 * m, topH, 'S');

  // Título pequeño centrado
  doc.setFontSize(12);
  doc.text(refTitle, m + (W - 2 * m) / 2, m + 0.35, { align: 'center', baseline: 'middle' as any });

  // Texto grande (ajuste dinámico para ancho/alto disponible)
  const refPadTop = 0.35;               // espacio desde el título
  const availW = W - 2 * m - 0.3;       // padding horizontal
  const availH = topH - refPadTop - 0.35; // padding inferior
  let fs = 36;                          // tamaño inicial
  doc.setFontSize(fs);
  let tw = doc.getTextWidth(refText);
  while (tw > availW && fs > 10) {
    fs -= 2; doc.setFontSize(fs); tw = doc.getTextWidth(refText);
  }
  const refCenterY = m + refPadTop + (availH / 2);
  doc.text(refText, m + (W - 2 * m) / 2, refCenterY, { align: 'center', baseline: 'middle' as any });

  // ===== BOTTOM: dos columnas =====
  const bottomY = m + topH + gap;

  // Izquierda: CLIENTE
  doc.rect(m, bottomY, bottomColW, bottomH, 'S');
  doc.setFontSize(12);
  doc.text('#CLIENTE', m + bottomColW / 2, bottomY + 0.35, { align: 'center', baseline: 'middle' as any });
  // Nro cliente (grande)
  fitCenteredText(doc, String(clientCode), m + bottomColW / 2, bottomY + bottomH / 2 + 0.15, bottomColW - 0.3, 36);

  // Derecha: CAJA
  const rightX = m + bottomColW + gap;
  doc.rect(rightX, bottomY, bottomColW, bottomH, 'S');
  doc.setFontSize(12);
  doc.text('#CAJA', rightX + bottomColW / 2, bottomY + 0.35, { align: 'center', baseline: 'middle' as any });
  // Nro caja (grande)
  fitCenteredText(doc, String(boxCode), rightX + bottomColW / 2, bottomY + bottomH / 2 + 0.15, bottomColW - 0.3, 36);

  // Abrir en nueva pestaña lista para imprimir
  const dataUrl = doc.output('dataurlstring');
  const w = window.open();
  if (w) {
    w.document.write(`<iframe width="100%" height="100%" src="${dataUrl}"></iframe>`);
  } else {
    doc.output('dataurlnewwindow');
  }
}

// Alias por compatibilidad
export { printBoxLabel as openPrintLabel };
