import { useMemo, useState } from "react";
import type { Attivita } from "../../shared/types";
import type { AzioniVista } from "../tipiVista";
import { ETICHETTE_PRIORITA, ETICHETTE_STATO } from "../utils/attivita";
import { fmtDataOra } from "../utils/date";

type Colonna = "codice" | "titolo" | "stato" | "priorita" | "responsabile" | "inizio" | "fine" | "avanzamento";
type Direzione = "asc" | "desc";

interface Props {
  attivita: Attivita[];
  azioni: AzioniVista;
}

const confrontaTesto = new Intl.Collator("it", { numeric: true, sensitivity: "base" });

const COLONNE: { chiave: Colonna; etichetta: string; valore: (attivita: Attivita) => string | number }[] = [
  { chiave: "codice", etichetta: "Codice", valore: (a) => a.codice },
  { chiave: "titolo", etichetta: "Titolo", valore: (a) => a.titolo },
  { chiave: "stato", etichetta: "Stato", valore: (a) => ETICHETTE_STATO[a.stato] },
  { chiave: "priorita", etichetta: "Priorità", valore: (a) => ETICHETTE_PRIORITA[a.priorita] },
  { chiave: "responsabile", etichetta: "Responsabile", valore: (a) => a.responsabile },
  { chiave: "inizio", etichetta: "Inizio", valore: (a) => Date.parse(a.dataOraInizio) },
  { chiave: "fine", etichetta: "Fine", valore: (a) => Date.parse(a.dataOraFine) },
  { chiave: "avanzamento", etichetta: "Avanzamento", valore: (a) => a.percentualeCompletamento },
];

export default function Tabella({ attivita, azioni }: Props) {
  const [ordinamento, setOrdinamento] = useState<{ chiave: Colonna; direzione: Direzione }>({
    chiave: "codice",
    direzione: "asc",
  });
  const [esportazione, setEsportazione] = useState<{ tipo: "errore" | "info"; testo: string } | null>(null);

  const attivitaOrdinate = useMemo(() => {
    const colonna = COLONNE.find((c) => c.chiave === ordinamento.chiave)!;
    return attivita
      .map((elemento, indice) => ({ elemento, indice, valore: colonna.valore(elemento) }))
      .sort((a, b) => {
        const confronto =
          typeof a.valore === "number" && typeof b.valore === "number"
            ? a.valore - b.valore
            : confrontaTesto.compare(String(a.valore), String(b.valore));
        return (ordinamento.direzione === "asc" ? confronto : -confronto) || a.indice - b.indice;
      })
      .map(({ elemento }) => elemento);
  }, [attivita, ordinamento]);

  function ordina(chiave: Colonna) {
    setOrdinamento((corrente) => ({
      chiave,
      direzione: corrente.chiave === chiave && corrente.direzione === "asc" ? "desc" : "asc",
    }));
  }

  async function esportaCsv() {
    const rigaCsv = (valori: (string | number)[]) =>
      valori
        .map((valore) => {
          const testo = String(valore);
          const sicuro = /^[\s]*[=+\-@]/.test(testo) ? `'${testo}` : testo;
          return `"${sicuro.replace(/"/g, '""')}"`;
        })
        .join(";");
    const righe = [
      rigaCsv(COLONNE.map((colonna) => colonna.etichetta)),
      ...attivitaOrdinate.map((a) =>
        rigaCsv([
          a.codice,
          a.titolo,
          ETICHETTE_STATO[a.stato],
          ETICHETTE_PRIORITA[a.priorita],
          a.responsabile,
          fmtDataOra(a.dataOraInizio),
          fmtDataOra(a.dataOraFine),
          `${a.percentualeCompletamento}%`,
        ])
      ),
    ];
    const risultato = await window.pm.esportaCsv(`\uFEFF${righe.join("\r\n")}\r\n`);
    if (!risultato.ok) {
      setEsportazione({ tipo: "errore", testo: risultato.messaggio });
    } else if (risultato.dati) {
      setEsportazione({ tipo: "info", testo: `Esportazione salvata come "${risultato.dati}".` });
    }
  }

  return (
    <div className="tabella">
      <div className="barra-strumenti">
        <button className="btn" onClick={() => void esportaCsv()}>Esporta in CSV</button>
        {esportazione && <span className={esportazione.tipo === "errore" ? "testo-ritardo" : "suggerimento"} role="status">{esportazione.testo}</span>}
      </div>
      <div className="tabella-contenitore">
        <table className="tabella-attivita">
          <thead>
            <tr>
              {COLONNE.map((colonna) => {
                const attiva = ordinamento.chiave === colonna.chiave;
                return (
                  <th key={colonna.chiave} aria-sort={attiva ? (ordinamento.direzione === "asc" ? "ascending" : "descending") : "none"}>
                    <button className="intestazione-ordinabile" onClick={() => ordina(colonna.chiave)}>
                      {colonna.etichetta}
                      <span aria-hidden="true">{attiva ? (ordinamento.direzione === "asc" ? " ▲" : " ▼") : " ↕"}</span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {attivitaOrdinate.map((a) => (
              <tr key={a.id}>
                <td className="codice">{a.codice}</td>
                <td><button className="link" onClick={() => azioni.apri(a)}>{a.titolo}</button></td>
                <td>{ETICHETTE_STATO[a.stato]}</td>
                <td>{ETICHETTE_PRIORITA[a.priorita]}</td>
                <td>{a.responsabile}</td>
                <td>{fmtDataOra(a.dataOraInizio)}</td>
                <td>{fmtDataOra(a.dataOraFine)}</td>
                <td>{a.percentualeCompletamento}%</td>
              </tr>
            ))}
            {!attivitaOrdinate.length && (
              <tr>
                <td className="tabella-vuota" colSpan={COLONNE.length}>Nessuna attività trovata.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
