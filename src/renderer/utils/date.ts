// Date: nei file sono in UTC, a video sempre nell'ora locale del PC (Italia)

export const MS_ORA = 3_600_000;
export const MS_GIORNO = 86_400_000;

export const NOMI_MESI = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
export const MESI_BREVI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
export const GIORNI_BREVI = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

const p2 = (n: number) => String(n).padStart(2, "0");

export const fmtData = (iso: string | Date) =>
  new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
export const fmtOra = (iso: string | Date) => new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
export const fmtDataOra = (iso: string | Date) => `${fmtData(iso)} ${fmtOra(iso)}`;
export const fmtGiornoEsteso = (d: Date) =>
  d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/** ISO UTC → valore per <input type="datetime-local"> (ora locale) */
export function perInput(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/** Valore di <input type="datetime-local"> (ora locale) → ISO UTC. Stringa vuota se non valido. */
export function daInput(valore: string): string {
  const d = new Date(valore);
  return isNaN(d.getTime()) ? "" : d.toISOString();
}

export const inizioGiorno = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const aggiungiGiorni = (d: Date, n: number) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes(), d.getSeconds());
export const aggiungiMesi = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);

/** Lunedì della settimana */
export function inizioSettimana(d: Date): Date {
  const g = inizioGiorno(d);
  return aggiungiGiorni(g, -((g.getDay() + 6) % 7));
}

export const chiaveGiorno = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const stessoGiorno = (a: Date, b: Date) => chiaveGiorno(a) === chiaveGiorno(b);

/** Prossima ora piena (per le nuove attività) */
export function prossimaOraPiena(da = new Date()): Date {
  const d = new Date(da);
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

/** Giorno alle ore indicate, in ora locale */
export const alleOre = (giorno: Date, ore: number, minuti = 0) =>
  new Date(giorno.getFullYear(), giorno.getMonth(), giorno.getDate(), ore, minuti);

// ---------- Festività italiane ----------

/**
 * Festa del santo patrono del proprio comune (facoltativa), formato [mese 1-12, giorno, nome].
 * Esempio per Arezzo: [8, 7, "San Donato"]. Per Bologna: [10, 4, "San Petronio"].
 */
export const FESTE_LOCALI: [number, number, string][] = [];

/** Domenica di Pasqua (calendario gregoriano, algoritmo di Meeus/Jones/Butcher) */
export function pasqua(anno: number): Date {
  const a = anno % 19;
  const b = Math.floor(anno / 100);
  const c = anno % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mese = Math.floor((h + l - 7 * m + 114) / 31);
  const giorno = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(anno, mese - 1, giorno);
}

const cacheFestivita = new Map<number, Map<string, string>>();

/** Festività nazionali italiane dell'anno (chiave "aaaa-mm-gg" → nome) */
export function festivitaAnno(anno: number): Map<string, string> {
  const presente = cacheFestivita.get(anno);
  if (presente) return presente;

  const m = new Map<string, string>();
  const aggiungi = (mese: number, giorno: number, nome: string) => m.set(chiaveGiorno(new Date(anno, mese - 1, giorno)), nome);
  aggiungi(1, 1, "Capodanno");
  aggiungi(1, 6, "Epifania");
  aggiungi(4, 25, "Festa della Liberazione");
  aggiungi(5, 1, "Festa del Lavoro");
  aggiungi(6, 2, "Festa della Repubblica");
  aggiungi(8, 15, "Ferragosto");
  if (anno >= 2026) aggiungi(10, 4, "San Francesco d'Assisi"); // festa nazionale dal 2026 (legge 151/2025)
  aggiungi(11, 1, "Ognissanti");
  aggiungi(12, 8, "Immacolata Concezione");
  aggiungi(12, 25, "Natale");
  aggiungi(12, 26, "Santo Stefano");
  const p = pasqua(anno);
  m.set(chiaveGiorno(p), "Pasqua");
  m.set(chiaveGiorno(aggiungiGiorni(p, 1)), "Lunedì dell'Angelo");
  for (const [mese, giorno, nome] of FESTE_LOCALI) aggiungi(mese, giorno, nome);

  cacheFestivita.set(anno, m);
  return m;
}

/** Nome della festività, oppure undefined se il giorno non è festivo */
export const nomeFestivita = (d: Date) => festivitaAnno(d.getFullYear()).get(chiaveGiorno(d));

export const eWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;

/** Sabato, domenica o festività: nel calendario hanno lo sfondo rosso chiaro */
export const eGiornoNonLavorativo = (d: Date) => eWeekend(d) || nomeFestivita(d) !== undefined;
