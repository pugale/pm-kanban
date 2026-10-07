// Vista Dashboard: indicatori principali e grafici a barre

import { useMemo } from "react";
import { PRIORITA, STATI, type Attivita } from "../../shared/types";
import type { AzioniVista } from "../tipiVista";
import { COLORI_PRIORITA, COLORI_STATO, ETICHETTE_PRIORITA, ETICHETTE_STATO, ICONE_STATO, eChiusa, eInRitardo } from "../utils/attivita";
import { aggiungiGiorni, fmtDataOra, inizioGiorno, inizioSettimana } from "../utils/date";

interface Props {
  attivita: Attivita[];
  azioni: AzioniVista;
}

interface Barra {
  etichetta: string;
  valore: number;
  colore?: string;
}

function GraficoBarre({ titolo, barre, nota }: { titolo: string; barre: Barra[]; nota?: string }) {
  const max = Math.max(1, ...barre.map((b) => b.valore));
  return (
    <div className="pannello">
      <h3>{titolo}</h3>
      {barre.length === 0 && <div className="vuoto">Nessun dato</div>}
      {barre.map((b) => (
        <div key={b.etichetta} className="riga-grafico">
          <span className="etichetta-grafico" title={b.etichetta}>{b.etichetta}</span>
          <div className="traccia">
            <div className="riempimento" style={{ width: `${(b.valore / max) * 100}%`, background: b.colore ?? "#1e88e5" }} />
          </div>
          <span className="valore-grafico">{b.valore}</span>
        </div>
      ))}
      {nota && <small className="nota">{nota}</small>}
    </div>
  );
}

export default function Dashboard({ attivita, azioni }: Props) {
  const d = useMemo(() => {
    const ora = Date.now();
    const oggi = inizioGiorno(new Date());
    const domani = aggiungiGiorni(oggi, 1);
    const lunedi = inizioSettimana(new Date());
    const lunediProssimo = aggiungiGiorni(lunedi, 7);

    const perStato = new Map<Attivita["stato"], number>();
    const perPriorita = new Map<Attivita["priorita"], number>();
    const perResponsabile = new Map<string, number>();
    const settimane = Array.from({ length: 8 }, (_, i) => {
      const inizio = aggiungiGiorni(lunedi, -7 * (7 - i));
      return {
        inizio,
        fine: aggiungiGiorni(inizio, 7),
        etichetta: `${inizio.getDate()}/${inizio.getMonth() + 1}`,
      };
    });
    const settimanaIndex = new Map<number, number>();
    const perSettimana = settimane.map((w, index) => {
      settimanaIndex.set(w.inizio.getTime(), index);
      return { ...w, valore: 0, colore: COLORI_STATO.COMPLETATA };
    });

    const aperte: Attivita[] = [];
    const ritardo: Attivita[] = [];
    const oggiScadenza: Attivita[] = [];
    const settimanaScadenza: Attivita[] = [];
    let completate = 0;
    let sommaAvanzamento = 0;
    let valide = 0;

    for (const a of attivita) {
      const stato = a.stato;
      const priorita = a.priorita;
      perStato.set(stato, (perStato.get(stato) ?? 0) + 1);

      if (!eChiusa(a)) {
        aperte.push(a);
        perPriorita.set(priorita, (perPriorita.get(priorita) ?? 0) + 1);
        if (a.responsabile) perResponsabile.set(a.responsabile, (perResponsabile.get(a.responsabile) ?? 0) + 1);

        const fine = new Date(a.dataOraFine).getTime();
        if (fine >= oggi.getTime() && fine < domani.getTime()) oggiScadenza.push(a);
        if (fine >= lunedi.getTime() && fine < lunediProssimo.getTime()) settimanaScadenza.push(a);
      }

      if (stato === "COMPLETATA") {
        completate += 1;
        const aggiornataIl = new Date(a.aggiornataIl).getTime();
        for (const settimana of settimane) {
          if (aggiornataIl >= settimana.inizio.getTime() && aggiornataIl < settimana.fine.getTime()) {
            const index = settimanaIndex.get(settimana.inizio.getTime());
            if (index !== undefined) perSettimana[index].valore += 1;
            break;
          }
        }
      }

      if (eInRitardo(a, ora)) ritardo.push(a);

      if (stato !== "ANNULLATA") {
        sommaAvanzamento += a.percentualeCompletamento;
        valide += 1;
      }
    }

    const avanzamentoMedio = valide ? Math.round(sommaAvanzamento / valide) : 0;

    return {
      totale: attivita.length,
      aperte: aperte.length,
      completate,
      ritardo,
      oggi: oggiScadenza,
      settimana: settimanaScadenza,
      avanzamentoMedio,
      perStato: STATI.map((s) => ({ etichetta: `${ICONE_STATO[s]} ${ETICHETTE_STATO[s]}`, valore: perStato.get(s) ?? 0, colore: COLORI_STATO[s] })),
      perPriorita: PRIORITA.map((p) => ({ etichetta: ETICHETTE_PRIORITA[p], valore: perPriorita.get(p) ?? 0, colore: COLORI_PRIORITA[p] })),
      perResponsabile: [...perResponsabile.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([email, n]) => ({ etichetta: email, valore: n })),
      perSettimana: perSettimana.map(({ inizio, etichetta, valore, colore }) => ({ etichetta, valore, colore })),
    };
  }, [attivita]);

  const kpi = [
    { titolo: "Totale attività", valore: d.totale },
    { titolo: "Attività aperte", valore: d.aperte },
    { titolo: "Completate", valore: d.completate, colore: COLORI_STATO.COMPLETATA },
    { titolo: "In ritardo", valore: d.ritardo.length, colore: d.ritardo.length ? "#c62828" : undefined },
    { titolo: "In scadenza oggi", valore: d.oggi.length, colore: d.oggi.length ? "#fb8c00" : undefined },
    { titolo: "In scadenza questa settimana", valore: d.settimana.length },
    { titolo: "Avanzamento medio", valore: `${d.avanzamentoMedio}%` },
  ];

  return (
    <div className="dashboard">
      <div className="kpi-griglia">
        {kpi.map((k) => (
          <div key={k.titolo} className="kpi" style={{ borderTopColor: k.colore ?? "#cfd8dc" }}>
            <div className="kpi-valore" style={{ color: k.colore }}>{k.valore}</div>
            <div className="kpi-titolo">{k.titolo}</div>
          </div>
        ))}
      </div>

      <div className="grafici-griglia">
        <GraficoBarre titolo="Attività per stato" barre={d.perStato} />
        <GraficoBarre titolo="Attività aperte per priorità" barre={d.perPriorita} />
        <GraficoBarre titolo="Attività aperte per responsabile (primi 10)" barre={d.perResponsabile} />
        <GraficoBarre
          titolo="Completamenti nelle ultime 8 settimane"
          barre={d.perSettimana}
          nota="Calcolato sulla data dell'ultima modifica delle attività completate."
        />
      </div>

      {(d.ritardo.length > 0 || d.oggi.length > 0) && (
        <div className="grafici-griglia">
          {[{ titolo: "⚠ In ritardo", elenco: d.ritardo }, { titolo: "In scadenza oggi", elenco: d.oggi }].map(
            (s) =>
              s.elenco.length > 0 && (
                <div key={s.titolo} className="pannello">
                  <h3>{s.titolo}</h3>
                  {s.elenco.map((a) => (
                    <div key={a.id} className="agenda-voce" onClick={() => azioni.apri(a)}>
                      <i className="pallino" style={{ background: COLORI_STATO[a.stato] }} />
                      <span className="codice">{a.codice}</span>
                      <span className="titolo">{a.titolo}</span>
                      <span className="spazio" />
                      <span className="dettaglio">fine {fmtDataOra(a.dataOraFine)}</span>
                    </div>
                  ))}
                </div>
              )
          )}
        </div>
      )}
    </div>
  );
}
