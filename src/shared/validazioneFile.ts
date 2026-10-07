// Verifica completa della struttura di un file <progetto>.json.
// Le regole coincidono con docs/progetto.schema.json, più i controlli che uno schema JSON non può esprimere
// (id univoci, codici univoci, fine dopo inizio, dipendenze verso attività esistenti).
// Nessun valore viene "corretto": un file non valido viene segnalato e non aperto.

import {
  CANALI_NOTIFICA,
  PRIORITA,
  STATI,
  TIPI_COLLEGAMENTO,
  TIPI_DIPENDENZA,
  VALORI_INVIA_NOTIFICA,
  VERSIONE_SCHEMA,
  type FileProgetto,
} from "./types";

export const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Formato prodotto da Date.toISOString(): sempre UTC con millisecondi */
export const RE_DATA_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
export const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const RE_PREFISSO = /^[A-Z0-9]{2,10}$/;
export const RE_URL = /^https?:\/\/\S+$/i;

type Oggetto = Record<string, unknown>;

class Controllo {
  errori: string[] = [];
  errore(percorso: string, messaggio: string) {
    if (this.errori.length < 20) this.errori.push(`${percorso}: ${messaggio}`);
  }

  oggetto(v: unknown, percorso: string, obbligatori: string[], facoltativi: string[] = []): v is Oggetto {
    if (!v || typeof v !== "object" || Array.isArray(v)) {
      this.errore(percorso, "deve essere un oggetto");
      return false;
    }
    const o = v as Oggetto;
    for (const k of obbligatori) if (!(k in o)) this.errore(percorso, `manca il campo "${k}"`);
    const ammessi = new Set([...obbligatori, ...facoltativi]);
    for (const k of Object.keys(o)) if (!ammessi.has(k)) this.errore(percorso, `campo non previsto "${k}"`);
    return true;
  }

  testo(v: unknown, percorso: string, { nonVuoto = false, re }: { nonVuoto?: boolean; re?: RegExp } = {}) {
    if (typeof v !== "string") return this.errore(percorso, "deve essere un testo");
    if (nonVuoto && !v.trim()) return this.errore(percorso, "non può essere vuoto");
    if (re && !re.test(v)) this.errore(percorso, `valore non valido "${v}"`);
  }

  facoltativo(o: Oggetto, campo: string, percorso: string, opzioni?: { nonVuoto?: boolean; re?: RegExp }) {
    if (campo in o) this.testo(o[campo], `${percorso}.${campo}`, opzioni);
  }

  scelta(v: unknown, percorso: string, valori: readonly string[]) {
    if (typeof v !== "string" || !valori.includes(v)) this.errore(percorso, `valore non ammesso ${JSON.stringify(v)} (ammessi: ${valori.join(", ")})`);
  }

  intero(v: unknown, percorso: string, min: number, max = Number.MAX_SAFE_INTEGER) {
    if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) this.errore(percorso, `deve essere un intero tra ${min} e ${max}`);
  }

  elencoTesti(v: unknown, percorso: string) {
    if (!Array.isArray(v)) return this.errore(percorso, "deve essere un elenco");
    v.forEach((t, i) => this.testo(t, `${percorso}[${i}]`, { nonVuoto: true }));
  }

  elenco(v: unknown, percorso: string): unknown[] {
    if (Array.isArray(v)) return v;
    this.errore(percorso, "deve essere un elenco");
    return [];
  }
}

/** Restituisce l'elenco degli errori di struttura (vuoto se il file è valido) */
export function erroriFileProgetto(d: unknown): string[] {
  const c = new Controllo();
  if (!c.oggetto(d, "file", ["schemaVersion", "progetto", "attivita", "dipendenze", "revisione", "aggiornatoIl", "aggiornatoDa"])) return c.errori;

  if (d.schemaVersion !== VERSIONE_SCHEMA) c.errore("schemaVersion", `deve essere ${VERSIONE_SCHEMA}`);
  c.intero(d.revisione, "revisione", 1);
  c.testo(d.aggiornatoIl, "aggiornatoIl", { re: RE_DATA_UTC });
  c.testo(d.aggiornatoDa, "aggiornatoDa", { re: RE_EMAIL });

  // ---------- progetto ----------
  const p = d.progetto;
  if (c.oggetto(p, "progetto", ["id", "nome", "prefissoCodice", "proprietario", "tag"], ["cliente"])) {
    c.testo(p.id, "progetto.id", { re: RE_UUID });
    c.testo(p.nome, "progetto.nome", { nonVuoto: true });
    c.facoltativo(p, "cliente", "progetto", { nonVuoto: true });
    c.testo(p.prefissoCodice, "progetto.prefissoCodice", { re: RE_PREFISSO });
    c.testo(p.proprietario, "progetto.proprietario", { re: RE_EMAIL });
    c.elencoTesti(p.tag, "progetto.tag");
  }

  // ---------- attività ----------
  const idAttivita = new Set<number>();
  const codici = new Set<string>();
  c.elenco(d.attivita, "attivita").forEach((a, i) => {
    const pa = `attivita[${i}]`;
    const obbligatori = [
      "id", "codice", "titolo", "descrizione", "stato", "priorita", "dataOraInizio", "dataOraFine", "percentualeCompletamento",
      "responsabile", "tag", "partecipanti", "invia_notifica", "canaleNotifica", "collegamenti", "allegati", "versione", "creataIl", "aggiornataIl",
    ];
    if (!c.oggetto(a, pa, obbligatori, ["dataOraNotifica", "aggiornataDa"])) return;

    c.intero(a.id, `${pa}.id`, 1);
    if (typeof a.id === "number") {
      if (idAttivita.has(a.id)) c.errore(`${pa}.id`, "id ripetuto");
      idAttivita.add(a.id);
    }
    c.testo(a.codice, `${pa}.codice`, { nonVuoto: true });
    if (typeof a.codice === "string") {
      if (a.codice !== a.codice.trim().toUpperCase()) c.errore(`${pa}.codice`, "deve essere maiuscolo e senza spazi iniziali o finali");
      if (codici.has(a.codice.toUpperCase())) c.errore(`${pa}.codice`, `codice ripetuto "${a.codice}"`);
      codici.add(a.codice.toUpperCase());
    }
    c.testo(a.titolo, `${pa}.titolo`, { nonVuoto: true });
    c.testo(a.descrizione, `${pa}.descrizione`);
    c.scelta(a.stato, `${pa}.stato`, STATI);
    c.scelta(a.priorita, `${pa}.priorita`, PRIORITA);
    c.testo(a.dataOraInizio, `${pa}.dataOraInizio`, { re: RE_DATA_UTC });
    c.testo(a.dataOraFine, `${pa}.dataOraFine`, { re: RE_DATA_UTC });
    if (typeof a.dataOraInizio === "string" && typeof a.dataOraFine === "string" && a.dataOraFine < a.dataOraInizio)
      c.errore(`${pa}.dataOraFine`, "precede la data di inizio");
    c.intero(a.percentualeCompletamento, `${pa}.percentualeCompletamento`, 0, 100);
    if (a.stato === "COMPLETATA" && a.percentualeCompletamento !== 100) c.errore(`${pa}.percentualeCompletamento`, "un'attività completata deve essere al 100%");
    c.testo(a.responsabile, `${pa}.responsabile`, { re: RE_EMAIL });
    c.elencoTesti(a.tag, `${pa}.tag`);

    const email = new Set<string>();
    c.elenco(a.partecipanti, `${pa}.partecipanti`).forEach((x, j) => {
      const pp = `${pa}.partecipanti[${j}]`;
      if (!c.oggetto(x, pp, ["email"], ["nome"])) return;
      c.testo(x.email, `${pp}.email`, { re: RE_EMAIL });
      if (typeof x.email === "string") {
        if (x.email !== x.email.toLowerCase()) c.errore(`${pp}.email`, "deve essere in minuscolo");
        if (email.has(x.email)) c.errore(`${pp}.email`, "partecipante ripetuto");
        email.add(x.email);
      }
      c.facoltativo(x, "nome", pp, { nonVuoto: true });
    });

    c.scelta(a.invia_notifica, `${pa}.invia_notifica`, VALORI_INVIA_NOTIFICA);
    c.facoltativo(a, "dataOraNotifica", pa, { re: RE_DATA_UTC });
    if (a.invia_notifica !== "No" && !("dataOraNotifica" in a)) c.errore(`${pa}.dataOraNotifica`, `obbligatoria quando invia_notifica è "${String(a.invia_notifica)}"`);
    c.scelta(a.canaleNotifica, `${pa}.canaleNotifica`, CANALI_NOTIFICA);

    c.elenco(a.collegamenti, `${pa}.collegamenti`).forEach((x, j) => {
      const pc = `${pa}.collegamenti[${j}]`;
      if (!c.oggetto(x, pc, ["tipo", "titolo", "url"])) return;
      c.scelta(x.tipo, `${pc}.tipo`, TIPI_COLLEGAMENTO);
      c.testo(x.titolo, `${pc}.titolo`, { nonVuoto: true });
      c.testo(x.url, `${pc}.url`, { re: RE_URL });
    });

    c.elenco(a.allegati, `${pa}.allegati`).forEach((x, j) => {
      const pl = `${pa}.allegati[${j}]`;
      if (!c.oggetto(x, pl, ["id", "nome", "percorsoRelativo", "aggiuntoIl"])) return;
      c.testo(x.id, `${pl}.id`, { re: RE_UUID });
      c.testo(x.nome, `${pl}.nome`, { nonVuoto: true });
      const atteso = p && typeof p === "object" ? `allegati/${(p as Oggetto).id}/${String(a.id)}/` : "";
      if (typeof x.percorsoRelativo !== "string" || !x.percorsoRelativo.startsWith(atteso) || x.percorsoRelativo.includes(".."))
        c.errore(`${pl}.percorsoRelativo`, `deve iniziare con "${atteso}"`);
      c.testo(x.aggiuntoIl, `${pl}.aggiuntoIl`, { re: RE_DATA_UTC });
    });

    c.intero(a.versione, `${pa}.versione`, 1);
    c.testo(a.creataIl, `${pa}.creataIl`, { re: RE_DATA_UTC });
    c.testo(a.aggiornataIl, `${pa}.aggiornataIl`, { re: RE_DATA_UTC });
    c.facoltativo(a, "aggiornataDa", pa, { re: RE_EMAIL });
  });

  // ---------- dipendenze ----------
  const idDipendenze = new Set<string>();
  const coppie = new Set<string>();
  c.elenco(d.dipendenze, "dipendenze").forEach((x, i) => {
    const pd = `dipendenze[${i}]`;
    if (!c.oggetto(x, pd, ["id", "origineId", "destinazioneId", "tipo"])) return;
    c.testo(x.id, `${pd}.id`, { re: RE_UUID });
    if (typeof x.id === "string") {
      if (idDipendenze.has(x.id)) c.errore(`${pd}.id`, "id ripetuto");
      idDipendenze.add(x.id);
    }
    for (const campo of ["origineId", "destinazioneId"] as const)
      if (typeof x[campo] !== "number" || !idAttivita.has(x[campo])) c.errore(`${pd}.${campo}`, "non corrisponde a nessuna attività");
    if (x.origineId === x.destinazioneId) c.errore(pd, "un'attività non può dipendere da se stessa");
    const k = `${String(x.origineId)}>${String(x.destinazioneId)}`;
    if (coppie.has(k)) c.errore(pd, "collegamento ripetuto");
    coppie.add(k);
    c.scelta(x.tipo, `${pd}.tipo`, TIPI_DIPENDENZA);
  });

  return c.errori;
}

/** Verifica e restituisce il file tipizzato; altrimenti errore con l'elenco dei problemi */
export function verificaFileProgetto(d: unknown, nomeFile: string): FileProgetto {
  const errori = erroriFileProgetto(d);
  if (errori.length) throw new Error(`${nomeFile}: struttura non valida\n- ${errori.join("\n- ")}`);
  return d as FileProgetto;
}
