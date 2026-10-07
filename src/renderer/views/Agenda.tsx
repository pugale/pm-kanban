// Vista Agenda: elenco operativo per giorno (Oggi, Domani, ...)

import { useMemo, useState } from "react";
import type { Attivita } from "../../shared/types";
import type { AzioniVista } from "../tipiVista";
import { COLORI_STATO, ETICHETTE_STATO, ICONE_INVIA_NOTIFICA, eChiusa, eInRitardo, eMia } from "../utils/attivita";
import { aggiungiGiorni, chiaveGiorno, fmtDataOra, fmtGiornoEsteso, fmtOra, inizioGiorno } from "../utils/date";

interface Props {
  attivita: Attivita[];
  emailUtente?: string;
  azioni: AzioniVista;
}

type Filtro = "tutte" | "da_iniziare" | "in_corso" | "mie";
const FILTRI: { valore: Filtro; testo: string }[] = [
  { valore: "tutte", testo: "Tutto" },
  { valore: "da_iniziare", testo: "Solo da iniziare" },
  { valore: "in_corso", testo: "Solo in corso" },
  { valore: "mie", testo: "Solo mie attività" },
];

export default function Agenda({ attivita, emailUtente, azioni }: Props) {
  const [filtro, setFiltro] = useState<Filtro>("tutte");
  const [mostraChiuse, setMostraChiuse] = useState(false);

  const sezioni = useMemo(() => {
    const ora = Date.now();
    const oggi = inizioGiorno(new Date());
    const domani = aggiungiGiorni(oggi, 1);
    const oggiKey = chiaveGiorno(oggi);
    const domaniKey = chiaveGiorno(domani);

    const filtrate: Attivita[] = [];
    const ritardo: Attivita[] = [];
    const giaIniziate: Attivita[] = [];
    const perGiorno = new Map<string, { giorno: Date; elenco: Attivita[] }>();

    for (const a of attivita) {
      if (!mostraChiuse && eChiusa(a)) continue;
      if (filtro === "da_iniziare" && a.stato !== "DA_INIZIARE") continue;
      if (filtro === "in_corso" && a.stato !== "IN_CORSO") continue;
      if (filtro === "mie" && !eMia(a, emailUtente)) continue;

      filtrate.push(a);

      if (eInRitardo(a, ora)) {
        ritardo.push(a);
        continue;
      }

      const inizio = new Date(a.dataOraInizio);
      if (inizio < oggi) {
        giaIniziate.push(a);
        continue;
      }

      const g = inizioGiorno(inizio);
      const k = chiaveGiorno(g);
      const entry = perGiorno.get(k) ?? { giorno: g, elenco: [] };
      entry.elenco.push(a);
      perGiorno.set(k, entry);
    }

    const giorni = [...perGiorno.values()]
      .sort((a, b) => a.giorno.getTime() - b.giorno.getTime())
      .map(({ giorno, elenco }) => {
        const key = chiaveGiorno(giorno);
        return {
          titolo: key === oggiKey ? "Oggi" : key === domaniKey ? "Domani" : fmtGiornoEsteso(giorno),
          sottotitolo: key === oggiKey || key === domaniKey ? fmtGiornoEsteso(giorno) : "",
          elenco: elenco.sort((a, b) => a.dataOraInizio.localeCompare(b.dataOraInizio)),
          conData: false,
        };
      });

    return [
      ...(ritardo.length ? [{ titolo: "⚠ In ritardo", sottotitolo: "Data di fine superata", elenco: ritardo.sort((a, b) => a.dataOraFine.localeCompare(b.dataOraFine)), conData: true }] : []),
      ...(giaIniziate.length ? [{ titolo: "Iniziate nei giorni precedenti", sottotitolo: "", elenco: giaIniziate.sort((a, b) => a.dataOraInizio.localeCompare(b.dataOraInizio)), conData: true }] : []),
      ...giorni,
    ];
  }, [attivita, filtro, mostraChiuse, emailUtente]);

  return (
    <div className="agenda">
      <div className="barra-strumenti">
        <div className="gruppo-pulsanti">
          {FILTRI.map((f) => (
            <button key={f.valore} className={`btn ${filtro === f.valore ? "attivo" : ""}`} onClick={() => setFiltro(f.valore)}>
              {f.testo}
            </button>
          ))}
        </div>
        <label className="casella">
          <input type="checkbox" checked={mostraChiuse} onChange={(e) => setMostraChiuse(e.target.checked)} />
          Mostra completate e annullate
        </label>
        {filtro === "mie" && !emailUtente && <span className="suggerimento">Inserisci la tua email in Impostazioni.</span>}
      </div>

      <div className="agenda-elenco">
        {sezioni.map((s) => (
          <section key={s.titolo} className="agenda-sezione">
            <h3>
              {s.titolo} {s.sottotitolo && <small>{s.sottotitolo}</small>}
            </h3>
            {s.elenco.map((a) => (
              <div key={a.id} className={`agenda-voce ${eInRitardo(a) ? "in-ritardo" : ""}`} onClick={() => azioni.apri(a)}>
                <span className="ora">{s.conData ? fmtDataOra(a.dataOraInizio) : fmtOra(a.dataOraInizio)}</span>
                <i className="pallino" style={{ background: COLORI_STATO[a.stato] }} title={ETICHETTE_STATO[a.stato]} />
                <span className="codice">{a.codice}</span>
                <span className="titolo">{a.titolo}</span>
                <span className="spazio" />
                <span className="dettaglio">👤 {a.responsabile}</span>
                <span className="dettaglio">fine {fmtDataOra(a.dataOraFine)}</span>
                <span title="Notifiche">{ICONE_INVIA_NOTIFICA[a.invia_notifica]}</span>
              </div>
            ))}
          </section>
        ))}
        {!sezioni.length && <div className="vuoto">Nessuna attività in programma con il filtro scelto.</div>}
      </div>
    </div>
  );
}
