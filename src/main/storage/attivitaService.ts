// Operazioni su attività, dipendenze e allegati

import { shell } from "electron";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import {
  ErroreApp,
  PRIORITA,
  CANALI_NOTIFICA,
  STATI,
  TIPI_COLLEGAMENTO,
  TIPI_DIPENDENZA,
  VALORI_INVIA_NOTIFICA,
  type Allegato,
  type Attivita,
  type DatiAttivita,
  type DatiProgetto,
  type Dipendenza,
  type FileProgetto,
  type IdAttivita,
  type InviaNotifica,
  type StatoAttivita,
  type TipoDipendenza,
} from "../../shared/types";
import { RE_EMAIL, RE_URL } from "../../shared/validazioneFile";
import { CARTELLA_ALLEGATI, cartellaDati } from "./impostazioni";
import { caricaProgetto, modificaProgetto } from "./progettoStore";


type DatiNormalizzati = Omit<DatiAttivita, "invia_notifica"> & { invia_notifica: InviaNotifica };

// ---------- Supporto ----------

const inUtc = (valore: string, campo: string) => {
  const d = new Date(valore);
  if (isNaN(d.getTime())) throw new ErroreApp("VALIDAZIONE", `${campo}: data non valida.`);
  return d.toISOString();
};

const perInizio = (a: Attivita, b: Attivita) => a.dataOraInizio.localeCompare(b.dataOraInizio);

/** Tolleranza per "data già passata" (il modulo può restare aperto qualche secondo) */
const TOLLERANZA_PASSATO_MS = 60_000;

function normalizza(d: DatiAttivita): DatiNormalizzati {
  const dataOraNotifica = d.dataOraNotifica ? inUtc(d.dataOraNotifica, "Data e ora di invio della notifica") : undefined;
  return {
    ...d,
    codice: (d.codice ?? "").trim().toUpperCase(),
    titolo: (d.titolo ?? "").trim(),
    descrizione: d.descrizione ?? "",
    priorita: d.priorita ?? "MEDIA",
    dataOraInizio: inUtc(d.dataOraInizio, "Data e ora di inizio"),
    dataOraFine: inUtc(d.dataOraFine, "Data e ora di fine"),
    percentualeCompletamento: Math.round(Number(d.percentualeCompletamento) || 0),
    responsabile: (d.responsabile ?? "").trim().toLowerCase(),
    tag: [...new Set((d.tag ?? []).map((t) => t.trim()).filter(Boolean))],
    partecipanti: (d.partecipanti ?? []).map((p) => ({ email: p.email.trim().toLowerCase(), nome: p.nome?.trim() || undefined })),
    dataOraNotifica,
    canaleNotifica: d.canaleNotifica ?? "TEAMS",
    invia_notifica: d.invia_notifica ?? (dataOraNotifica ? "Si" : "No"),
    collegamenti: (d.collegamenti ?? []).map((c) => ({ ...c, titolo: c.titolo?.trim() || c.url, url: c.url.trim() })),
  };
}

/** Identifica la notifica: se cambiano data di invio o canale, la notifica deve ripartire */
const firmaNotifica = (a: { dataOraNotifica?: string; canaleNotifica: string }) => `${a.dataOraNotifica ?? ""}|${a.canaleNotifica}`;

/**
 * Regola del campo invia_notifica in modifica:
 * - "Si" e "No" li sceglie l'utente;
 * - "Notifica_inviata" lo imposta solo l'app: se arriva dall'interfaccia vale "lascia com'era";
 * - se cambiano data di invio o canale, "Notifica_inviata" torna "Si" (la notifica riparte).
 */
function nuovoInviaNotifica(precedente: InviaNotifica, richiesto: InviaNotifica, notificaCambiata: boolean, haData: boolean): InviaNotifica {
  if (richiesto !== "Notifica_inviata") return richiesto;
  if (precedente !== "Notifica_inviata")
    throw new ErroreApp("VALIDAZIONE", 'Il valore "Notifica_inviata" viene impostato automaticamente: scegli "Si" o "No".');
  if (!notificaCambiata) return "Notifica_inviata";
  return haData ? "Si" : "No";
}

/**
 * Regole: codice univoco, responsabile obbligatorio, fine dopo inizio, email valide, notifica, ecc.
 * "precedente" è l'attività prima della modifica: serve a non rifiutare una data di invio già passata ma non cambiata.
 */
export function validaAttivita(a: DatiNormalizzati, tutte: Attivita[], idEscluso?: IdAttivita, precedente?: Attivita): string[] {
  const errori: string[] = [];

  if (!a.codice) errori.push("Il codice è obbligatorio.");
  else if (tutte.some((x) => x.id !== idEscluso && x.codice.toUpperCase() === a.codice.toUpperCase()))
    errori.push(`Il codice ${a.codice} è già usato in questo progetto.`);

  if (!a.titolo) errori.push("Il titolo è obbligatorio.");
  if (a.titolo.includes('"')) errori.push('Il titolo non può contenere virgolette doppie (") perché rompono la notifica Teams.');

  // Responsabile obbligatorio: è un'email perché riceve le notifiche
  if (!a.responsabile) errori.push("Il responsabile è obbligatorio.");
  else if (!RE_EMAIL.test(a.responsabile)) errori.push(`Il responsabile deve essere un'email valida: ${a.responsabile}`);

  if (!STATI.includes(a.stato)) errori.push("Stato non valido.");
  if (!PRIORITA.includes(a.priorita)) errori.push("Priorità non valida.");
  if (a.dataOraFine < a.dataOraInizio) errori.push("La data di fine non può precedere la data di inizio.");
  if (a.percentualeCompletamento < 0 || a.percentualeCompletamento > 100) errori.push("La percentuale deve essere tra 0 e 100.");

  // Partecipanti facoltativi: se presenti devono essere email valide e non ripetute
  const email = new Set<string>();
  for (const p of a.partecipanti) {
    if (!RE_EMAIL.test(p.email)) errori.push(`Email non valida: ${p.email}`);
    else if (email.has(p.email)) errori.push(`Partecipante ripetuto: ${p.email}`);
    email.add(p.email);
  }

  if (!VALORI_INVIA_NOTIFICA.includes(a.invia_notifica)) errori.push('Invia notifica: valori ammessi "Si", "No", "Notifica_inviata".');
  if (!CANALI_NOTIFICA.includes(a.canaleNotifica)) errori.push("Canale di notifica non valido.");
  if (a.invia_notifica === "Si") {
    if (!a.dataOraNotifica) errori.push('Con "Notifiche attive" indica data e ora di invio della notifica.');
    else {
      const cambiata = !precedente || precedente.dataOraNotifica !== a.dataOraNotifica || precedente.invia_notifica === "No";
      if (cambiata && new Date(a.dataOraNotifica).getTime() < Date.now() - TOLLERANZA_PASSATO_MS)
        errori.push("La data e ora di invio della notifica è già passata: scegline una futura.");
    }
  }

  for (const c of a.collegamenti) {
    if (!TIPI_COLLEGAMENTO.includes(c.tipo)) errori.push(`Tipo di collegamento non valido: ${c.tipo}`);
    if (!RE_URL.test(c.url)) errori.push(`Collegamento non valido (deve iniziare con http:// o https://): ${c.url}`);
  }
  return errori;
}

const verifica = (errori: string[]) => {
  if (errori.length) throw new ErroreApp("VALIDAZIONE", errori.join("\n"));
};

const trova = (f: FileProgetto, id: IdAttivita) => {
  const a = f.attivita.find((x) => String(x.id) === String(id));
  if (!a) throw new ErroreApp("NON_TROVATO", "Attività non trovata: potrebbe essere stata eliminata.");
  return a;
};

const controllaVersione = (a: Attivita, versione: number) => {
  if (a.versione !== versione)
    throw new ErroreApp("CONFLITTO", `L'attività ${a.codice} è stata modificata nel frattempo. Ricarica prima di salvare.`);
};

const tocca = (a: Attivita, utente: string) => {
  a.versione += 1;
  a.aggiornataIl = new Date().toISOString();
  a.aggiornataDa = utente || undefined;
};

function calcolaProssimoCodice(f: FileProgetto): string {
  const prefisso = f.progetto.prefissoCodice;
  const re = new RegExp(`^${prefisso}-(\\d+)$`, "i");
  const max = f.attivita.reduce((m, a) => Math.max(m, Number(re.exec(a.codice)?.[1] ?? 0)), 0);
  return `${prefisso}-${String(max + 1).padStart(3, "0")}`;
}

function calcolaProssimoId(f: FileProgetto): number {
  let max = 0;
  for (const a of f.attivita) {
    const id = Number(a.id);
    if (Number.isFinite(id) && id > max) max = id;
  }
  return max + 1;
}

// ---------- Lettura ----------

export async function elencoAttivita(progettoId: string): Promise<DatiProgetto> {
  const { dati, solaLettura } = await caricaProgetto(progettoId);
  return {
    progetto: dati.progetto,
    attivita: [...dati.attivita].sort(perInizio),
    dipendenze: dati.dipendenze,
    solaLettura,
  };
}

export async function prossimoCodice(progettoId: string): Promise<string> {
  return calcolaProssimoCodice((await caricaProgetto(progettoId)).dati);
}

// ---------- Scrittura ----------

/** Se il codice è vuoto viene generato automaticamente (es. SARA-014) */
export function creaAttivita(progettoId: string, input: DatiAttivita): Promise<Attivita> {
  return modificaProgetto(progettoId, (f, utente) => {
    const d = normalizza({ ...input, codice: input.codice?.trim() ? input.codice : calcolaProssimoCodice(f) });
    // un'attività nuova non può avere la notifica già inviata
    if (d.invia_notifica === "Notifica_inviata") d.invia_notifica = d.dataOraNotifica ? "Si" : "No";
    verifica(validaAttivita(d, f.attivita));
    const ora = new Date().toISOString();
    const nuova: Attivita = {
      ...d,
      id: calcolaProssimoId(f),
      allegati: [],
      versione: 1,
      creataIl: ora,
      aggiornataIl: ora,
      aggiornataDa: utente || undefined,
    };
    if (nuova.stato === "COMPLETATA") nuova.percentualeCompletamento = 100;
    f.attivita.push(nuova);
    return nuova;
  });
}

export function aggiornaAttivita(progettoId: string, id: IdAttivita, input: DatiAttivita, versione: number): Promise<Attivita> {
  return modificaProgetto(progettoId, (f, utente) => {
    const att = trova(f, id);
    controllaVersione(att, versione);
    const d = normalizza({ ...input, invia_notifica: input.invia_notifica ?? att.invia_notifica });
    const notificaCambiata = firmaNotifica(att) !== firmaNotifica(d);
    d.invia_notifica = nuovoInviaNotifica(att.invia_notifica, d.invia_notifica, notificaCambiata, !!d.dataOraNotifica);
    verifica(validaAttivita(d, f.attivita, id, att));
    const aggiornata: Attivita = {
      ...att,
      ...d,
      id: att.id,
      allegati: att.allegati,
      versione: att.versione,
      creataIl: att.creataIl,
      aggiornataIl: att.aggiornataIl,
    };
    if (aggiornata.stato === "COMPLETATA") aggiornata.percentualeCompletamento = 100;
    tocca(aggiornata, utente);
    f.attivita[f.attivita.indexOf(att)] = aggiornata;
    return aggiornata;
  });
}

/** Interruttore rapido sulla card: attiva ("Si") o disattiva ("No") le notifiche */
export function impostaInviaNotifica(progettoId: string, id: IdAttivita, valore: "Si" | "No", versione: number): Promise<Attivita> {
  return modificaProgetto(progettoId, (f, utente) => {
    if (valore !== "Si" && valore !== "No") throw new ErroreApp("VALIDAZIONE", 'Valori ammessi: "Si" o "No".');
    const a = trova(f, id);
    controllaVersione(a, versione);
    if (valore === "Si") {
      if (!a.dataOraNotifica || new Date(a.dataOraNotifica).getTime() < Date.now())
        throw new ErroreApp("VALIDAZIONE", `Apri l'attività ${a.codice} e indica una data e ora di invio futura per la notifica.`);
      if (!a.responsabile) throw new ErroreApp("VALIDAZIONE", "Indica prima il responsabile: è lui a ricevere le notifiche.");
    }
    a.invia_notifica = valore;
    tocca(a, utente);
    return a;
  });
}

/** Kanban: trascinamento della card su un'altra colonna */
export function cambiaStato(progettoId: string, id: IdAttivita, stato: StatoAttivita, versione: number): Promise<Attivita> {
  return modificaProgetto(progettoId, (f, utente) => {
    if (!STATI.includes(stato)) throw new ErroreApp("VALIDAZIONE", "Stato non valido.");
    const a = trova(f, id);
    controllaVersione(a, versione);
    a.stato = stato;
    if (stato === "COMPLETATA") a.percentualeCompletamento = 100;
    tocca(a, utente);
    return a;
  });
}

/** Gantt: spostamento o ridimensionamento della barra */
export function spostaDate(progettoId: string, id: IdAttivita, inizio: string, fine: string, versione: number): Promise<Attivita> {
  return modificaProgetto(progettoId, (f, utente) => {
    const a = trova(f, id);
    controllaVersione(a, versione);
    const i = inUtc(inizio, "Data e ora di inizio");
    const fi = inUtc(fine, "Data e ora di fine");
    if (fi < i) throw new ErroreApp("VALIDAZIONE", "La data di fine non può precedere la data di inizio.");
    // La notifica si sposta insieme all'inizio, mantenendo lo stesso anticipo; se era già inviata riparte
    const delta = new Date(i).getTime() - new Date(a.dataOraInizio).getTime();
    if (delta !== 0 && a.dataOraNotifica && a.invia_notifica !== "No") {
      const nuova = new Date(new Date(a.dataOraNotifica).getTime() + delta);
      a.dataOraNotifica = nuova.toISOString();
      // se la nuova data è già passata la notifica non può partire: si disattiva invece di inviarla in ritardo
      a.invia_notifica = nuova.getTime() >= Date.now() ? "Si" : "No";
    }
    a.dataOraInizio = i;
    a.dataOraFine = fi;
    tocca(a, utente);
    return a;
  });
}

/** Copia dell'attività: nuovo codice, stato "In preparazione", 0%, senza allegati */
export function duplicaAttivita(progettoId: string, id: IdAttivita): Promise<Attivita> {
  return modificaProgetto(progettoId, (f, utente) => {
    const o = trova(f, id);
    const ora = new Date().toISOString();
    const copia: Attivita = {
      ...structuredClone(o),
      id: calcolaProssimoId(f),
      codice: calcolaProssimoCodice(f),
      titolo: `${o.titolo} (copia)`,
      stato: "IN_PREPARAZIONE",
      percentualeCompletamento: 0,
      // la copia ha notifiche attive solo se la data di invio è ancora futura
      invia_notifica:
        o.invia_notifica !== "No" && o.dataOraNotifica && new Date(o.dataOraNotifica).getTime() >= Date.now() ? "Si" : "No",
      allegati: [],
      versione: 1,
      creataIl: ora,
      aggiornataIl: ora,
      aggiornataDa: utente || undefined,
    };
    f.attivita.push(copia);
    return copia;
  });
}

export async function eliminaAttivita(progettoId: string, id: IdAttivita, versione: number): Promise<void> {
  await modificaProgetto(progettoId, (f) => {
    const a = trova(f, id);
    controllaVersione(a, versione);
    f.attivita = f.attivita.filter((x) => x.id !== id);
    f.dipendenze = f.dipendenze.filter((d) => d.origineId !== id && d.destinazioneId !== id);
  });
  const cartella = await cartellaDati();
  await fs.rm(path.join(cartella, CARTELLA_ALLEGATI, progettoId, String(id)), { recursive: true, force: true });
}

// ---------- Dipendenze (Gantt) ----------

/** true se partendo da "da" e seguendo le frecce si arriva ad "a" */
function raggiungibile(dipendenze: Dipendenza[], da: IdAttivita, a: IdAttivita): boolean {
  const visitati = new Set<IdAttivita>();
  const coda: IdAttivita[] = [da];
  while (coda.length) {
    const n = coda.shift()!;
    if (n === a) return true;
    if (visitati.has(n)) continue;
    visitati.add(n);
    for (const d of dipendenze) if (d.origineId === n) coda.push(d.destinazioneId);
  }
  return false;
}

export function creaDipendenza(progettoId: string, origineId: IdAttivita, destinazioneId: IdAttivita, tipo: TipoDipendenza = "FS"): Promise<Dipendenza> {
  return modificaProgetto(progettoId, (f) => {
    const o = trova(f, origineId);
    const d = trova(f, destinazioneId);
    if (!TIPI_DIPENDENZA.includes(tipo)) throw new ErroreApp("VALIDAZIONE", "Tipo di dipendenza non valido.");
    if (origineId === destinazioneId) throw new ErroreApp("VALIDAZIONE", "Un'attività non può dipendere da se stessa.");
    if (f.dipendenze.some((x) => x.origineId === origineId && x.destinazioneId === destinazioneId))
      throw new ErroreApp("VALIDAZIONE", `Esiste già un collegamento tra ${o.codice} e ${d.codice}.`);
    if (raggiungibile(f.dipendenze, destinazioneId, origineId))
      throw new ErroreApp("VALIDAZIONE", `Il collegamento ${o.codice} → ${d.codice} creerebbe un ciclo.`);
    const nuova: Dipendenza = { id: randomUUID(), origineId, destinazioneId, tipo };
    f.dipendenze.push(nuova);
    return nuova;
  });
}

export async function eliminaDipendenza(progettoId: string, id: string): Promise<void> {
  await modificaProgetto(progettoId, (f) => {
    f.dipendenze = f.dipendenze.filter((d) => d.id !== id);
  });
}

// ---------- Allegati (copiati nella cartella condivisa: allegati/<progetto>/<attività>/) ----------

async function esiste(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function percorsoAssoluto(cartella: string, relativo: string) {
  const base = path.resolve(cartella);
  const assoluto = path.resolve(base, ...relativo.split("/"));
  if (!assoluto.startsWith(base + path.sep)) throw new ErroreApp("VALIDAZIONE", "Percorso dell'allegato non valido.");
  return assoluto;
}

/** Restituisce l'attività aggiornata (la versione cambia: l'interfaccia deve usare questa copia) */
export async function aggiungiAllegato(progettoId: string, attivitaId: IdAttivita, percorsoOrigine: string): Promise<Attivita> {
  const cartella = await cartellaDati();
  const dirRelativa = [CARTELLA_ALLEGATI, progettoId, String(attivitaId)];
  const dirAssoluta = path.join(cartella, ...dirRelativa);
  await fs.mkdir(dirAssoluta, { recursive: true });

  const nome = path.basename(percorsoOrigine);
  const ext = path.extname(nome);
  let nomeFinale = nome;
  for (let i = 1; await esiste(path.join(dirAssoluta, nomeFinale)); i++) nomeFinale = `${path.basename(nome, ext)} (${i})${ext}`;

  const destinazione = path.join(dirAssoluta, nomeFinale);
  await fs.copyFile(percorsoOrigine, destinazione);

  const allegato: Allegato = {
    id: randomUUID(),
    nome: nomeFinale,
    percorsoRelativo: [...dirRelativa, nomeFinale].join("/"),
    aggiuntoIl: new Date().toISOString(),
  };
  try {
    return await modificaProgetto(progettoId, (f, utente) => {
      const a = trova(f, attivitaId);
      a.allegati = [...(a.allegati ?? []), allegato];
      tocca(a, utente);
      return a;
    });
  } catch (e) {
    await fs.rm(destinazione, { force: true });
    throw e;
  }
}

export async function rimuoviAllegato(progettoId: string, attivitaId: IdAttivita, allegatoId: string): Promise<Attivita> {
  let relativo: string | undefined;
  const a = await modificaProgetto(progettoId, (f, utente) => {
    const att = trova(f, attivitaId);
    relativo = att.allegati.find((x) => x.id === allegatoId)?.percorsoRelativo;
    att.allegati = att.allegati.filter((x) => x.id !== allegatoId);
    tocca(att, utente);
    return att;
  });
  if (relativo) await fs.rm(percorsoAssoluto(await cartellaDati(), relativo), { force: true });
  return a;
}

export async function apriAllegato(percorsoRelativo: string): Promise<void> {
  const errore = await shell.openPath(percorsoAssoluto(await cartellaDati(), percorsoRelativo));
  if (errore) throw new ErroreApp("ERRORE", `Impossibile aprire l'allegato: ${errore}`);
}
