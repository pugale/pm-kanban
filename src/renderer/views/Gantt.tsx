// Vista Gantt: barre temporali, linea "Oggi", trascinamento, ridimensionamento e dipendenze

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { Attivita, Dipendenza, TipoDipendenza } from "../../shared/types";
import type { AzioniVista } from "../tipiVista";
import { COLORI_STATO, ETICHETTE_DIPENDENZA, ETICHETTE_STATO, eInRitardo } from "../utils/attivita";
import { MESI_BREVI, MS_GIORNO, MS_ORA, NOMI_MESI, aggiungiGiorni, aggiungiMesi, fmtDataOra, inizioGiorno, inizioSettimana } from "../utils/date";

interface Props {
  attivita: Attivita[];
  dipendenze: Dipendenza[];
  solaLettura: boolean;
  azioni: AzioniVista;
}

const ZOOM = { Giorno: 96, Settimana: 32, Mese: 10, Trimestre: 4, Anno: 1.5 } as const; // pixel per giorno
type LivelloZoom = keyof typeof ZOOM;
const LIVELLI = Object.keys(ZOOM) as LivelloZoom[];

const LARGHEZZA_ETICHETTE = 300;
const ALTEZZA_RIGA = 36;
const ALTEZZA_TESTATA = 48;

type Modo = "sposta" | "inizio" | "fine";
interface Trascinamento {
  id: number;
  modo: Modo;
  x0: number;
  inizio0: number;
  fine0: number;
  delta: number;
  mosso: boolean;
}

/** Ora corrente, aggiornata ogni minuto (per la linea "Oggi") */
function useOra(intervallo = 60_000) {
  const [ora, setOra] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setOra(Date.now()), intervallo);
    return () => clearInterval(t);
  }, [intervallo]);
  return ora;
}

interface Segmento {
  inizio: number;
  fine: number;
  testo: string;
  weekend?: boolean;
}

/** Celle della testata in base allo zoom */
function calcolaTestata(da: Date, a: Date, pxGiorno: number) {
  const sotto: Segmento[] = [];
  const sopra: Segmento[] = [];
  const fineMs = a.getTime();

  if (pxGiorno >= 24) {
    for (let d = new Date(da); d.getTime() < fineMs; d = aggiungiGiorni(d, 1)) {
      const g = d.getDay();
      sotto.push({ inizio: d.getTime(), fine: aggiungiGiorni(d, 1).getTime(), testo: String(d.getDate()), weekend: g === 0 || g === 6 });
    }
  } else if (pxGiorno >= 6) {
    for (let d = inizioSettimana(da); d.getTime() < fineMs; d = aggiungiGiorni(d, 7)) {
      sotto.push({ inizio: d.getTime(), fine: aggiungiGiorni(d, 7).getTime(), testo: `${d.getDate()} ${MESI_BREVI[d.getMonth()]}` });
    }
  } else {
    for (let d = new Date(da.getFullYear(), da.getMonth(), 1); d.getTime() < fineMs; d = aggiungiMesi(d, 1)) {
      sotto.push({ inizio: d.getTime(), fine: aggiungiMesi(d, 1).getTime(), testo: pxGiorno >= 2 ? MESI_BREVI[d.getMonth()] : MESI_BREVI[d.getMonth()][0].toUpperCase() });
    }
  }

  if (pxGiorno >= 6) {
    for (let d = new Date(da.getFullYear(), da.getMonth(), 1); d.getTime() < fineMs; d = aggiungiMesi(d, 1)) {
      sopra.push({ inizio: d.getTime(), fine: aggiungiMesi(d, 1).getTime(), testo: `${NOMI_MESI[d.getMonth()]} ${d.getFullYear()}` });
    }
  } else {
    for (let anno = da.getFullYear(); new Date(anno, 0, 1).getTime() < fineMs; anno++) {
      sopra.push({ inizio: new Date(anno, 0, 1).getTime(), fine: new Date(anno + 1, 0, 1).getTime(), testo: String(anno) });
    }
  }
  return { sotto, sopra };
}

export default function Gantt({ attivita, dipendenze, solaLettura, azioni }: Props) {
  const [zoom, setZoom] = useState<LivelloZoom>("Settimana");
  const [trascina, setTrascina] = useState<Trascinamento | null>(null);
  const [collega, setCollega] = useState(false);
  const [tipoCollegamento, setTipoCollegamento] = useState<TipoDipendenza>("FS");
  const [origine, setOrigine] = useState<number | null>(null);
  const contenitore = useRef<HTMLDivElement>(null);
  // Copia sempre aggiornata del trascinamento, letta al rilascio del mouse
  const rifTrascina = useRef<Trascinamento | null>(null);
  rifTrascina.current = trascina;
  const ora = useOra();

  const pxGiorno = ZOOM[zoom];
  const pxMs = pxGiorno / MS_GIORNO;
  // Spostamenti "a scatti": un'ora con zoom Giorno, altrimenti un giorno
  const passo = pxGiorno >= 48 ? MS_ORA : MS_GIORNO;

  // Intervallo mostrato: tutte le attività + oggi, con un margine
  const { inizioRange, fineRange } = useMemo(() => {
    const margine = Math.max(3, Math.ceil(240 / pxGiorno));
    let min = ora;
    let max = ora;
    for (const a of attivita) {
      min = Math.min(min, new Date(a.dataOraInizio).getTime());
      max = Math.max(max, new Date(a.dataOraFine).getTime());
    }
    if (!attivita.length) max = ora + 30 * MS_GIORNO;
    return {
      inizioRange: inizioGiorno(aggiungiGiorni(new Date(min), -margine)),
      fineRange: inizioGiorno(aggiungiGiorni(new Date(max), margine + 1)),
    };
  }, [attivita, pxGiorno, ora]);

  const x = (ms: number) => (ms - inizioRange.getTime()) * pxMs;
  const larghezza = x(fineRange.getTime());
  const testata = useMemo(() => calcolaTestata(inizioRange, fineRange, pxGiorno), [inizioRange, fineRange, pxGiorno]);
  const indiceRiga = useMemo(() => new Map(attivita.map((a, i) => [a.id, i])), [attivita]);
  const attivitaById = useMemo(() => new Map(attivita.map((a) => [a.id, a])), [attivita]);
  const posizioni = useMemo(
    () =>
      new Map(
        attivita.map((a) => {
          const t = trascina?.id === a.id ? trascina : null;
          const { inizio, fine } = t ? dateAnteprima(t) : { inizio: new Date(a.dataOraInizio).getTime(), fine: new Date(a.dataOraFine).getTime() };
          const sx = x(inizio);
          return [a.id, { sx, dx: sx + Math.max(6, x(fine) - sx), inizio, fine }];
        })
      ),
    [attivita, trascina, x]
  );

  function vaiAOggi(comportamento: ScrollBehavior = "smooth") {
    const c = contenitore.current;
    if (!c) return;
    const visibile = c.clientWidth - LARGHEZZA_ETICHETTE;
    c.scrollTo({ left: Math.max(0, x(Date.now()) - visibile / 2), behavior: comportamento });
  }

  // All'apertura e al cambio di zoom la vista si centra su oggi
  useLayoutEffect(() => vaiAOggi("auto"), [zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  // Esc annulla il collegamento in corso
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setCollega(false);
        setOrigine(null);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // Trascinamento: si segue il mouse su tutta la finestra
  useEffect(() => {
    if (!trascina) return;
    const muovi = (e: MouseEvent) => {
      const dx = e.clientX - trascina.x0;
      const delta = Math.round(dx / pxMs / passo) * passo;
      setTrascina((t) => (t ? { ...t, delta, mosso: t.mosso || Math.abs(dx) > 3 } : t));
    };
    const rilascia = () => {
      const t = rifTrascina.current;
      setTrascina(null);
      if (!t) return;
      const a = attivita.find((v) => v.id === t.id);
      if (!a) return;
      if (!t.mosso) return azioni.apri(a);
      if (t.delta === 0) return;
      const { inizio, fine } = dateAnteprima(t);
      void azioni.spostaDate(a, new Date(inizio).toISOString(), new Date(fine).toISOString());
    };
    window.addEventListener("mousemove", muovi);
    window.addEventListener("mouseup", rilascia, { once: true });
    return () => {
      window.removeEventListener("mousemove", muovi);
      window.removeEventListener("mouseup", rilascia);
    };
  }, [trascina?.id, trascina?.modo, trascina?.x0, pxMs, passo]); // eslint-disable-line react-hooks/exhaustive-deps

  function dateAnteprima(t: Trascinamento) {
    if (t.modo === "sposta") return { inizio: t.inizio0 + t.delta, fine: t.fine0 + t.delta };
    if (t.modo === "inizio") return { inizio: Math.min(t.inizio0 + t.delta, t.fine0), fine: t.fine0 };
    return { inizio: t.inizio0, fine: Math.max(t.fine0 + t.delta, t.inizio0) };
  }

  function premiBarra(e: ReactMouseEvent, a: Attivita, modo: Modo) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();

    if (collega) {
      if (!origine) setOrigine(a.id);
      else if (origine !== a.id) {
        void azioni.creaDipendenza(origine, a.id, tipoCollegamento);
        setOrigine(null);
      }
      return;
    }
    if (solaLettura) return azioni.apri(a);
    setTrascina({
      id: a.id,
      modo,
      x0: e.clientX,
      inizio0: new Date(a.dataOraInizio).getTime(),
      fine0: new Date(a.dataOraFine).getTime(),
      delta: 0,
      mosso: false,
    });
  }

  function percorsoFreccia(d: Dipendenza) {
    const o = attivitaById.get(d.origineId);
    const t = attivitaById.get(d.destinazioneId);
    if (!o || !t) return null;
    const po = posizioni.get(o.id)!;
    const pt = posizioni.get(t.id)!;
    const y1 = indiceRiga.get(o.id)! * ALTEZZA_RIGA + ALTEZZA_RIGA / 2;
    const y2 = indiceRiga.get(t.id)! * ALTEZZA_RIGA + ALTEZZA_RIGA / 2;
    const x1 = d.tipo === "FS" || d.tipo === "FF" ? po.dx : po.sx;
    const x2 = d.tipo === "FS" || d.tipo === "SS" ? pt.sx : pt.dx;
    const uscita = d.tipo === "FS" || d.tipo === "FF" ? 10 : -10;
    const entrata = d.tipo === "FS" || d.tipo === "SS" ? -10 : 10;
    const xa = x1 + uscita;
    const xb = x2 + entrata;
    const yMedio = y1 + (y2 > y1 ? ALTEZZA_RIGA / 2 : -ALTEZZA_RIGA / 2);
    return `M ${x1} ${y1} H ${xa} V ${yMedio} H ${xb} V ${y2} H ${x2}`;
  }

  const altezzaCorpo = Math.max(attivita.length * ALTEZZA_RIGA, 200);
  const xOggi = x(ora);

  return (
    <div className="gantt">
      <div className="barra-strumenti">
        <button className="btn" onClick={() => vaiAOggi()}>📍 Oggi</button>
        <button className="btn" disabled={zoom === LIVELLI[0]} onClick={() => setZoom(LIVELLI[LIVELLI.indexOf(zoom) - 1])} title="Zoom +">🔍＋</button>
        <button className="btn" disabled={zoom === LIVELLI[LIVELLI.length - 1]} onClick={() => setZoom(LIVELLI[LIVELLI.indexOf(zoom) + 1])} title="Zoom −">🔍－</button>
        <select value={zoom} onChange={(e) => setZoom(e.target.value as LivelloZoom)}>
          {LIVELLI.map((l) => <option key={l}>{l}</option>)}
        </select>
        {!solaLettura && (
          <>
            <span className="separatore" />
            <button
              className={`btn ${collega ? "attivo" : ""}`}
              onClick={() => {
                setCollega(!collega);
                setOrigine(null);
              }}
            >
              🔗 Collega attività
            </button>
            {collega && (
              <>
                <select value={tipoCollegamento} onChange={(e) => setTipoCollegamento(e.target.value as TipoDipendenza)}>
                  {(Object.keys(ETICHETTE_DIPENDENZA) as TipoDipendenza[]).map((t) => (
                    <option key={t} value={t}>{ETICHETTE_DIPENDENZA[t]}</option>
                  ))}
                </select>
                <span className="suggerimento">
                  {origine ? "Ora clicca l'attività che dipende da quella scelta" : "Clicca l'attività di partenza (Esc per annullare)"}
                </span>
              </>
            )}
          </>
        )}
        <span className="spazio" />
        <span className="legenda">
          {(Object.keys(COLORI_STATO) as (keyof typeof COLORI_STATO)[]).map((s) => (
            <span key={s}><i style={{ background: COLORI_STATO[s] }} />{ETICHETTE_STATO[s]}</span>
          ))}
        </span>
      </div>

      <div className="gantt-scorrimento" ref={contenitore}>
        <div className="gantt-contenuto" style={{ width: LARGHEZZA_ETICHETTE + larghezza }}>
          {/* Testata (fissa in alto durante lo scorrimento verticale) */}
          <div className="gantt-testata" style={{ height: ALTEZZA_TESTATA }}>
            <div className="gantt-angolo" style={{ width: LARGHEZZA_ETICHETTE }}>Attività</div>
            <div className="gantt-scala" style={{ width: larghezza }}>
              {testata.sopra.map((s) => (
                <div key={`a${s.inizio}`} className="cella-sopra" style={{ left: x(s.inizio), width: x(s.fine) - x(s.inizio) }}>{s.testo}</div>
              ))}
              {testata.sotto.map((s) => (
                <div key={`b${s.inizio}`} className={`cella-sotto ${s.weekend ? "weekend" : ""}`} style={{ left: x(s.inizio), width: x(s.fine) - x(s.inizio) }}>{s.testo}</div>
              ))}
              <div className="etichetta-oggi" style={{ left: xOggi }}>Oggi</div>
            </div>
          </div>

          <div className="gantt-corpo" style={{ height: altezzaCorpo }}>
            {/* Etichette (fisse a sinistra durante lo scorrimento orizzontale) */}
            <div className="gantt-etichette" style={{ width: LARGHEZZA_ETICHETTE }}>
              {attivita.map((a) => (
                <div key={a.id} className="gantt-etichetta" style={{ height: ALTEZZA_RIGA }} onClick={() => azioni.apri(a)} title={a.titolo}>
                  <i style={{ background: COLORI_STATO[a.stato] }} />
                  <span className="codice">{a.codice}</span>
                  <span className="titolo">{a.titolo}</span>
                </div>
              ))}
            </div>

            <div className="gantt-area" style={{ left: LARGHEZZA_ETICHETTE, width: larghezza }}>
              {/* Sfondo: fine settimana e righe */}
              {pxGiorno >= 24 &&
                testata.sotto.filter((s) => s.weekend).map((s) => (
                  <div key={s.inizio} className="sfondo-weekend" style={{ left: x(s.inizio), width: x(s.fine) - x(s.inizio) }} />
                ))}
              {attivita.map((a, i) => (
                <div key={a.id} className="riga-gantt" style={{ top: i * ALTEZZA_RIGA, height: ALTEZZA_RIGA }} />
              ))}

              {/* Dipendenze */}
              <svg className="gantt-frecce" width={larghezza} height={altezzaCorpo}>
                <defs>
                  <marker id="punta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#546e7a" />
                  </marker>
                </defs>
                {dipendenze.map((d) => {
                  const p = percorsoFreccia(d);
                  if (!p) return null;
                  const o = attivitaById.get(d.origineId)!;
                  const t = attivitaById.get(d.destinazioneId)!;
                  return (
                    <path
                      key={d.id}
                      d={p}
                      className={`freccia ${solaLettura ? "" : "eliminabile"}`}
                      markerEnd="url(#punta)"
                      onClick={() => {
                        if (!solaLettura && confirm(`Eliminare il collegamento ${o.codice} → ${t.codice} (${ETICHETTE_DIPENDENZA[d.tipo]})?`))
                          void azioni.eliminaDipendenza(d.id);
                      }}
                    >
                      <title>{`${o.codice} → ${t.codice} · ${ETICHETTE_DIPENDENZA[d.tipo]}`}</title>
                    </path>
                  );
                })}
              </svg>

              {/* Barre */}
              {attivita.map((a, i) => {
                const pos = posizioni.get(a.id)!;
                const larghezzaBarra = pos.dx - pos.sx;
                const ritardo = eInRitardo(a, ora);
                const inTrascinamento = trascina?.id === a.id;
                return (
                  <div
                    key={a.id}
                    className={`barra ${ritardo ? "in-ritardo" : ""} ${origine === a.id ? "origine" : ""} ${inTrascinamento ? "trascinata" : ""} ${solaLettura ? "" : "mobile"}`}
                    style={{ left: pos.sx, width: larghezzaBarra, top: i * ALTEZZA_RIGA + 6, height: ALTEZZA_RIGA - 12, background: COLORI_STATO[a.stato] }}
                    onMouseDown={(e) => premiBarra(e, a, "sposta")}
                    title={`${a.codice} – ${a.titolo}\n${fmtDataOra(new Date(pos.inizio))} → ${fmtDataOra(new Date(pos.fine))}\nAvanzamento ${a.percentualeCompletamento}%${ritardo ? "\n⚠ In ritardo" : ""}`}
                  >
                    <div className="avanzamento" style={{ width: `${a.percentualeCompletamento}%` }} />
                    {larghezzaBarra > 70 && <span className="testo-barra">{a.percentualeCompletamento}% · {a.codice}</span>}
                    {!solaLettura && !collega && (
                      <>
                        <div className="maniglia sinistra" onMouseDown={(e) => premiBarra(e, a, "inizio")} />
                        <div className="maniglia destra" onMouseDown={(e) => premiBarra(e, a, "fine")} />
                      </>
                    )}
                    {larghezzaBarra <= 70 && <span className="testo-fuori">{a.codice}</span>}
                  </div>
                );
              })}

              {/* Linea "Oggi": attraversa tutto il diagramma e si aggiorna ogni minuto */}
              <div className="linea-oggi" style={{ left: xOggi, height: altezzaCorpo }} />

              {!attivita.length && <div className="vuoto-gantt">Nessuna attività da mostrare.</div>}
            </div>
          </div>
        </div>
      </div>

      {trascina?.mosso && (
        <div className="anteprima-date">
          {(() => {
            const { inizio, fine } = dateAnteprima(trascina);
            return `${fmtDataOra(new Date(inizio))} → ${fmtDataOra(new Date(fine))}`;
          })()}
        </div>
      )}
    </div>
  );
}
