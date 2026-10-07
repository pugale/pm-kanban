// Espone a React solo le funzioni consentite (window.pm). Il contratto è in src/shared/api.ts.

import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { PmApi } from "../shared/api";

const invoca = (canale: string, ...args: unknown[]) => ipcRenderer.invoke(canale, ...args);

const api: PmApi = {
  impostazioni: () => invoca("impostazioni:leggi"),
  salvaImpostazioni: (m) => invoca("impostazioni:salva", m),
  scegliCartella: () => invoca("impostazioni:scegliCartella"),

  progetti: () => invoca("progetti:elenco"),
  creaProgetto: (input) => invoca("progetti:crea", input),

  attivita: (progettoId) => invoca("attivita:elenco", progettoId),
  prossimoCodice: (progettoId) => invoca("attivita:prossimoCodice", progettoId),
  creaAttivita: (progettoId, dati) => invoca("attivita:crea", progettoId, dati),
  aggiornaAttivita: (progettoId, id, dati, versione) => invoca("attivita:aggiorna", progettoId, id, dati, versione),
  cambiaStato: (progettoId, id, stato, versione) => invoca("attivita:stato", progettoId, id, stato, versione),
  spostaDate: (progettoId, id, inizio, fine, versione) => invoca("attivita:date", progettoId, id, inizio, fine, versione),
  impostaInviaNotifica: (progettoId, id, valore, versione) => invoca("attivita:inviaNotifica", progettoId, id, valore, versione),
  duplicaAttivita: (progettoId, id) => invoca("attivita:duplica", progettoId, id),
  eliminaAttivita: (progettoId, id, versione) => invoca("attivita:elimina", progettoId, id, versione),

  aggiornaStatoNotifiche: () => invoca("notifiche:aggiorna"),

  creaDipendenza: (progettoId, origineId, destinazioneId, tipo) => invoca("dipendenze:crea", progettoId, origineId, destinazioneId, tipo),
  eliminaDipendenza: (progettoId, id) => invoca("dipendenze:elimina", progettoId, id),

  aggiungiAllegati: (progettoId, attivitaId) => invoca("allegati:aggiungi", progettoId, attivitaId),
  rimuoviAllegato: (progettoId, attivitaId, allegatoId) => invoca("allegati:rimuovi", progettoId, attivitaId, allegatoId),
  apriAllegato: (percorsoRelativo) => invoca("allegati:apri", percorsoRelativo),

  onProgettiCambiati: (callback) => {
    const h = (_e: IpcRendererEvent, elenco: string[]) => callback(elenco);
    ipcRenderer.on("progetti:cambiati", h);
    return () => {
      ipcRenderer.removeListener("progetti:cambiati", h);
    };
  },
};

contextBridge.exposeInMainWorld("pm", api);
