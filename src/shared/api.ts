// Contratto dell'API esposta dal preload all'interfaccia (window.pm).
// Sta qui, e non nel preload, così l'interfaccia React non dipende dai tipi di Electron.

import type {
  Attivita,
  DatiAttivita,
  DatiProgetto,
  Dipendenza,
  ElencoProgetti,
  IdAttivita,
  Impostazioni,
  InfoProgetto,
  Risultato,
  StatoAttivita,
  TipoDipendenza,
} from "./types";

export type DatiNuovoProgetto = { nome: string; cliente?: string; prefissoCodice: string; tag?: string[] };

export interface PmApi {
  // Impostazioni
  impostazioni(): Promise<Risultato<Impostazioni>>;
  salvaImpostazioni(m: Pick<Impostazioni, "emailUtente" | "nomeUtente">): Promise<Risultato<Impostazioni>>;
  scegliCartella(): Promise<Risultato<string | null>>;

  // Progetti
  progetti(): Promise<Risultato<ElencoProgetti>>;
  creaProgetto(input: DatiNuovoProgetto): Promise<Risultato<InfoProgetto>>;

  // Attività
  attivita(progettoId: string): Promise<Risultato<DatiProgetto>>;
  prossimoCodice(progettoId: string): Promise<Risultato<string>>;
  creaAttivita(progettoId: string, dati: DatiAttivita): Promise<Risultato<Attivita>>;
  aggiornaAttivita(progettoId: string, id: IdAttivita, dati: DatiAttivita, versione: number): Promise<Risultato<Attivita>>;
  cambiaStato(progettoId: string, id: IdAttivita, stato: StatoAttivita, versione: number): Promise<Risultato<Attivita>>;
  spostaDate(progettoId: string, id: IdAttivita, inizioUtc: string, fineUtc: string, versione: number): Promise<Risultato<Attivita>>;
  /** Interruttore notifica: "Si" o "No" ("Notifica_inviata" lo imposta solo l'app) */
  impostaInviaNotifica(progettoId: string, id: IdAttivita, valore: "Si" | "No", versione: number): Promise<Risultato<Attivita>>;
  duplicaAttivita(progettoId: string, id: IdAttivita): Promise<Risultato<Attivita>>;
  eliminaAttivita(progettoId: string, id: IdAttivita, versione: number): Promise<Risultato<void>>;

  // Notifiche
  aggiornaStatoNotifiche(): Promise<Risultato<string[]>>;

  // Dipendenze
  creaDipendenza(progettoId: string, origineId: IdAttivita, destinazioneId: IdAttivita, tipo: TipoDipendenza): Promise<Risultato<Dipendenza>>;
  eliminaDipendenza(progettoId: string, id: string): Promise<Risultato<void>>;

  // Allegati
  aggiungiAllegati(progettoId: string, attivitaId: IdAttivita): Promise<Risultato<Attivita | null>>;
  rimuoviAllegato(progettoId: string, attivitaId: IdAttivita, allegatoId: string): Promise<Risultato<Attivita>>;
  apriAllegato(percorsoRelativo: string): Promise<Risultato<void>>;

  /** Avvisa quando cambiano i file (OneDrive da altri PC, o notifiche segnate come inviate). Restituisce la funzione per smettere di ascoltare. */
  onProgettiCambiati(callback: (elenco: string[]) => void): () => void;
}
