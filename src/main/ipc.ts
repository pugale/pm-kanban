// Canali tra interfaccia React e processo principale

import { BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from "electron";
import type { DatiNuovoProgetto } from "../shared/api";
import { ErroreApp, type CodiceErrore, type DatiAttivita, type IdAttivita, type Impostazioni, type Risultato, type StatoAttivita, type TipoDipendenza } from "../shared/types";
import * as att from "./storage/attivitaService";
import { leggiImpostazioni, salvaImpostazioni, scegliCartella } from "./storage/impostazioni";
import { aggiornaStatoNotifiche } from "./storage/notificheService";
import { avviaOsservatore } from "./storage/osservatore";
import * as store from "./storage/progettoStore";

/** Ogni risposta è { ok: true, dati } oppure { ok: false, codice, messaggio } */
function gestisci<A extends unknown[], T>(canale: string, fn: (...args: A) => Promise<T> | T) {
  ipcMain.handle(canale, async (_e, ...args: unknown[]): Promise<Risultato<T>> => {
    try {
      return { ok: true, dati: await fn(...(args as A)) };
    } catch (e) {
      const codice: CodiceErrore = e instanceof ErroreApp ? e.codice : "ERRORE";
      return { ok: false, codice, messaggio: (e as Error)?.message ?? String(e) };
    }
  });
}

export function registraIpc(): void {
  // Impostazioni
  gestisci("impostazioni:leggi", () => leggiImpostazioni());
  gestisci("impostazioni:salva", (m: Pick<Impostazioni, "emailUtente" | "nomeUtente">) =>
    salvaImpostazioni({ emailUtente: m.emailUtente, nomeUtente: m.nomeUtente })
  );
  gestisci("impostazioni:scegliCartella", async () => {
    const c = await scegliCartella(BrowserWindow.getFocusedWindow() ?? undefined);
    if (c) {
      store.invalidaIndice();
      await avviaOsservatore();
    }
    return c ?? null;
  });

  // Progetti
  gestisci("progetti:elenco", () => store.elencoProgetti());
  gestisci("progetti:crea", (input: DatiNuovoProgetto) => store.creaProgetto(input));

  // Attività
  gestisci("attivita:elenco", (progettoId: string) => att.elencoAttivita(progettoId));
  gestisci("attivita:prossimoCodice", (progettoId: string) => att.prossimoCodice(progettoId));
  gestisci("attivita:crea", (progettoId: string, dati: DatiAttivita) => att.creaAttivita(progettoId, dati));
  gestisci("attivita:aggiorna", (progettoId: string, id: IdAttivita, dati: DatiAttivita, versione: number) => att.aggiornaAttivita(progettoId, id, dati, versione));
  gestisci("attivita:stato", (progettoId: string, id: IdAttivita, stato: StatoAttivita, versione: number) => att.cambiaStato(progettoId, id, stato, versione));
  gestisci("attivita:date", (progettoId: string, id: IdAttivita, inizio: string, fine: string, versione: number) => att.spostaDate(progettoId, id, inizio, fine, versione));
  gestisci("attivita:inviaNotifica", (progettoId: string, id: IdAttivita, valore: "Si" | "No", versione: number) =>
    att.impostaInviaNotifica(progettoId, id, valore, versione)
  );
  gestisci("attivita:duplica", (progettoId: string, id: IdAttivita) => att.duplicaAttivita(progettoId, id));
  gestisci("attivita:elimina", (progettoId: string, id: IdAttivita, versione: number) => att.eliminaAttivita(progettoId, id, versione));

  // Notifiche: allineamento manuale con il registro (oltre a quello automatico)
  gestisci("notifiche:aggiorna", () => aggiornaStatoNotifiche());

  // Dipendenze
  gestisci("dipendenze:crea", (progettoId: string, origineId: IdAttivita, destinazioneId: IdAttivita, tipo: TipoDipendenza) =>
    att.creaDipendenza(progettoId, origineId, destinazioneId, tipo)
  );
  gestisci("dipendenze:elimina", (progettoId: string, id: string) => att.eliminaDipendenza(progettoId, id));

  // Allegati
  gestisci("allegati:aggiungi", async (progettoId: string, attivitaId: IdAttivita) => {
    const finestra = BrowserWindow.getFocusedWindow();
    const opzioni: OpenDialogOptions = { title: "Scegli i file da allegare", properties: ["openFile", "multiSelections"] };
    const r = finestra ? await dialog.showOpenDialog(finestra, opzioni) : await dialog.showOpenDialog(opzioni);
    if (r.canceled || !r.filePaths.length) return null;
    let ultima = null;
    for (const file of r.filePaths) ultima = await att.aggiungiAllegato(progettoId, attivitaId, file);
    return ultima;
  });
  gestisci("allegati:rimuovi", (progettoId: string, attivitaId: IdAttivita, allegatoId: string) => att.rimuoviAllegato(progettoId, attivitaId, allegatoId));
  gestisci("allegati:apri", (percorsoRelativo: string) => att.apriAllegato(percorsoRelativo));
}
