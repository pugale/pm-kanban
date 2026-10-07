// Allinea il campo invia_notifica con il registro scritto da Power Automate.
// Power Automate scrive SOLO _notifiche-inviate.json; il passaggio a "Notifica_inviata" lo fa l'app,
// così ogni file ha un solo "scrittore" e non nascono copie in conflitto su OneDrive.

import { promises as fs } from "fs";
import path from "path";
import type { Attivita, RegistroNotifiche } from "../../shared/types";
import { NOME_REGISTRO, cartellaDati } from "./impostazioni";
import { caricaProgetto, conRiprova, elencoProgetti, modificaProgetto } from "./progettoStore";

/** Deve coincidere con l'azione "Chiave" del flusso: idProgetto|idAttività|dataOraNotifica|canale */
export const chiaveNotifica = (progettoId: string, a: Attivita) =>
  `${progettoId}|${a.id}|${a.dataOraNotifica ?? ""}|${a.canaleNotifica}`;

async function leggiChiaviInviate(): Promise<Set<string> | null> {
  try {
    const file = path.join(await cartellaDati(), NOME_REGISTRO);
    const r = await conRiprova(async () => JSON.parse((await fs.readFile(file, "utf8")).replace(/^\uFEFF/, "")) as RegistroNotifiche);
    return new Set((r.inviate ?? []).map((x) => x.chiave));
  } catch {
    return null; // registro mancante o in sincronizzazione: si riprova al giro successivo
  }
}

/** true se la notifica dell'attività (con data di invio e canale attuali) risulta inviata */
const tuttiInviati = (progettoId: string, a: Attivita, inviate: Set<string>) =>
  a.invia_notifica === "Si" && !!a.dataOraNotifica && inviate.has(chiaveNotifica(progettoId, a));

let inCorso = false;

/**
 * Porta a "Notifica_inviata" le attività la cui notifica è partita.
 * Lavora solo sui progetti di cui l'utente è proprietario. Restituisce gli ID dei progetti modificati.
 * Non cambia la "versione" dell'attività: è un aggiornamento di sistema e non deve bloccare un modulo aperto.
 */
export async function aggiornaStatoNotifiche(): Promise<string[]> {
  if (inCorso) return [];
  inCorso = true;
  try {
    const inviate = await leggiChiaviInviate();
    if (!inviate || !inviate.size) return [];

    const modificati: string[] = [];
    for (const p of (await elencoProgetti()).progetti) {
      if (p.solaLettura) continue;
      try {
        const { dati } = await caricaProgetto(p.id);
        if (!dati.attivita.some((a) => tuttiInviati(p.id, a, inviate))) continue;

        await modificaProgetto(p.id, (f) => {
          for (const a of f.attivita) if (tuttiInviati(p.id, a, inviate)) a.invia_notifica = "Notifica_inviata";
        });
        modificati.push(p.id);
      } catch {
        /* un progetto non leggibile non blocca gli altri */
      }
    }
    return modificati;
  } finally {
    inCorso = false;
  }
}
