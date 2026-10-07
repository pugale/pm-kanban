// Finestra per creare, modificare, duplicare ed eliminare un'attività

import { useEffect, useState } from "react";
import {
  ANTICIPO_PREDEFINITO_MINUTI,
  CANALI_NOTIFICA,
  PRIORITA,
  STATI,
  TIPI_COLLEGAMENTO,
  type Attivita,
  type CanaleNotifica,
  type Collegamento,
  type DatiAttivita,
  type InviaNotifica,
  type Progetto,
} from "../../shared/types";
import { ETICHETTE_CANALE, ETICHETTE_COLLEGAMENTO, ETICHETTE_INVIA_NOTIFICA, ETICHETTE_PRIORITA, ETICHETTE_STATO } from "../utils/attivita";
import { MS_ORA, daInput, fmtDataOra, perInput, prossimaOraPiena } from "../utils/date";
import Finestra from "./Finestra";

interface Props {
  progetto: Progetto;
  attivita?: Attivita;
  preimpostato?: Partial<DatiAttivita>;
  solaLettura: boolean;
  emailUtente?: string;
  onChiudi(): void;
  /** Attività salvata, duplicata o con allegati cambiati */
  onAggiornata(a: Attivita): void;
  onEliminata(id: number): void;
  /** L'attività è stata modificata altrove: chiudere e ricaricare */
  onConflitto(messaggio: string): void;
}

/** Testo dell'anticipo rispetto all'inizio, es. "15 minuti prima dell'inizio" */
function descriviAnticipo(notificaLocale: string, inizioLocale: string): string {
  const min = Math.round((new Date(inizioLocale).getTime() - new Date(notificaLocale).getTime()) / 60_000);
  if (isNaN(min)) return "";
  if (min === 0) return "All'ora di inizio dell'attività.";
  const ass = Math.abs(min);
  const g = Math.floor(ass / 1440), o = Math.floor((ass % 1440) / 60), m = ass % 60;
  const parti = [g && `${g} ${g === 1 ? "giorno" : "giorni"}`, o && `${o} ${o === 1 ? "ora" : "ore"}`, m && `${m} ${m === 1 ? "minuto" : "minuti"}`].filter(Boolean);
  return `${parti.join(" e ")} ${min > 0 ? "prima" : "dopo"} l'inizio dell'attività.`;
}

/**
 * Data di invio proposta per una nuova attività: 15 minuti prima dell'inizio.
 * Se quell'orario è già passato si propone il primo multiplo di 5 minuti tra 5 minuti (purché prima dell'inizio).
 */
function proponiNotifica(inizioIso: string): { data: string; futura: boolean } {
  const inizio = new Date(inizioIso).getTime();
  const proposta = inizio - ANTICIPO_PREDEFINITO_MINUTI * 60_000;
  const cinque = 5 * 60_000;
  const minimo = Math.ceil((Date.now() + cinque) / cinque) * cinque;
  if (proposta >= minimo) return { data: new Date(proposta).toISOString(), futura: true };
  if (inizio >= minimo) return { data: new Date(minimo).toISOString(), futura: true };
  return { data: new Date(proposta).toISOString(), futura: false }; // attività già iniziata o nel passato
}

const leggiEmail = (testo: string) =>
  testo
    .split(/[\s;,]+/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

export default function ModuloAttivita({ progetto, attivita, preimpostato, solaLettura, emailUtente, onChiudi, onAggiornata, onEliminata, onConflitto }: Props) {
  const nuova = !attivita;
  const [corrente, setCorrente] = useState<Attivita | undefined>(attivita);
  const base: Partial<Attivita> = attivita ?? preimpostato ?? {};

  const inizioDefault = base.dataOraInizio ?? prossimaOraPiena().toISOString();
  const fineDefault = base.dataOraFine ?? new Date(new Date(inizioDefault).getTime() + MS_ORA).toISOString();
  // Nuova attività: notifiche attive via Teams, invio proposto 15 minuti prima dell'inizio.
  // Per un'attività nel passato la notifica parte disattivata.
  const proposta = proponiNotifica(inizioDefault);
  const notificaDefault = base.dataOraNotifica ?? proposta.data;
  const inviaDefault: InviaNotifica = base.invia_notifica ?? (proposta.futura ? "Si" : "No");

  const [codice, setCodice] = useState(base.codice ?? "");
  const [titolo, setTitolo] = useState(base.titolo ?? "");
  const [descrizione, setDescrizione] = useState(base.descrizione ?? "");
  const [stato, setStato] = useState(base.stato ?? "IN_PREPARAZIONE");
  const [priorita, setPriorita] = useState(base.priorita ?? "MEDIA");
  const [inizio, setInizio] = useState(perInput(inizioDefault));
  const [fine, setFine] = useState(perInput(fineDefault));
  const [percentuale, setPercentuale] = useState(base.percentualeCompletamento ?? 0);
  const [responsabile, setResponsabile] = useState(base.responsabile ?? emailUtente ?? "");
  const [tag, setTag] = useState((base.tag ?? []).join(", "));
  const [partecipanti, setPartecipanti] = useState((base.partecipanti ?? []).map((p) => p.email).join("\n"));
  const [inviaNotifica, setInviaNotifica] = useState<InviaNotifica>(inviaDefault);
  const [dataNotifica, setDataNotifica] = useState(perInput(notificaDefault));
  const [canaleNotifica, setCanaleNotifica] = useState<CanaleNotifica>(base.canaleNotifica ?? "TEAMS");
  const [collegamenti, setCollegamenti] = useState<Collegamento[]>(base.collegamenti ?? []);
  const [errori, setErrori] = useState<string[]>([]);
  const [prossimo, setProssimo] = useState("");
  const [inCorso, setInCorso] = useState(false);

  useEffect(() => {
    if (nuova) void window.pm.prossimoCodice(progetto.id).then((r) => r.ok && setProssimo(r.dati));
  }, [nuova, progetto.id]);

  /** Cambiando l'inizio si spostano anche la fine e la data di invio della notifica, mantenendo durata e anticipo */
  function cambiaInizio(v: string) {
    const vecchioInizio = new Date(inizio).getTime();
    const durata = new Date(fine).getTime() - vecchioInizio;
    const anticipo = vecchioInizio - new Date(dataNotifica).getTime();
    setInizio(v);
    const nuovoInizio = new Date(v).getTime();
    if (isNaN(nuovoInizio)) return;
    if (durata >= 0) setFine(perInput(new Date(nuovoInizio + durata).toISOString()));
    if (!isNaN(anticipo) && inviaNotifica !== "No") setDataNotifica(perInput(new Date(nuovoInizio - anticipo).toISOString()));
  }

  function datiModulo(): DatiAttivita {
    const nomiEsistenti = new Map((corrente?.partecipanti ?? []).map((p) => [p.email.toLowerCase(), p.nome]));
    return {
      codice,
      titolo,
      descrizione,
      stato,
      priorita,
      dataOraInizio: daInput(inizio),
      dataOraFine: daInput(fine),
      percentualeCompletamento: Number(percentuale),
      responsabile,
      tag: tag.split(",").map((t) => t.trim()).filter(Boolean),
      partecipanti: [...new Set(leggiEmail(partecipanti))].map((email) => ({ email, nome: nomiEsistenti.get(email) })),
      invia_notifica: inviaNotifica,
      dataOraNotifica: daInput(dataNotifica) || undefined,
      canaleNotifica,
      collegamenti: collegamenti.filter((c) => c.url.trim()),
    };
  }

  async function salva() {
    const dati = datiModulo();
    if (!dati.dataOraInizio || !dati.dataOraFine) return setErrori(["Inserisci data e ora di inizio e di fine."]);
    setInCorso(true);
    const r = corrente
      ? await window.pm.aggiornaAttivita(progetto.id, corrente.id, dati, corrente.versione)
      : await window.pm.creaAttivita(progetto.id, dati);
    setInCorso(false);
    if (r.ok) {
      onAggiornata(r.dati);
      onChiudi();
    } else if (r.codice === "CONFLITTO" || r.codice === "NON_TROVATO") onConflitto(r.messaggio);
    else setErrori(r.messaggio.split("\n"));
  }

  async function elimina() {
    if (!corrente || !confirm(`Eliminare definitivamente ${corrente.codice} – ${corrente.titolo}?\nVerranno eliminati anche allegati e collegamenti nel Gantt.`)) return;
    const r = await window.pm.eliminaAttivita(progetto.id, corrente.id, corrente.versione);
    if (r.ok) {
      onEliminata(corrente.id);
      onChiudi();
    } else if (r.codice === "CONFLITTO") onConflitto(r.messaggio);
    else setErrori([r.messaggio]);
  }

  async function duplica() {
    if (!corrente) return;
    const r = await window.pm.duplicaAttivita(progetto.id, corrente.id);
    if (r.ok) {
      onAggiornata(r.dati);
      onChiudi();
    } else setErrori([r.messaggio]);
  }

  async function aggiungiAllegati() {
    if (!corrente) return;
    const r = await window.pm.aggiungiAllegati(progetto.id, corrente.id);
    if (r.ok && r.dati) {
      setCorrente(r.dati);
      onAggiornata(r.dati);
    } else if (!r.ok) setErrori([r.messaggio]);
  }

  async function rimuoviAllegato(id: string, nome: string) {
    if (!corrente || !confirm(`Rimuovere l'allegato "${nome}"?`)) return;
    const r = await window.pm.rimuoviAllegato(progetto.id, corrente.id, id);
    if (r.ok) {
      setCorrente(r.dati);
      onAggiornata(r.dati);
    } else setErrori([r.messaggio]);
  }

  async function apriAllegato(percorso: string) {
    const r = await window.pm.apriAllegato(percorso);
    if (!r.ok) setErrori([r.messaggio]);
  }

  const aggiornaCollegamento = (i: number, m: Partial<Collegamento>) =>
    setCollegamenti(collegamenti.map((c, j) => (j === i ? { ...c, ...m } : c)));

  const titoloFinestra = nuova ? "Nuova attività" : `${corrente?.codice} – ${solaLettura ? "Dettaglio" : "Modifica"}`;

  const piede = (
    <>
      {!nuova && !solaLettura && (
        <>
          <button className="btn pericolo" onClick={elimina}>Elimina</button>
          <button className="btn" onClick={duplica}>Duplica</button>
        </>
      )}
      <span className="spazio" />
      <button className="btn" onClick={onChiudi}>{solaLettura ? "Chiudi" : "Annulla"}</button>
      {!solaLettura && (
        <button className="btn primario" onClick={salva} disabled={inCorso}>
          {inCorso ? "Salvataggio…" : "Salva"}
        </button>
      )}
    </>
  );

  return (
    <Finestra titolo={titoloFinestra} onChiudi={onChiudi} piede={piede} larga>
      {errori.length > 0 && (
        <div className="avviso errore">
          {errori.map((e, i) => <div key={i}>• {e}</div>)}
        </div>
      )}

      <fieldset disabled={solaLettura} className="modulo">
        <div className="riga-modulo">
          <label className="campo stretto">
            Codice
            <input value={codice} onChange={(e) => setCodice(e.target.value)} placeholder={prossimo ? `Automatico: ${prossimo}` : "Automatico"} />
          </label>
          <label className="campo largo">
            Titolo *
            <input value={titolo} onChange={(e) => setTitolo(e.target.value)} autoFocus={nuova} />
          </label>
        </div>

        <label className="campo">
          Descrizione
          <textarea rows={3} value={descrizione} onChange={(e) => setDescrizione(e.target.value)} />
        </label>

        <div className="riga-modulo">
          <label className="campo">
            Stato
            <select value={stato} onChange={(e) => setStato(e.target.value as typeof stato)}>
              {STATI.map((s) => <option key={s} value={s}>{ETICHETTE_STATO[s]}</option>)}
            </select>
          </label>
          <label className="campo">
            Priorità
            <select value={priorita} onChange={(e) => setPriorita(e.target.value as typeof priorita)}>
              {PRIORITA.map((p) => <option key={p} value={p}>{ETICHETTE_PRIORITA[p]}</option>)}
            </select>
          </label>
          <label className="campo">
            Data e ora inizio *
            <input type="datetime-local" value={inizio} onChange={(e) => cambiaInizio(e.target.value)} />
          </label>
          <label className="campo">
            Data e ora fine *
            <input type="datetime-local" value={fine} onChange={(e) => setFine(e.target.value)} />
          </label>
        </div>

        <div className="riga-modulo">
          <label className="campo">
            Responsabile (email) *
            <input type="email" value={responsabile} onChange={(e) => setResponsabile(e.target.value)} placeholder="nome.cognome@azienda.it" />
          </label>
          <label className="campo">
            Tag (separati da virgola)
            <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="CUDE, Bologna" />
          </label>
        </div>

        <div className="riga-modulo">
          <label className="campo">
            Email dei partecipanti (facoltative, una per riga)
            <textarea rows={4} value={partecipanti} onChange={(e) => setPartecipanti(e.target.value)} placeholder="nome.cognome@azienda.it" />
          </label>

          <label className="campo">
            Avanzamento: {percentuale}%
            <input type="range" min={0} max={100} step={5} value={percentuale} onChange={(e) => setPercentuale(Number(e.target.value))} />
          </label>
        </div>

        <div className="riga-modulo">
          <div className="campo">
            Notifica
            <select value={inviaNotifica} onChange={(e) => setInviaNotifica(e.target.value as InviaNotifica)}>
              <option value="Si">{ETICHETTE_INVIA_NOTIFICA.Si}</option>
              <option value="No">{ETICHETTE_INVIA_NOTIFICA.No}</option>
              {corrente?.invia_notifica === "Notifica_inviata" && (
                <option value="Notifica_inviata">{ETICHETTE_INVIA_NOTIFICA.Notifica_inviata} (automatico)</option>
              )}
            </select>

            {inviaNotifica !== "No" && (
              <div className="riquadro-notifica">
                <label className="campo">
                  Data e ora di invio della notifica *
                  <input type="datetime-local" value={dataNotifica} onChange={(e) => setDataNotifica(e.target.value)} />
                </label>
                <label className="campo">
                  Invia tramite
                  <select value={canaleNotifica} onChange={(e) => setCanaleNotifica(e.target.value as CanaleNotifica)}>
                    {CANALI_NOTIFICA.map((c) => <option key={c} value={c}>{ETICHETTE_CANALE[c]}</option>)}
                  </select>
                </label>
                <small className="nota">
                  {descriviAnticipo(dataNotifica, inizio)} Arriverà al responsabile e agli eventuali partecipanti.
                </small>
                {inviaNotifica === "Notifica_inviata" && (
                  <small className="nota">Già inviata. Se cambi data e ora di invio o canale, la notifica riparte.</small>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="campo">
          Collegamenti
          {collegamenti.map((c, i) => (
            <div className="riga-collegamento" key={i}>
              <select value={c.tipo} onChange={(e) => aggiornaCollegamento(i, { tipo: e.target.value as Collegamento["tipo"] })}>
                {TIPI_COLLEGAMENTO.map((t) => <option key={t} value={t}>{ETICHETTE_COLLEGAMENTO[t]}</option>)}
              </select>
              <input placeholder="Titolo" value={c.titolo} onChange={(e) => aggiornaCollegamento(i, { titolo: e.target.value })} />
              <input placeholder="https://…" value={c.url} onChange={(e) => aggiornaCollegamento(i, { url: e.target.value })} className="largo" />
              {c.url ? <a href={c.url} target="_blank" rel="noreferrer" title="Apri nel browser">↗</a> : null}
              <button className="btn-icona" onClick={() => setCollegamenti(collegamenti.filter((_, j) => j !== i))} title="Rimuovi">✕</button>
            </div>
          ))}
          <button className="btn piccolo" onClick={() => setCollegamenti([...collegamenti, { tipo: "SHAREPOINT", titolo: "", url: "" }])}>
            + Aggiungi collegamento
          </button>
        </div>
      </fieldset>

      {solaLettura && collegamenti.length > 0 && (
        <div className="campo">
          {collegamenti.map((c, i) => (
            <a key={i} href={c.url} target="_blank" rel="noreferrer" className="link-collegamento">
              {ETICHETTE_COLLEGAMENTO[c.tipo]}: {c.titolo || c.url}
            </a>
          ))}
        </div>
      )}

      <div className="campo">
        Allegati
        {nuova ? (
          <small className="nota">Salva l'attività per poter aggiungere allegati.</small>
        ) : (
          <>
            {(corrente?.allegati ?? []).map((al) => (
              <div className="riga-allegato" key={al.id}>
                <button className="link" onClick={() => apriAllegato(al.percorsoRelativo)}>📎 {al.nome}</button>
                {!solaLettura && <button className="btn-icona" onClick={() => rimuoviAllegato(al.id, al.nome)} title="Rimuovi">✕</button>}
              </div>
            ))}
            {!solaLettura && <button className="btn piccolo" onClick={aggiungiAllegati}>+ Aggiungi allegati</button>}
          </>
        )}
      </div>

      {corrente && (
        <small className="nota">
          Creata il {fmtDataOra(corrente.creataIl)} · Ultima modifica {fmtDataOra(corrente.aggiornataIl)}
          {corrente.aggiornataDa ? ` da ${corrente.aggiornataDa}` : ""}
        </small>
      )}
    </Finestra>
  );
}
