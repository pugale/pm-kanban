// Avvisa l'interfaccia quando OneDrive porta modifiche da altri PC
// e aggiorna invia_notifica quando Power Automate scrive il registro.

import { BrowserWindow } from "electron";
import { watch, type FSWatcher } from "fs";
import { NOME_REGISTRO, cartellaDati } from "./impostazioni";
import { aggiornaStatoNotifiche } from "./notificheService";
import { eFileProgetto, eScritturaPropria, invalidaIndice } from "./progettoStore";

const CONTROLLO_PERIODICO_MS = 5 * 60_000; // rete di sicurezza: gli eventi delle cartelle OneDrive a volte si perdono

let osservatore: FSWatcher | undefined;
let timerProgetti: NodeJS.Timeout | undefined;
let timerRegistro: NodeJS.Timeout | undefined;
let periodico: NodeJS.Timeout | undefined;
const cambiati = new Set<string>();

const avvisaInterfaccia = (elenco: string[]) => {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send("progetti:cambiati", elenco);
};

async function allineaNotifiche() {
  try {
    const modificati = await aggiornaStatoNotifiche();
    if (modificati.length) avvisaInterfaccia(modificati);
  } catch {
    /* cartella non raggiungibile: si riprova al prossimo giro */
  }
}

export async function avviaOsservatore(): Promise<void> {
  fermaOsservatore();
  let cartella: string;
  try {
    cartella = await cartellaDati();
  } catch {
    return; // cartella non ancora configurata o non raggiungibile
  }

  osservatore = watch(cartella, { persistent: false }, (_evento, nomeFile) => {
    const nome = nomeFile?.toString();
    if (!nome) return;

    // Il registro è cambiato: Power Automate ha inviato qualcosa
    if (nome === NOME_REGISTRO) {
      clearTimeout(timerRegistro);
      timerRegistro = setTimeout(() => void allineaNotifiche(), 2000);
      return;
    }

    if (!eFileProgetto(nome) || eScritturaPropria(nome)) return;
    cambiati.add(nome);
    clearTimeout(timerProgetti);
    // OneDrive genera più eventi di seguito: si aspetta che finisca
    timerProgetti = setTimeout(() => {
      const elenco = [...cambiati];
      cambiati.clear();
      invalidaIndice();
      avvisaInterfaccia(elenco);
    }, 1500);
  });

  osservatore.on("error", () => {
    fermaOsservatore();
    setTimeout(() => void avviaOsservatore(), 30_000);
  });

  periodico = setInterval(() => void allineaNotifiche(), CONTROLLO_PERIODICO_MS);
  void allineaNotifiche(); // all'avvio
}

export function fermaOsservatore(): void {
  osservatore?.close();
  osservatore = undefined;
  clearInterval(periodico);
  clearTimeout(timerProgetti);
  clearTimeout(timerRegistro);
}
