// Finestra principale: scelta progetto, barra delle viste, ricerca e gestione degli errori

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Attivita, DatiAttivita, DatiProgetto, ElencoProgetti, Impostazioni as TipoImpostazioni, Risultato } from "../shared/types";
import ModuloAttivita from "./components/ModuloAttivita";
import ModuloProgetto from "./components/ModuloProgetto";
import type { AzioniVista } from "./tipiVista";
import { corrispondeRicerca } from "./utils/attivita";
import Agenda from "./views/Agenda";
import Calendario from "./views/Calendario";
import Dashboard from "./views/Dashboard";
import Gantt from "./views/Gantt";
import Impostazioni from "./views/Impostazioni";
import Kanban from "./views/Kanban";

type Vista = "kanban" | "gantt" | "calendario" | "agenda" | "dashboard" | "impostazioni";
const VISTE: { id: Vista; testo: string }[] = [
  { id: "kanban", testo: "📋 Kanban" },
  { id: "gantt", testo: "📊 Gantt" },
  { id: "calendario", testo: "📅 Calendario" },
  { id: "agenda", testo: "📝 Agenda" },
  { id: "dashboard", testo: "📈 Dashboard" },
];

const CHIAVE_PROGETTO = "pmkanban.progettoSelezionato";
const CHIAVE_VISTA = "pmkanban.vista";

type StatoModulo = { attivita?: Attivita; preimpostato?: Partial<DatiAttivita> } | null;
type Messaggio = { tipo: "errore" | "info"; testo: string } | null;

export default function App() {
  const [impostazioni, setImpostazioni] = useState<TipoImpostazioni | null>(null);
  const [elenco, setElenco] = useState<ElencoProgetti | null>(null);
  const [progettoId, setProgettoId] = useState<string | null>(() => localStorage.getItem(CHIAVE_PROGETTO));
  const [dati, setDati] = useState<DatiProgetto | null>(null);
  const [vista, setVista] = useState<Vista>(() => (localStorage.getItem(CHIAVE_VISTA) as Vista) || "kanban");
  const [ricerca, setRicerca] = useState("");
  const [modulo, setModulo] = useState<StatoModulo>(null);
  const [nuovoProgetto, setNuovoProgetto] = useState(false);
  const [messaggio, setMessaggio] = useState<Messaggio>(null);

  const configurata = !!impostazioni?.cartellaDati && !!impostazioni?.emailUtente;
  const progettiDisponibili = useMemo(() => elenco?.progetti ?? [], [elenco]);

  // ---------- Caricamento ----------

  const caricaElenco = useCallback(async () => {
    const r = await window.pm.progetti();
    if (!r.ok) {
      setElenco(null);
      return setMessaggio({ tipo: "errore", testo: r.messaggio });
    }
    setElenco(r.dati);
    setProgettoId((attuale) => (attuale && r.dati.progetti.some((p) => p.id === attuale) ? attuale : r.dati.progetti[0]?.id ?? null));
  }, []);

  const caricaProgetto = useCallback(async (id: string | null) => {
    if (!id) return setDati(null);
    const r = await window.pm.attivita(id);
    if (r.ok) setDati(r.dati);
    else {
      setDati(null);
      setMessaggio({ tipo: "errore", testo: r.messaggio });
    }
  }, []);

  useEffect(() => {
    void window.pm.impostazioni().then((r) => {
      const i: TipoImpostazioni = r.ok ? r.dati : {};
      setImpostazioni(i);
      if (!i.cartellaDati || !i.emailUtente) setVista("impostazioni");
    });
  }, []);

  useEffect(() => {
    if (impostazioni?.cartellaDati) void caricaElenco();
  }, [impostazioni?.cartellaDati, impostazioni?.emailUtente, caricaElenco]);

  useEffect(() => {
    if (progettoId) localStorage.setItem(CHIAVE_PROGETTO, progettoId);
    void caricaProgetto(progettoId);
  }, [progettoId, caricaProgetto]);

  useEffect(() => {
    if (vista !== "impostazioni") localStorage.setItem(CHIAVE_VISTA, vista);
  }, [vista]);

  // Modifiche arrivate da OneDrive (altri PC) o notifiche segnate come inviate
  useEffect(
    () =>
      window.pm.onProgettiCambiati(() => {
        void caricaElenco();
        void caricaProgetto(progettoId);
      }),
    [progettoId, caricaElenco, caricaProgetto]
  );

  // I messaggi informativi spariscono da soli
  useEffect(() => {
    if (messaggio?.tipo !== "info") return;
    const t = setTimeout(() => setMessaggio(null), 4000);
    return () => clearTimeout(t);
  }, [messaggio]);

  // ---------- Azioni delle viste ----------

  const sostituisci = useCallback((a: Attivita) => {
    setDati((d) => {
      if (!d) return d;
      const attivita = [...d.attivita];
      const indice = attivita.findIndex((x) => x.id === a.id);
      if (indice >= 0) attivita[indice] = a;
      else attivita.push(a);
      attivita.sort((x, y) => x.dataOraInizio.localeCompare(y.dataOraInizio));
      return { ...d, attivita };
    });
  }, []);

  /** Esegue una chiamata: in caso di conflitto avvisa e ricarica i dati aggiornati */
  const esegui = useCallback(
    async <T,>(chiamata: Promise<Risultato<T>>): Promise<T | undefined> => {
      const r = await chiamata;
      if (r.ok) return r.dati;
      setMessaggio({ tipo: "errore", testo: r.messaggio });
      if (r.codice === "CONFLITTO" || r.codice === "NON_TROVATO" || r.codice === "SOLA_LETTURA") await caricaProgetto(progettoId);
      return undefined;
    },
    [progettoId, caricaProgetto]
  );

  const azioni: AzioniVista = useMemo(
    () => ({
      apri: (a) => setModulo({ attivita: a }),
      nuova: (preimpostato) => setModulo({ preimpostato }),
      cambiaStato: async (a, stato) => {
        if (!progettoId) return;
        sostituisci({ ...a, stato }); // aggiornamento immediato a video
        const r = await esegui(window.pm.cambiaStato(progettoId, a.id, stato, a.versione));
        if (r) sostituisci(r);
        else await caricaProgetto(progettoId);
      },
      spostaDate: async (a, inizio, fine) => {
        if (!progettoId) return;
        sostituisci({ ...a, dataOraInizio: inizio, dataOraFine: fine });
        const r = await esegui(window.pm.spostaDate(progettoId, a.id, inizio, fine, a.versione));
        if (r) sostituisci(r);
        else await caricaProgetto(progettoId);
      },
      alternaNotifica: async (a) => {
        if (!progettoId) return;
        const r = await esegui(window.pm.impostaInviaNotifica(progettoId, a.id, a.invia_notifica === "Si" ? "No" : "Si", a.versione));
        if (r) sostituisci(r);
      },
      creaDipendenza: async (o, d, tipo) => {
        if (!progettoId) return;
        const r = await esegui(window.pm.creaDipendenza(progettoId, o, d, tipo));
        if (r) setDati((x) => (x ? { ...x, dipendenze: [...x.dipendenze, r] } : x));
      },
      eliminaDipendenza: async (id) => {
        if (!progettoId) return;
        const r = await window.pm.eliminaDipendenza(progettoId, id);
        if (r.ok) setDati((x) => (x ? { ...x, dipendenze: x.dipendenze.filter((d) => d.id !== id) } : x));
        else setMessaggio({ tipo: "errore", testo: r.messaggio });
      },
    }),
    [progettoId, esegui, sostituisci, caricaProgetto]
  );

  // Ricerca globale: vale per tutte le viste
  const attivitaFiltrate = useMemo(() => (dati?.attivita ?? []).filter((a) => corrispondeRicerca(a, ricerca)), [dati, ricerca]);
  const solaLettura = dati?.solaLettura ?? true;

  // Scorciatoia: Ctrl+N nuova attività
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n" && dati && !dati.solaLettura && !modulo) {
        e.preventDefault();
        setModulo({});
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [dati, modulo]);

  // ---------- Interfaccia ----------

  const contenuto = useMemo(() => {
    if (!impostazioni) return <div className="caricamento">Caricamento…</div>;

    if (vista === "impostazioni") {
      return (
        <Impostazioni
          impostazioni={impostazioni}
          onCambiate={(i) => {
            setImpostazioni(i);
            if (i.cartellaDati && i.emailUtente && vista === "impostazioni" && !configurata) setVista("kanban");
          }}
          onCartellaCambiata={() => {
            void caricaElenco();
            void caricaProgetto(progettoId);
          }}
        />
      );
    }

    if (!progettiDisponibili.length) {
      return (
        <div className="vuoto grande">
          <p>Nella cartella non ci sono ancora progetti.</p>
          <button className="btn primario" onClick={() => setNuovoProgetto(true)}>+ Crea il primo progetto</button>
        </div>
      );
    }

    if (!dati) {
      return <div className="caricamento">Caricamento del progetto…</div>;
    }

    if (vista === "kanban") return <Kanban attivita={attivitaFiltrate} solaLettura={solaLettura} azioni={azioni} />;
    if (vista === "gantt") return <Gantt attivita={attivitaFiltrate} dipendenze={dati.dipendenze} solaLettura={solaLettura} azioni={azioni} />;
    if (vista === "calendario") return <Calendario attivita={attivitaFiltrate} solaLettura={solaLettura} azioni={azioni} />;
    if (vista === "agenda") return <Agenda attivita={attivitaFiltrate} emailUtente={impostazioni?.emailUtente} azioni={azioni} />;
    return <Dashboard attivita={attivitaFiltrate} azioni={azioni} />;
  }, [vista, progettiDisponibili.length, dati, attivitaFiltrate, solaLettura, azioni, impostazioni, configurata, caricaElenco, caricaProgetto, progettoId]);

  if (!impostazioni) return <div className="caricamento">Caricamento…</div>;

  return (
    <div className="app">
      <header className="testata">
        {configurata && (
          <>
            <label className="etichetta-progetto" htmlFor="scelta-progetto">Progetto:</label>
            <select
              id="scelta-progetto"
              className="scelta-progetto"
              value={progettoId ?? ""}
              onChange={(e) => setProgettoId(e.target.value || null)}
              disabled={!progettiDisponibili.length}
            >
              {!progettiDisponibili.length && <option value="">Nessun progetto</option>}
              {progettiDisponibili.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}{p.cliente ? ` – ${p.cliente}` : ""}{p.solaLettura ? " (sola lettura)" : ""}
                </option>
              ))}
            </select>
            <button className="btn" onClick={() => setNuovoProgetto(true)} title="Nuovo progetto">+ Progetto</button>

            <nav className="schede">
              {VISTE.map((v) => (
                <button key={v.id} className={`scheda ${vista === v.id ? "attiva" : ""}`} onClick={() => setVista(v.id)} disabled={!dati}>
                  {v.testo}
                </button>
              ))}
            </nav>

            <span className="spazio" />
            <input className="ricerca" type="search" placeholder="🔍 Cerca codice, titolo, email…" value={ricerca} onChange={(e) => setRicerca(e.target.value)} />
            <button className="btn primario" onClick={() => setModulo({})} disabled={!dati || solaLettura} title="Nuova attività (Ctrl+N)">
              + Nuova attività
            </button>
          </>
        )}
        {!configurata && <span className="spazio" />}
        {/* Impostazioni: subito a destra di "Nuova attività" */}
        <button className={`btn-icona grande ${vista === "impostazioni" ? "attivo" : ""}`} onClick={() => setVista("impostazioni")} title="Impostazioni">⚙️</button>
      </header>

      {messaggio && (
        <div className={`avviso ${messaggio.tipo} fisso`}>
          {messaggio.testo}
          <button className="btn-icona" onClick={() => setMessaggio(null)}>✕</button>
        </div>
      )}
      {dati?.solaLettura && vista !== "impostazioni" && (
        <div className="avviso info fisso">🔒 Sola lettura: il progetto è gestito da {dati.progetto.proprietario}.</div>
      )}
      {elenco?.copieInConflitto.map((c) => (
        <div key={c.progettoId} className="avviso errore fisso">
          ⚠ OneDrive ha creato copie in conflitto del progetto "{c.nome}": {c.file.join(", ")}. L'app usa {c.file[0]}; controlla le altre copie
          e poi eliminale dalla cartella.
        </div>
      ))}
      {elenco?.fileNonLeggibili.map((f) => (
        <div key={f.file} className="avviso errore fisso">⚠ {f.messaggio}</div>
      ))}

      <main className="contenuto">{contenuto}</main>

      {modulo && dati && (
        <ModuloAttivita
          key={modulo.attivita?.id ?? "nuova"}
          progetto={dati.progetto}
          attivita={modulo.attivita}
          preimpostato={modulo.preimpostato}
          solaLettura={dati.solaLettura}
          emailUtente={impostazioni.emailUtente}
          onChiudi={() => setModulo(null)}
          onAggiornata={sostituisci}
          onEliminata={(id) =>
            setDati((d) => (d ? { ...d, attivita: d.attivita.filter((a) => a.id !== id), dipendenze: d.dipendenze.filter((x) => x.origineId !== id && x.destinazioneId !== id) } : d))
          }
          onConflitto={(testo) => {
            setModulo(null);
            setMessaggio({ tipo: "errore", testo });
            void caricaProgetto(progettoId);
          }}
        />
      )}

      {nuovoProgetto && (
        <ModuloProgetto
          onChiudi={() => setNuovoProgetto(false)}
          onCreato={async (p) => {
            await caricaElenco();
            setProgettoId(p.id);
            setMessaggio({ tipo: "info", testo: `Progetto "${p.nome}" creato.` });
          }}
        />
      )}
    </div>
  );
}
