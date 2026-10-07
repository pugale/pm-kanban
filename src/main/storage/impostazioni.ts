// Impostazioni locali dell'utente (salvate sul PC, NON nella cartella condivisa)

import { app, dialog, type BrowserWindow, type OpenDialogOptions } from "electron";
import { promises as fs } from "fs";
import path from "path";
import { ErroreApp, type Impostazioni } from "../../shared/types";

/** File scritto SOLO da Power Automate (l'app lo crea vuoto la prima volta) */
export const NOME_REGISTRO = "_notifiche-inviate.json";
export const CARTELLA_ALLEGATI = "allegati";

const fileImpostazioni = () => path.join(app.getPath("userData"), "impostazioni.json");

export async function leggiImpostazioni(): Promise<Impostazioni> {
  try {
    return JSON.parse(await fs.readFile(fileImpostazioni(), "utf8")) as Impostazioni;
  } catch {
    return {};
  }
}

export async function salvaImpostazioni(modifiche: Partial<Impostazioni>): Promise<Impostazioni> {
  const nuove: Impostazioni = { ...(await leggiImpostazioni()), ...modifiche };
  if (nuove.emailUtente) nuove.emailUtente = nuove.emailUtente.trim().toLowerCase();
  await fs.mkdir(path.dirname(fileImpostazioni()), { recursive: true });
  await fs.writeFile(fileImpostazioni(), JSON.stringify(nuove, null, 2), "utf8");
  return nuove;
}

/** Fa scegliere la cartella SharePoint sincronizzata e la prepara */
export async function scegliCartella(finestra?: BrowserWindow): Promise<string | undefined> {
  const opzioni: OpenDialogOptions = {
    title: "Scegli la cartella SharePoint sincronizzata con OneDrive",
    properties: ["openDirectory", "createDirectory"],
  };
  const r = finestra ? await dialog.showOpenDialog(finestra, opzioni) : await dialog.showOpenDialog(opzioni);
  const cartella = r.filePaths[0];
  if (r.canceled || !cartella) return undefined;

  await preparaCartella(cartella);
  await salvaImpostazioni({ cartellaDati: cartella });
  return cartella;
}

export async function preparaCartella(cartella: string) {
  const registro = path.join(cartella, NOME_REGISTRO);
  try {
    await fs.access(registro);
  } catch {
    await fs.writeFile(registro, JSON.stringify({ inviate: [] }, null, 2), "utf8");
  }
  await fs.mkdir(path.join(cartella, CARTELLA_ALLEGATI), { recursive: true });
}

/** Restituisce la cartella dati verificando che sia raggiungibile */
export async function cartellaDati(): Promise<string> {
  const { cartellaDati: cartella } = await leggiImpostazioni();
  if (!cartella) throw new ErroreApp("CONFIGURAZIONE", "Scegli prima la cartella dei progetti in Impostazioni.");
  try {
    await fs.access(cartella);
  } catch {
    throw new ErroreApp(
      "CONFIGURAZIONE",
      `La cartella ${cartella} non è raggiungibile. Controlla che OneDrive sia avviato e che la cartella sia ancora sincronizzata.`
    );
  }
  return cartella;
}
