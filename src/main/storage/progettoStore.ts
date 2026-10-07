// Lettura e scrittura dei file <progetto>.json nella cartella sincronizzata

import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { ErroreApp, VERSIONE_SCHEMA, type ElencoProgetti, type FileProgetto, type InfoProgetto, type Progetto } from "../../shared/types";
import { RE_PREFISSO, erroriFileProgetto, verificaFileProgetto } from "../../shared/validazioneFile";
import { cartellaDati, leggiImpostazioni } from "./impostazioni";

const attesa = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** File di progetto = .json che non inizia con "_" (registro notifiche), "." o "~" (file temporanei) */
export const eFileProgetto = (nome: string) => nome.toLowerCase().endsWith(".json") && !/^[_.~]/.test(nome);

// ---------- Scritture fatte dall'app (per non ricaricare a vuoto quando arriva l'evento del file) ----------

const scrittureProprie = new Map<string, number>();
export const eScritturaPropria = (nomeFile: string) => Date.now() - (scrittureProprie.get(nomeFile) ?? 0) < 3000;

// ---------- Utilità sui file ----------

const ERRORI_TEMPORANEI = new Set(["EBUSY", "EPERM", "EACCES"]);

/** OneDrive può bloccare il file per un attimo mentre lo sincronizza: si riprova */
export async function conRiprova<T>(fn: () => Promise<T>, tentativi = 5): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e: any) {
      const temporaneo = ERRORI_TEMPORANEI.has(e?.code) || e instanceof SyntaxError;
      if (!temporaneo || i >= tentativi - 1) throw e;
      await attesa(200 * (i + 1));
    }
  }
}

async function esiste(percorso: string) {
  try {
    await fs.access(percorso);
    return true;
  } catch {
    return false;
  }
}

async function leggiDaFile(percorso: string): Promise<FileProgetto> {
  const nome = path.basename(percorso);
  // Durante la sincronizzazione OneDrive il file può risultare per un attimo bloccato o incompleto: si riprova
  const dati = await conRiprova(async () => JSON.parse((await fs.readFile(percorso, "utf8")).replace(/^\uFEFF/, "")) as unknown);
  return verificaFileProgetto(dati, nome);
}

// Ordine fisso dei campi nel file: lo stesso dello schema (docs/progetto.schema.json)
const ORDINE_PROGETTO = ["id", "nome", "cliente", "prefissoCodice", "proprietario", "tag"] as const;
const ORDINE_ATTIVITA = [
  "id", "codice", "titolo", "descrizione", "stato", "priorita", "dataOraInizio", "dataOraFine", "percentualeCompletamento",
  "responsabile", "tag", "partecipanti", "invia_notifica", "dataOraNotifica", "canaleNotifica", "collegamenti", "allegati",
  "versione", "creataIl", "aggiornataIl", "aggiornataDa",
] as const;
const ORDINE_DIPENDENZA = ["id", "origineId", "destinazioneId", "tipo"] as const;

function ordina<T extends object>(o: T, campi: readonly string[]): T {
  const r: Record<string, unknown> = {};
  for (const k of campi) if ((o as Record<string, unknown>)[k] !== undefined) r[k] = (o as Record<string, unknown>)[k];
  for (const k of Object.keys(o)) if (!(k in r) && (o as Record<string, unknown>)[k] !== undefined) r[k] = (o as Record<string, unknown>)[k]; // campi inattesi: la verifica li segnalerà
  return r as T;
}

/** File con i campi sempre nello stesso ordine */
function formaCanonica(f: FileProgetto): FileProgetto {
  return {
    schemaVersion: f.schemaVersion,
    progetto: ordina(f.progetto, ORDINE_PROGETTO),
    attivita: f.attivita.map((a) => ordina(a, ORDINE_ATTIVITA)),
    dipendenze: f.dipendenze.map((d) => ordina(d, ORDINE_DIPENDENZA)),
    revisione: f.revisione,
    aggiornatoIl: f.aggiornatoIl,
    aggiornatoDa: f.aggiornatoDa,
  };
}

/**
 * Scrittura "atomica": prima un file temporaneo, poi lo si rinomina. Niente file a metà se l'app si chiude.
 * Prima di scrivere si verifica la struttura: l'app non salva mai un file che poi non saprebbe rileggere.
 */
async function scriviSuFile(percorso: string, dati: FileProgetto) {
  const nome = path.basename(percorso);
  const testo = JSON.stringify(formaCanonica(dati), null, 2);
  const errori = erroriFileProgetto(JSON.parse(testo));
  if (errori.length) throw new ErroreApp("ERRORE", `Salvataggio annullato, i dati non rispettano la struttura del file:\n- ${errori.join("\n- ")}`);

  const tmp = path.join(path.dirname(percorso), `~$${nome}.tmp`);
  await fs.writeFile(tmp, testo, "utf8");
  scrittureProprie.set(nome, Date.now());
  await conRiprova(() => fs.rename(tmp, percorso));
  scrittureProprie.set(nome, Date.now());
}

// ---------- Indice progettoId → percorso ----------

const indice = new Map<string, string>();
export const invalidaIndice = () => indice.clear();

async function percorsoDi(progettoId: string): Promise<string> {
  if (!indice.has(progettoId)) await elencoProgetti();
  const p = indice.get(progettoId);
  if (!p) throw new ErroreApp("NON_TROVATO", "Il progetto non è più presente nella cartella.");
  return p;
}

export const eSolaLettura = (p: Progetto, emailUtente?: string) => !emailUtente || p.proprietario !== emailUtente.toLowerCase();

const infoDa = (f: FileProgetto, nomeFile: string, solaLettura: boolean): InfoProgetto => ({
  id: f.progetto.id,
  nome: f.progetto.nome,
  cliente: f.progetto.cliente,
  nomeFile,
  numeroAttivita: f.attivita.length,
  proprietario: f.progetto.proprietario,
  aggiornatoIl: f.aggiornatoIl,
  aggiornatoDa: f.aggiornatoDa,
  solaLettura,
});

// ---------- Operazioni pubbliche ----------

export async function elencoProgetti(): Promise<ElencoProgetti> {
  const cartella = await cartellaDati();
  const { emailUtente } = await leggiImpostazioni();
  const voci = await fs.readdir(cartella, { withFileTypes: true });

  const perId = new Map<string, { info: InfoProgetto; percorso: string }[]>();
  const fileNonLeggibili: ElencoProgetti["fileNonLeggibili"] = [];

  for (const v of voci) {
    if (!v.isFile() || !eFileProgetto(v.name)) continue;
    const percorso = path.join(cartella, v.name);
    try {
      const f = await leggiDaFile(percorso);
      const lista = perId.get(f.progetto.id) ?? [];
      lista.push({ info: infoDa(f, v.name, eSolaLettura(f.progetto, emailUtente)), percorso });
      perId.set(f.progetto.id, lista);
    } catch (e) {
      fileNonLeggibili.push({ file: v.name, messaggio: (e as Error).message });
    }
  }

  indice.clear();
  const progetti: InfoProgetto[] = [];
  const copieInConflitto: ElencoProgetti["copieInConflitto"] = [];

  for (const [id, lista] of perId) {
    // Il file "originale" è quello col nome più corto: le copie di OneDrive aggiungono il nome del PC
    lista.sort((a, b) => a.info.nomeFile.length - b.info.nomeFile.length);
    indice.set(id, lista[0].percorso);
    progetti.push(lista[0].info);
    if (lista.length > 1) copieInConflitto.push({ progettoId: id, nome: lista[0].info.nome, file: lista.map((x) => x.info.nomeFile) });
  }

  progetti.sort((a, b) => a.nome.localeCompare(b.nome, "it"));
  return { progetti, copieInConflitto, fileNonLeggibili };
}

export async function caricaProgetto(progettoId: string): Promise<{ dati: FileProgetto; solaLettura: boolean }> {
  const percorso = await percorsoDi(progettoId);
  const { emailUtente } = await leggiImpostazioni();
  try {
    const dati = await leggiDaFile(percorso);
    return { dati, solaLettura: eSolaLettura(dati.progetto, emailUtente) };
  } catch (e: any) {
    if (e?.code === "ENOENT") {
      invalidaIndice();
      throw new ErroreApp("NON_TROVATO", "Il file del progetto è stato spostato o eliminato. Aggiorna l'elenco dei progetti.");
    }
    throw e;
  }
}

// Le modifiche allo stesso file vengono eseguite una alla volta
const code = new Map<string, Promise<unknown>>();
function inSequenza<T>(chiave: string, fn: () => Promise<T>): Promise<T> {
  const prossimo = (code.get(chiave) ?? Promise.resolve()).catch(() => undefined).then(fn);
  code.set(chiave, prossimo.catch(() => undefined));
  return prossimo;
}

/**
 * Legge SEMPRE la versione più recente dal disco, applica la modifica e salva.
 * Così non si sovrascrivono le modifiche arrivate da OneDrive nel frattempo.
 */
export async function modificaProgetto<T>(
  progettoId: string,
  modifica: (f: FileProgetto, utente: string) => T | Promise<T>
): Promise<T> {
  const percorso = await percorsoDi(progettoId);
  return inSequenza(percorso, async () => {
    const { emailUtente } = await leggiImpostazioni();
    const dati = await leggiDaFile(percorso);
    if (!emailUtente || eSolaLettura(dati.progetto, emailUtente))
      throw new ErroreApp("SOLA_LETTURA", `Il progetto è gestito da ${dati.progetto.proprietario}: puoi solo consultarlo.`);

    const risultato = await modifica(dati, emailUtente);
    dati.revisione += 1;
    dati.aggiornatoIl = new Date().toISOString();
    dati.aggiornatoDa = emailUtente;
    await scriviSuFile(percorso, dati);
    return risultato;
  });
}

const nomeFileSicuro = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 _-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/^[_.~-]+/, "")
    .slice(0, 60) || "progetto";

export async function creaProgetto(input: { nome: string; cliente?: string; prefissoCodice: string; tag?: string[] }): Promise<InfoProgetto> {
  const cartella = await cartellaDati();
  const { emailUtente } = await leggiImpostazioni();
  if (!emailUtente)
    throw new ErroreApp("CONFIGURAZIONE", "Inserisci la tua email in Impostazioni: serve per indicare chi gestisce il progetto.");

  const nome = input.nome?.trim();
  const prefisso = input.prefissoCodice?.trim().toUpperCase();
  if (!nome) throw new ErroreApp("VALIDAZIONE", "Il nome del progetto è obbligatorio.");
  if (!RE_PREFISSO.test(prefisso ?? ""))
    throw new ErroreApp("VALIDAZIONE", "Il prefisso dei codici deve avere da 2 a 10 lettere o numeri (es. SARA).");

  const nomeFile = `${nomeFileSicuro(nome)}.json`;
  const percorso = path.join(cartella, nomeFile);
  if (await esiste(percorso)) throw new ErroreApp("VALIDAZIONE", "Esiste già un progetto con questo nome.");

  const ora = new Date().toISOString();
  const dati: FileProgetto = {
    schemaVersion: VERSIONE_SCHEMA,
    progetto: {
      id: randomUUID(),
      nome,
      cliente: input.cliente?.trim() || undefined,
      prefissoCodice: prefisso,
      proprietario: emailUtente,
      tag: [...new Set((input.tag ?? []).map((t) => t.trim()).filter(Boolean))],
    },
    attivita: [],
    dipendenze: [],
    revisione: 1,
    aggiornatoIl: ora,
    aggiornatoDa: emailUtente,
  };
  await scriviSuFile(percorso, dati);
  indice.set(dati.progetto.id, percorso);
  return infoDa(dati, nomeFile, false);
}
