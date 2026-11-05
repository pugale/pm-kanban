// Disegna l'intero Gantt (non solo la parte visibile) su un canvas e lo restituisce come PNG in base64

import type { Attivita, Dipendenza } from "../../shared/types";
import { COLORI_STATO, ETICHETTE_STATO } from "./attivita";

export interface DatiEsportazioneGantt {
  attivita: Attivita[];
  profondita: Map<number, number>;
  testata: {
    sopra: { inizio: number; fine: number; testo: string }[];
    sotto: { inizio: number; fine: number; testo: string; weekend?: boolean }[];
  };
  posizioni: Map<number, { sx: number; dx: number }>;
  dipendenze: Dipendenza[];
  percorsoFreccia(d: Dipendenza): string | null;
  x(ms: number): number;
  larghezzaEtichette: number;
  larghezza: number;
  altezzaRiga: number;
  altezzaTestata: number;
  altezzaCorpo: number;
  xOggi: number;
  inRitardo(a: Attivita): boolean;
}

const FONT = '"Segoe UI", system-ui, sans-serif';
const LIMITE_PIXEL = 16000; // oltre questa dimensione i browser non creano il canvas: l'immagine viene ridotta

function tagliaTesto(ctx: CanvasRenderingContext2D, testo: string, max: number) {
  if (max <= 0) return "";
  if (ctx.measureText(testo).width <= max) return testo;
  let t = testo;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

export function ganttInPng(d: DatiEsportazioneGantt): string {
  const L = d.larghezzaEtichette;
  const W = L + d.larghezza;
  const H = d.altezzaTestata + d.altezzaCorpo + 28; // 28 px per la legenda
  const scala = Math.min(1, LIMITE_PIXEL / Math.max(W, H));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(W * scala));
  canvas.height = Math.max(1, Math.floor(H * scala));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Impossibile creare l'immagine.");
  ctx.scale(scala, scala);
  ctx.textBaseline = "middle";

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);

  const TH = d.altezzaTestata;
  const RH = d.altezzaRiga;
  const metaTestata = TH / 2;

  // ---------- Area temporale (clip: niente disegni sopra la colonna delle etichette) ----------
  ctx.save();
  ctx.beginPath();
  ctx.rect(L, 0, d.larghezza, TH + d.altezzaCorpo);
  ctx.clip();
  ctx.translate(L, 0);

  // testata
  ctx.fillStyle = "#f7f9fb";
  ctx.fillRect(0, 0, d.larghezza, TH);
  for (const s of d.testata.sotto) {
    const x0 = d.x(s.inizio);
    const w = d.x(s.fine) - x0;
    if (s.weekend) {
      ctx.fillStyle = "#eef1f5";
      ctx.fillRect(x0, metaTestata, w, metaTestata);
    }
  }
  ctx.strokeStyle = "#e3e8ee";
  ctx.lineWidth = 1;
  ctx.font = `600 11px ${FONT}`;
  ctx.fillStyle = "#1f2d3a";
  ctx.textAlign = "left";
  for (const s of d.testata.sopra) {
    const x0 = d.x(s.inizio);
    ctx.beginPath(); ctx.moveTo(x0 + 0.5, 0); ctx.lineTo(x0 + 0.5, metaTestata); ctx.stroke();
    ctx.fillText(tagliaTesto(ctx, s.testo, d.x(s.fine) - x0 - 6), x0 + 4, metaTestata / 2);
  }
  ctx.font = `11px ${FONT}`;
  ctx.fillStyle = "#66788a";
  ctx.textAlign = "center";
  for (const s of d.testata.sotto) {
    const x0 = d.x(s.inizio);
    const w = d.x(s.fine) - x0;
    ctx.beginPath(); ctx.moveTo(x0 + 0.5, metaTestata); ctx.lineTo(x0 + 0.5, TH); ctx.stroke();
    ctx.fillText(tagliaTesto(ctx, s.testo, w - 2), x0 + w / 2, metaTestata + metaTestata / 2);
  }
  ctx.strokeStyle = "#dde3ea";
  ctx.beginPath(); ctx.moveTo(0, TH - 0.5); ctx.lineTo(d.larghezza, TH - 0.5); ctx.stroke();

  // corpo
  ctx.translate(0, TH);
  for (const s of d.testata.sotto) {
    if (!s.weekend) continue;
    ctx.fillStyle = "#f6f8fa";
    ctx.fillRect(d.x(s.inizio), 0, d.x(s.fine) - d.x(s.inizio), d.altezzaCorpo);
  }
  ctx.strokeStyle = "#f0f2f5";
  d.attivita.forEach((_, i) => {
    const y = (i + 1) * RH - 0.5;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(d.larghezza, y); ctx.stroke();
  });

  // frecce delle dipendenze
  ctx.strokeStyle = "#546e7a";
  ctx.fillStyle = "#546e7a";
  ctx.lineWidth = 1.5;
  for (const dip of d.dipendenze) {
    const p = d.percorsoFreccia(dip);
    if (!p) continue;
    ctx.stroke(new Path2D(p));
    // punta: l'ultimo tratto del percorso è orizzontale e arriva su x2
    const m = /H\s*(-?[\d.]+)\s*V\s*(-?[\d.]+)\s*H\s*(-?[\d.]+)$/.exec(p);
    if (!m) continue;
    const xFine = Number(m[3]);
    const xPrima = Number(m[1]);
    const y = Number(m[2]);
    const verso = xFine >= xPrima ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(xFine, y);
    ctx.lineTo(xFine - verso * 8, y - 4);
    ctx.lineTo(xFine - verso * 8, y + 4);
    ctx.closePath();
    ctx.fill();
  }
  ctx.lineWidth = 1;

  // linea "Oggi"
  ctx.fillStyle = "#e53935";
  ctx.fillRect(d.xOggi - 1, 0, 2, d.altezzaCorpo);

  // barre
  d.attivita.forEach((a, i) => {
    const pos = d.posizioni.get(a.id);
    if (!pos) return;
    const larg = pos.dx - pos.sx;
    const top = i * RH + 6;
    const alt = RH - 12;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.25)";
    ctx.shadowBlur = 2;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = COLORI_STATO[a.stato];
    ctx.beginPath(); ctx.roundRect(pos.sx, top, larg, alt, 4); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath(); ctx.roundRect(pos.sx, top, larg, alt, 4); ctx.clip();
    ctx.fillStyle = "rgba(0,0,0,.22)";
    ctx.fillRect(pos.sx, top, (larg * a.percentualeCompletamento) / 100, alt);
    ctx.restore();

    if (d.inRitardo(a)) {
      ctx.strokeStyle = "#e53935";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(pos.sx - 1, top - 1, larg + 2, alt + 2, 5); ctx.stroke();
      ctx.lineWidth = 1;
    }

    const percentuale = `${a.percentualeCompletamento}%`;
    ctx.font = `600 11px ${FONT}`;
    ctx.textAlign = "left";
    if (larg >= 32) {
      ctx.fillStyle = "#fff";
      ctx.fillText(tagliaTesto(ctx, larg > 70 ? `${percentuale} · ${a.codice}` : percentuale, larg - 12), pos.sx + 6, top + alt / 2);
    }
    if (larg <= 70) {
      ctx.font = `11px ${FONT}`;
      ctx.fillStyle = "#66788a";
      ctx.fillText(larg < 32 ? `${percentuale} · ${a.codice}` : a.codice, pos.dx + 6, top + alt / 2);
    }
  });
  ctx.restore();

  // ---------- Colonna delle attività ----------
  ctx.fillStyle = "#f7f9fb";
  ctx.fillRect(0, 0, L, TH);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, TH, L, d.altezzaCorpo);
  ctx.font = `600 13px ${FONT}`;
  ctx.textAlign = "left";
  ctx.fillStyle = "#1f2d3a";
  ctx.fillText("Attività", 10, TH - 14);

  d.attivita.forEach((a, i) => {
    const yc = TH + i * RH + RH / 2;
    const livello = d.profondita.get(a.id) ?? 0;
    ctx.fillStyle = COLORI_STATO[a.stato];
    ctx.beginPath(); ctx.arc(14, yc, 4, 0, Math.PI * 2); ctx.fill();
    let x0 = 26;
    if (livello > 0) {
      ctx.font = `13px ${FONT}`;
      ctx.fillStyle = "#66788a";
      ctx.textAlign = "right";
      ctx.fillText("↳", x0 + livello * 24 - 4, yc);
      ctx.textAlign = "left";
      x0 += livello * 24;
    }
    ctx.font = `700 13px ${FONT}`;
    ctx.fillStyle = "#66788a";
    ctx.fillText(a.codice, x0, yc);
    const xTitolo = x0 + ctx.measureText(a.codice).width + 6;
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = "#1f2d3a";
    ctx.fillText(tagliaTesto(ctx, a.titolo, L - xTitolo - 8), xTitolo, yc);
    ctx.strokeStyle = "#f0f2f5";
    ctx.beginPath(); ctx.moveTo(0, TH + (i + 1) * RH - 0.5); ctx.lineTo(L, TH + (i + 1) * RH - 0.5); ctx.stroke();
  });
  ctx.strokeStyle = "#dde3ea";
  ctx.beginPath(); ctx.moveTo(L - 0.5, 0); ctx.lineTo(L - 0.5, TH + d.altezzaCorpo); ctx.stroke();

  // ---------- Legenda ----------
  let xl = 10;
  const yl = TH + d.altezzaCorpo + 14;
  ctx.font = `11px ${FONT}`;
  for (const stato of Object.keys(COLORI_STATO) as (keyof typeof COLORI_STATO)[]) {
    ctx.fillStyle = COLORI_STATO[stato];
    ctx.beginPath(); ctx.arc(xl + 4, yl, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#66788a";
    ctx.fillText(ETICHETTE_STATO[stato], xl + 12, yl);
    xl += 12 + ctx.measureText(ETICHETTE_STATO[stato]).width + 16;
  }

  return canvas.toDataURL("image/png").split(",")[1];
}
