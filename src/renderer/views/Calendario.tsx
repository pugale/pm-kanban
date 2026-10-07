// Vista Calendario: mese, settimana o giorno. Per ogni giorno mostra le attività che INIZIANO quel giorno.
// Sabati, domeniche e festività hanno lo sfondo rosso chiaro.

import { useCallback, useMemo, useState } from "react";
import { STATI, type Attivita, type DatiAttivita, type StatoAttivita } from "../../shared/types";
import type { AzioniVista } from "../tipiVista";
import { COLORI_STATO, ETICHETTE_STATO, eInRitardo } from "../utils/attivita";
import {
  GIORNI_BREVI,
  MS_ORA,
  NOMI_MESI,
  aggiungiGiorni,
  aggiungiMesi,
  alleOre,
  chiaveGiorno,
  eGiornoNonLavorativo,
  fmtGiornoEsteso,
  fmtOra,
  inizioGiorno,
  inizioSettimana,
  nomeFestivita,
  stessoGiorno,
} from "../utils/date";

interface Props {
  attivita: Attivita[];
  solaLettura: boolean;
  azioni: AzioniVista;
}

type Modalita = "mese" | "settimana" | "giorno";
const MAX_PER_GIORNO = 3;

/** Classi CSS comuni a ogni giorno: oggi, festivo/weekend */
const classiGiorno = (giorno: Date, oggi: Date) =>
  [stessoGiorno(giorno, oggi) ? "oggi" : "", eGiornoNonLavorativo(giorno) ? "festivo" : ""].filter(Boolean).join(" ");

export default function Calendario({ attivita, solaLettura, azioni }: Props) {
  const [modalita, setModalita] = useState<Modalita>("mese");
  const [rif, setRif] = useState(() => inizioGiorno(new Date()));
  // Di base solo le attività da iniziare; il filtro permette di aggiungere gli altri stati
  const [stati, setStati] = useState<Set<StatoAttivita>>(() => new Set(["DA_INIZIARE"]));
  const oggi = new Date();

  const perGiorno = useMemo(() => {
    const m = new Map<string, Attivita[]>();
    for (const a of attivita) {
      if (!stati.has(a.stato)) continue;
      const k = chiaveGiorno(new Date(a.dataOraInizio));
      const elenco = m.get(k) ?? [];
      elenco.push(a);
      m.set(k, elenco);
    }
    for (const elenco of m.values()) elenco.sort((a, b) => a.dataOraInizio.localeCompare(b.dataOraInizio));
    return m;
  }, [attivita, stati]);

  const delGiorno = useCallback((d: Date) => perGiorno.get(chiaveGiorno(d)) ?? [], [perGiorno]);

  const giorniMese = useMemo(
    () => Array.from({ length: 42 }, (_, i) => aggiungiGiorni(inizioSettimana(new Date(rif.getFullYear(), rif.getMonth(), 1)), i)),
    [rif]
  );

  const giorniSettimana = useMemo(() => Array.from({ length: 7 }, (_, i) => aggiungiGiorni(inizioSettimana(rif), i)), [rif]);

  function alternaStato(s: StatoAttivita) {
    const n = new Set(stati);
    if (n.has(s)) n.delete(s);
    else n.add(s);
    setStati(n);
  }

  function nuovaNelGiorno(giorno: Date) {
    if (solaLettura) return;
    const inizio = alleOre(giorno, 9);
    const preset: Partial<DatiAttivita> = {
      stato: "DA_INIZIARE",
      dataOraInizio: inizio.toISOString(),
      dataOraFine: new Date(inizio.getTime() + MS_ORA).toISOString(),
    };
    azioni.nuova(preset);
  }

  function sposta(direzione: -1 | 1) {
    if (modalita === "mese") setRif(aggiungiMesi(rif, direzione));
    else if (modalita === "settimana") setRif(aggiungiGiorni(rif, 7 * direzione));
    else setRif(aggiungiGiorni(rif, direzione));
  }

  const titolo =
    modalita === "mese"
      ? `${NOMI_MESI[rif.getMonth()]} ${rif.getFullYear()}`
      : modalita === "settimana"
        ? (() => {
            const l = inizioSettimana(rif);
            const d = aggiungiGiorni(l, 6);
            return `Settimana ${l.getDate()} ${NOMI_MESI[l.getMonth()].slice(0, 3).toLowerCase()} – ${d.getDate()} ${NOMI_MESI[d.getMonth()].slice(0, 3).toLowerCase()} ${d.getFullYear()}`;
          })()
        : fmtGiornoEsteso(rif);

  const festaRif = nomeFestivita(rif);

  const voce = (a: Attivita, completa = false) => (
    <button
      key={a.id}
      className={`voce-calendario ${eInRitardo(a) ? "in-ritardo" : ""}`}
      style={{ borderLeftColor: COLORI_STATO[a.stato] }}
      onClick={(e) => {
        e.stopPropagation();
        azioni.apri(a);
      }}
      title={`${a.codice} – ${a.titolo}\n${ETICHETTE_STATO[a.stato]}`}
    >
      <b>{fmtOra(a.dataOraInizio)}</b> {a.codice}
      <span className="titolo"> {a.titolo}</span>
      {completa && a.descrizione && <span className="descrizione">{a.descrizione}</span>}
    </button>
  );

  return (
    <div className="calendario">
      <div className="barra-strumenti">
        <button className="btn" onClick={() => sposta(-1)} title="Precedente">‹</button>
        <button className="btn" onClick={() => setRif(inizioGiorno(new Date()))}>Oggi</button>
        <button className="btn" onClick={() => sposta(1)} title="Successivo">›</button>
        <h3 className="titolo-calendario">{titolo}</h3>
        {modalita === "mese" && (
          <>
            <select value={rif.getMonth()} onChange={(e) => setRif(new Date(rif.getFullYear(), Number(e.target.value), 1))}>
              {NOMI_MESI.map((m, i) => <option key={m} value={i}>{m}</option>)}
            </select>
            <input
              type="number"
              className="anno"
              value={rif.getFullYear()}
              onChange={(e) => {
                const anno = Number(e.target.value);
                if (anno > 1900 && anno < 3000) setRif(new Date(anno, rif.getMonth(), 1));
              }}
            />
          </>
        )}
        <span className="spazio" />
        <span className="legenda"><span><i className="quadratino-festivo" />Sabato, domenica e festivi</span></span>
        <div className="gruppo-pulsanti">
          {(["mese", "settimana", "giorno"] as Modalita[]).map((m) => (
            <button key={m} className={`btn ${modalita === m ? "attivo" : ""}`} onClick={() => setModalita(m)}>
              {m[0].toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="filtro-stati">
        Mostra:
        {STATI.map((s) => (
          <label key={s} className="filtro-stato" style={{ borderColor: COLORI_STATO[s] }}>
            <input type="checkbox" checked={stati.has(s)} onChange={() => alternaStato(s)} />
            {ETICHETTE_STATO[s]}
          </label>
        ))}
        <button className="btn piccolo" onClick={() => setStati(new Set(["DA_INIZIARE"]))}>Solo da iniziare</button>
        <button className="btn piccolo" onClick={() => setStati(new Set(STATI))}>Tutti</button>
      </div>

      {modalita === "mese" && (
        <div className="griglia-mese">
          {GIORNI_BREVI.map((g, i) => <div key={g} className={`intestazione-giorno ${i >= 5 ? "festivo" : ""}`}>{g}</div>)}
          {giorniMese.map((giorno) => {
            const elenco = delGiorno(giorno);
            const altroMese = giorno.getMonth() !== rif.getMonth();
            const festa = nomeFestivita(giorno);
            return (
              <div
                key={chiaveGiorno(giorno)}
                className={`cella-giorno ${altroMese ? "altro-mese" : ""} ${classiGiorno(giorno, oggi)} ${solaLettura ? "" : "cliccabile"}`}
                onClick={() => nuovaNelGiorno(giorno)}
                title={[festa, solaLettura ? "" : "Clic per creare un'attività in questo giorno"].filter(Boolean).join("\n")}
              >
                <div className="numero-giorno">
                  {giorno.getDate()}
                  {festa && <span className="nome-festa">{festa}</span>}
                </div>
                {elenco.slice(0, MAX_PER_GIORNO).map((a) => voce(a))}
                {elenco.length > MAX_PER_GIORNO && (
                  <button
                    className="altre"
                    onClick={(e) => {
                      e.stopPropagation();
                      setRif(giorno);
                      setModalita("giorno");
                    }}
                  >
                    + {elenco.length - MAX_PER_GIORNO} {elenco.length - MAX_PER_GIORNO === 1 ? "altra attività" : "altre attività"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {modalita === "settimana" && (
        <div className="griglia-settimana">
          {giorniSettimana.map((giorno, i) => {
            const festa = nomeFestivita(giorno);
            return (
              <div key={chiaveGiorno(giorno)} className={`colonna-giorno ${classiGiorno(giorno, oggi)}`}>
                <div
                  className="intestazione-giorno cliccabile"
                  onClick={() => {
                    setRif(giorno);
                    setModalita("giorno");
                  }}
                  title={festa}
                >
                  {GIORNI_BREVI[i]} {giorno.getDate()}
                  {festa && <div className="nome-festa">{festa}</div>}
                </div>
                <div className="corpo-giorno" onClick={() => nuovaNelGiorno(giorno)}>
                  {delGiorno(giorno).map((a) => voce(a))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalita === "giorno" && (() => {
        const elencoGiorno = delGiorno(rif);
        return (
          <div className={`vista-giorno ${eGiornoNonLavorativo(rif) ? "festivo" : ""}`}>
            {festaRif && <div className="banda-festa">🎉 {festaRif}</div>}
            {elencoGiorno.map((a) => voce(a, true))}
            {!elencoGiorno.length && <div className="vuoto">Nessuna attività che inizia in questo giorno con i filtri scelti.</div>}
            {!solaLettura && (
              <button className="btn" onClick={() => nuovaNelGiorno(rif)}>+ Nuova attività in questo giorno</button>
            )}
          </div>
        );
      })()}
    </div>
  );
}
