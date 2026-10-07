// Vista Kanban: una colonna per stato, spostamento delle card con trascinamento

import { useState, type DragEvent } from "react";
import { STATI, type Attivita, type StatoAttivita } from "../../shared/types";
import type { AzioniVista } from "../tipiVista";
import { COLONNE, COLORI_PRIORITA, COLORI_STATO, ETICHETTE_CANALE, ETICHETTE_INVIA_NOTIFICA, ETICHETTE_PRIORITA, ICONE_INVIA_NOTIFICA, ICONE_STATO, eInRitardo } from "../utils/attivita";
import { fmtDataOra } from "../utils/date";

interface Props {
  attivita: Attivita[];
  solaLettura: boolean;
  azioni: AzioniVista;
}

export default function Kanban({ attivita, solaLettura, azioni }: Props) {
  const [sopra, setSopra] = useState<StatoAttivita | null>(null);
  const ora = Date.now();
  const attivitaById = new Map(attivita.map((a) => [a.id, a]));
  const perStato = new Map<StatoAttivita, Attivita[]>();

  for (const a of attivita) {
    const elenco = perStato.get(a.stato) ?? [];
    elenco.push(a);
    perStato.set(a.stato, elenco);
  }

  function rilascia(e: DragEvent, stato: StatoAttivita) {
    e.preventDefault();
    setSopra(null);
    const a = attivitaById.get(Number(e.dataTransfer.getData("text/plain")));
    if (a && a.stato !== stato) void azioni.cambiaStato(a, stato);
  }

  return (
    <div className="kanban">
      {STATI.map((stato) => {
        const elenco = perStato.get(stato) ?? [];
        return (
          <section
            key={stato}
            className={`colonna ${sopra === stato ? "sopra" : ""}`}
            onDragOver={(e) => {
              if (solaLettura) return;
              e.preventDefault();
              setSopra(stato);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setSopra(null);
            }}
            onDrop={(e) => rilascia(e, stato)}
          >
            <header className="colonna-testa" style={{ borderTopColor: COLORI_STATO[stato] }}>
              <span>{ICONE_STATO[stato]} {COLONNE[stato]}</span>
              <span className="contatore">{elenco.length}</span>
            </header>

            <div className="colonna-corpo">
              {elenco.map((a) => {
                const ritardo = eInRitardo(a, ora);
                return (
                  <article
                    key={a.id}
                    className={`card ${ritardo ? "in-ritardo" : ""}`}
                    style={{ borderLeftColor: COLORI_STATO[a.stato] }}
                    draggable={!solaLettura}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", String(a.id));
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onClick={() => azioni.apri(a)}
                  >
                    <div className="card-testa">
                      <span className="codice">{a.codice}</span>
                      <span className="badge" style={{ background: COLORI_PRIORITA[a.priorita] }}>{ETICHETTE_PRIORITA[a.priorita]}</span>
                    </div>
                    <div className="card-titolo">{a.titolo}</div>
                    <div className="card-responsabile" title="Responsabile">
                      👤 {a.responsabile}
                    </div>
                    <div className="card-date">
                      <div>▶ {fmtDataOra(a.dataOraInizio)}</div>
                      <div>■ {fmtDataOra(a.dataOraFine)}</div>
                    </div>
                    <div className="barra-avanzamento" title={`${a.percentualeCompletamento}%`}>
                      <div style={{ width: `${a.percentualeCompletamento}%` }} />
                    </div>
                    <div className="card-piede">
                      {a.partecipanti.length > 0 && <span title={a.partecipanti.map((p) => p.email).join("\n")}>👥 {a.partecipanti.length}</span>}
                      {a.allegati.length > 0 && <span>📎 {a.allegati.length}</span>}
                      {ritardo && <span className="testo-ritardo">⚠ In ritardo</span>}
                      <span className="spazio" />
                      <button
                        className="btn-icona"
                        title={
                          (a.invia_notifica === "Notifica_inviata"
                            ? `${ETICHETTE_INVIA_NOTIFICA.Notifica_inviata}. Cambia data e ora di invio per inviarla di nuovo.`
                            : `${ETICHETTE_INVIA_NOTIFICA[a.invia_notifica]} – clic per ${a.invia_notifica === "Si" ? "disattivare" : "attivare"}`) +
                          (a.dataOraNotifica && a.invia_notifica !== "No" ? `\nInvio: ${fmtDataOra(a.dataOraNotifica)} · ${ETICHETTE_CANALE[a.canaleNotifica]}` : "")
                        }
                        disabled={solaLettura || a.invia_notifica === "Notifica_inviata"}
                        onClick={(e) => {
                          e.stopPropagation();
                          void azioni.alternaNotifica(a);
                        }}
                      >
                        {ICONE_INVIA_NOTIFICA[a.invia_notifica]}
                      </button>
                    </div>
                  </article>
                );
              })}
              {!elenco.length && <div className="vuoto-colonna">{solaLettura ? "Nessuna attività" : "Trascina qui un'attività"}</div>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
