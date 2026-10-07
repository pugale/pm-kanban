// Azioni che le viste chiedono all'App (che gestisce errori, conflitti e aggiornamento dei dati)

import type { Attivita, DatiAttivita, IdAttivita, StatoAttivita, TipoDipendenza } from "../shared/types";

export interface AzioniVista {
  apri(a: Attivita): void;
  nuova(preimpostato?: Partial<DatiAttivita>): void;
  cambiaStato(a: Attivita, stato: StatoAttivita): Promise<void>;
  spostaDate(a: Attivita, inizioUtc: string, fineUtc: string): Promise<void>;
  alternaNotifica(a: Attivita): Promise<void>;
  creaDipendenza(origineId: IdAttivita, destinazioneId: IdAttivita, tipo: TipoDipendenza): Promise<void>;
  eliminaDipendenza(id: string): Promise<void>;
}
