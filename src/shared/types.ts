// Tipi condivisi tra processo principale (Node) e interfaccia (React).
// La struttura del file <progetto>.json è descritta anche in docs/progetto.schema.json
// e verificata a ogni lettura da src/shared/validazioneFile.ts.

export type StatoAttivita =
  | "IN_PREPARAZIONE"
  | "DA_INIZIARE"
  | "IN_CORSO"
  | "SOSPESA"
  | "COMPLETATA"
  | "ANNULLATA";
export const STATI: StatoAttivita[] = ["IN_PREPARAZIONE", "DA_INIZIARE", "IN_CORSO", "SOSPESA", "COMPLETATA", "ANNULLATA"];

export type Priorita = "BASSA" | "MEDIA" | "ALTA" | "CRITICA";
export const PRIORITA: Priorita[] = ["BASSA", "MEDIA", "ALTA", "CRITICA"];

/** Canale della notifica: Teams, email o entrambi */
export type CanaleNotifica = "TEAMS" | "EMAIL" | "ENTRAMBI";
export const CANALI_NOTIFICA: CanaleNotifica[] = ["TEAMS", "EMAIL", "ENTRAMBI"];

/** Dipendenze del Gantt: Fine→Inizio, Inizio→Inizio, Fine→Fine, Inizio→Fine */
export type TipoDipendenza = "FS" | "SS" | "FF" | "SF";
export const TIPI_DIPENDENZA: TipoDipendenza[] = ["FS", "SS", "FF", "SF"];

export type TipoCollegamento = "SHAREPOINT" | "TEAMS" | "JIRA" | "DEVOPS" | "PLANNER" | "ALTRO";
export const TIPI_COLLEGAMENTO: TipoCollegamento[] = ["SHAREPOINT", "TEAMS", "JIRA", "DEVOPS", "PLANNER", "ALTRO"];

/**
 * Stato della notifica di un'attività:
 * - "Si"               → la notifica verrà inviata alla data e ora indicata (scelto dall'utente; predefinito)
 * - "No"               → nessuna notifica (scelto dall'utente)
 * - "Notifica_inviata" → la notifica è partita (impostato SOLO dall'app, leggendo il registro di Power Automate)
 */
export type InviaNotifica = "Si" | "No" | "Notifica_inviata";
export const VALORI_INVIA_NOTIFICA: InviaNotifica[] = ["Si", "No", "Notifica_inviata"];

/** Per le nuove attività la data di invio proposta è l'inizio meno questi minuti */
export const ANTICIPO_PREDEFINITO_MINUTI = 15;

/** Versione della struttura del file di progetto */
export const VERSIONE_SCHEMA = 1;

export interface Partecipante {
  email: string;
  nome?: string;
}

export interface Collegamento {
  tipo: TipoCollegamento;
  titolo: string;
  url: string;
}

export type IdAttivita = number;

export interface Allegato {
  id: string;
  nome: string;
  /** Percorso relativo alla cartella dati, con "/": allegati/<idProgetto>/<idAttività>/<nome> */
  percorsoRelativo: string;
  aggiuntoIl: string;
}

export interface Attivita {
  id: IdAttivita;
  /** Univoco nel progetto, maiuscolo (es. SARA-001) */
  codice: string;
  titolo: string;
  descrizione: string;
  stato: StatoAttivita;
  priorita: Priorita;
  /** Date in formato ISO UTC, es. 2026-10-12T07:00:00.000Z */
  dataOraInizio: string;
  dataOraFine: string;
  percentualeCompletamento: number;
  /** Email del responsabile (obbligatorio): riceve sempre la notifica */
  responsabile: string;
  tag: string[];
  /** Facoltativi: se presenti ricevono anche loro la notifica */
  partecipanti: Partecipante[];
  invia_notifica: InviaNotifica;
  /** Data e ora di invio della notifica (ISO UTC). Obbligatoria se invia_notifica è "Si" o "Notifica_inviata". */
  dataOraNotifica?: string;
  canaleNotifica: CanaleNotifica;
  collegamenti: Collegamento[];
  allegati: Allegato[];
  /** Cresce a ogni modifica fatta dall'utente: serve a scoprire modifiche fatte nel frattempo */
  versione: number;
  creataIl: string;
  aggiornataIl: string;
  aggiornataDa?: string;
}

/** Dati modificabili dall'utente (il resto lo gestisce l'app). Se invia_notifica manca: "Si" se c'è la data di invio, altrimenti "No". */
export type DatiAttivita = Omit<Attivita, "id" | "versione" | "creataIl" | "aggiornataIl" | "aggiornataDa" | "allegati" | "invia_notifica"> & {
  invia_notifica?: InviaNotifica;
};

export interface Dipendenza {
  id: string;
  /** Attività predecessore */
  origineId: IdAttivita;
  /** Attività successore */
  destinazioneId: IdAttivita;
  tipo: TipoDipendenza;
}

export interface Progetto {
  id: string;
  nome: string;
  cliente?: string;
  /** Prefisso per i codici automatici, es. SARA → SARA-001 */
  prefissoCodice: string;
  /** Email dell'unico autore: gli altri aprono il progetto in sola lettura */
  proprietario: string;
  tag: string[];
}

/** Contenuto di un file <progetto>.json */
export interface FileProgetto {
  schemaVersion: typeof VERSIONE_SCHEMA;
  progetto: Progetto;
  attivita: Attivita[];
  dipendenze: Dipendenza[];
  /** Numero di salvataggi del file */
  revisione: number;
  aggiornatoIl: string;
  aggiornatoDa: string;
}

/** Contenuto di _notifiche-inviate.json (scritto solo da Power Automate) */
export interface RegistroNotifiche {
  inviate: { chiave: string; inviataIl: string }[];
}

export interface InfoProgetto {
  id: string;
  nome: string;
  cliente?: string;
  nomeFile: string;
  numeroAttivita: number;
  proprietario: string;
  aggiornatoIl: string;
  aggiornatoDa: string;
  solaLettura: boolean;
}

export interface ElencoProgetti {
  progetti: InfoProgetto[];
  /** Copie create da OneDrive quando lo stesso file è stato modificato su due PC */
  copieInConflitto: { progettoId: string; nome: string; file: string[] }[];
  /** File .json presenti nella cartella ma con struttura non valida */
  fileNonLeggibili: { file: string; messaggio: string }[];
}

/** Ciò che l'interfaccia riceve aprendo un progetto */
export interface DatiProgetto {
  progetto: Progetto;
  attivita: Attivita[];
  dipendenze: Dipendenza[];
  solaLettura: boolean;
}

/** Impostazioni locali del PC (non nella cartella condivisa) */
export interface Impostazioni {
  /** Cartella SharePoint sincronizzata con OneDrive */
  cartellaDati?: string;
  /** Email dell'utente: decide chi può modificare un progetto */
  emailUtente?: string;
  nomeUtente?: string;
}

export type CodiceErrore = "VALIDAZIONE" | "CONFLITTO" | "SOLA_LETTURA" | "NON_TROVATO" | "CONFIGURAZIONE" | "ERRORE";

export class ErroreApp extends Error {
  constructor(public readonly codice: CodiceErrore, messaggio: string) {
    super(messaggio);
    this.name = "ErroreApp";
  }
}

/** Risposta di ogni chiamata dall'interfaccia (gli errori Electron perdono il tipo, quindi si usa un codice) */
export type Risultato<T> = { ok: true; dati: T } | { ok: false; codice: CodiceErrore; messaggio: string };
