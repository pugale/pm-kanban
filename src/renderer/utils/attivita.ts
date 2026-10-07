// Etichette, colori e regole di visualizzazione delle attività

import type { Attivita, CanaleNotifica, InviaNotifica, Priorita, StatoAttivita, TipoCollegamento, TipoDipendenza } from "../../shared/types";

/** Nomi delle colonne della Kanban */
export const COLONNE: Record<StatoAttivita, string> = {
  IN_PREPARAZIONE: "In preparazione",
  DA_INIZIARE: "Da iniziare",
  IN_CORSO: "In corso",
  SOSPESA: "Sospesi",
  COMPLETATA: "Completati",
  ANNULLATA: "Annullati",
};

/** Stato della singola attività */
export const ETICHETTE_STATO: Record<StatoAttivita, string> = {
  IN_PREPARAZIONE: "In preparazione",
  DA_INIZIARE: "Da iniziare",
  IN_CORSO: "In corso",
  SOSPESA: "Sospesa",
  COMPLETATA: "Completata",
  ANNULLATA: "Annullata",
};

export const ICONE_STATO: Record<StatoAttivita, string> = {
  IN_PREPARAZIONE: "📋",
  DA_INIZIARE: "⏳",
  IN_CORSO: "🚀",
  SOSPESA: "⏸️",
  COMPLETATA: "✅",
  ANNULLATA: "❌",
};

/** Stessi colori in Kanban, Gantt e Calendario */
export const COLORI_STATO: Record<StatoAttivita, string> = {
  IN_PREPARAZIONE: "#9e9e9e",
  DA_INIZIARE: "#4fc3f7",
  IN_CORSO: "#1e88e5",
  SOSPESA: "#fb8c00",
  COMPLETATA: "#43a047",
  ANNULLATA: "#e53935",
};

export const ETICHETTE_PRIORITA: Record<Priorita, string> = { BASSA: "Bassa", MEDIA: "Media", ALTA: "Alta", CRITICA: "Critica" };
export const COLORI_PRIORITA: Record<Priorita, string> = { BASSA: "#78909c", MEDIA: "#1e88e5", ALTA: "#fb8c00", CRITICA: "#c62828" };

export const ETICHETTE_INVIA_NOTIFICA: Record<InviaNotifica, string> = {
  Si: "🔔 Notifiche attive",
  No: "🔕 Nessuna notifica",
  Notifica_inviata: "✅ Notifiche inviate",
};
export const ETICHETTE_CANALE: Record<CanaleNotifica, string> = { TEAMS: "Teams", EMAIL: "Email", ENTRAMBI: "Teams ed email" };

export const ICONE_INVIA_NOTIFICA: Record<InviaNotifica, string> = { Si: "🔔", No: "🔕", Notifica_inviata: "✅" };

export const ETICHETTE_DIPENDENZA: Record<TipoDipendenza, string> = {
  FS: "Fine → Inizio",
  SS: "Inizio → Inizio",
  FF: "Fine → Fine",
  SF: "Inizio → Fine",
};

export const ETICHETTE_COLLEGAMENTO: Record<TipoCollegamento, string> = {
  SHAREPOINT: "SharePoint",
  TEAMS: "Teams",
  JIRA: "Jira",
  DEVOPS: "DevOps",
  PLANNER: "Planner",
  ALTRO: "Altro",
};

export const eChiusa = (a: Attivita) => a.stato === "COMPLETATA" || a.stato === "ANNULLATA";

/** Regola concordata: data fine passata e attività non completata (le annullate non sono "in ritardo") */
export const eInRitardo = (a: Attivita, ora = Date.now()) => !eChiusa(a) && new Date(a.dataOraFine).getTime() < ora;

/** Ricerca su codice, titolo, descrizione, responsabile, tag ed email dei partecipanti */
export function corrispondeRicerca(a: Attivita, testo: string): boolean {
  const t = testo.trim().toLowerCase();
  if (!t) return true;

  const campi = [a.codice, a.titolo, a.descrizione, a.responsabile ?? ""];
  for (const tag of a.tag) campi.push(tag);
  for (const p of a.partecipanti) {
    campi.push(p.email, p.nome ?? "");
  }

  for (const campo of campi) {
    if (campo && campo.toLowerCase().includes(t)) return true;
  }

  return false;
}

export const eMia = (a: Attivita, email?: string) => {
  const e = email?.toLowerCase();
  if (!e) return false;
  if (a.responsabile && a.responsabile.toLowerCase() === e) return true;
  for (const p of a.partecipanti) {
    if (p.email.toLowerCase() === e) return true;
  }
  return false;
};
