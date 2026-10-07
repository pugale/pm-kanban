import { useEffect, useState } from "react";
import type { Impostazioni as TipoImpostazioni } from "../../shared/types";

interface Props {
  impostazioni: TipoImpostazioni;
  onCambiate(i: TipoImpostazioni): void;
  onCartellaCambiata(): void;
}

export default function Impostazioni({ impostazioni, onCambiate, onCartellaCambiata }: Props) {
  const [email, setEmail] = useState(impostazioni.emailUtente ?? "");
  const [nome, setNome] = useState(impostazioni.nomeUtente ?? "");
  const [messaggio, setMessaggio] = useState<{ tipo: "info" | "errore"; testo: string } | null>(null);

  useEffect(() => {
    setEmail(impostazioni.emailUtente ?? "");
    setNome(impostazioni.nomeUtente ?? "");
  }, [impostazioni.emailUtente, impostazioni.nomeUtente]);

  async function salva() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setMessaggio({ tipo: "errore", testo: "Inserisci un'email valida." });
    const r = await window.pm.salvaImpostazioni({ emailUtente: email, nomeUtente: nome });
    if (r.ok) {
      onCambiate(r.dati);
      setMessaggio({ tipo: "info", testo: "Impostazioni salvate." });
    } else setMessaggio({ tipo: "errore", testo: r.messaggio });
  }

  async function scegli() {
    const r = await window.pm.scegliCartella();
    if (!r.ok) return setMessaggio({ tipo: "errore", testo: r.messaggio });
    if (r.dati) {
      onCambiate({ ...impostazioni, cartellaDati: r.dati });
      onCartellaCambiata();
      setMessaggio({ tipo: "info", testo: "Cartella impostata." });
    }
  }

  async function controllaNotifiche() {
    const r = await window.pm.aggiornaStatoNotifiche();
    if (!r.ok) return setMessaggio({ tipo: "errore", testo: r.messaggio });
    setMessaggio({
      tipo: "info",
      testo: r.dati.length ? `Aggiornati ${r.dati.length} progetti con notifiche inviate.` : "Nessuna novità dal registro delle notifiche.",
    });
    if (r.dati.length) onCartellaCambiata();
  }

  const configurata = !!impostazioni.cartellaDati && !!impostazioni.emailUtente;

  return (
    <div className="impostazioni">
      {!configurata && (
        <div className="avviso info">
          <b>Benvenuto in PM-Kanban.</b> Per iniziare inserisci la tua email e scegli la cartella SharePoint sincronizzata con OneDrive
          in cui salvare i progetti.
        </div>
      )}
      {messaggio && <div className={`avviso ${messaggio.tipo}`}>{messaggio.testo}</div>}

      <div className="pannello">
        <h3>1. I tuoi dati</h3>
        <div className="modulo">
          <div className="riga-modulo">
            <label className="campo">
              Email aziendale *
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome.cognome@azienda.it" />
            </label>
            <label className="campo">
              Nome
              <input value={nome} onChange={(e) => setNome(e.target.value)} />
            </label>
          </div>
          <small className="nota">
            L'email identifica il proprietario dei progetti (solo lui può modificarli) ed è proposta come responsabile delle nuove attività.
          </small>
          <div><button className="btn primario" onClick={salva}>Salva</button></div>
        </div>
      </div>

      <div className="pannello">
        <h3>2. Cartella dei progetti</h3>
        <p className="percorso">{impostazioni.cartellaDati ?? "Nessuna cartella scelta"}</p>
        <div><button className="btn primario" onClick={scegli}>📁 Scegli cartella…</button></div>
        <small className="nota">
          Usa una cartella di una raccolta documenti SharePoint sincronizzata sul PC (pulsante "Sincronizza" o "Aggiungi collegamento a
          OneDrive"). L'app crea il file _notifiche-inviate.json usato da Power Automate e la cartella "allegati".
        </small>
      </div>

      <div className="pannello">
        <h3>3. Notifiche</h3>
        <p>
          Le notifiche Teams ed email sono inviate dal flusso Power Automate descritto in <code>docs/flusso-notifiche.md</code> al responsabile
          e ai partecipanti. L'app controlla da sola ogni 5 minuti il registro delle notifiche inviate e aggiorna lo stato delle attività.
        </p>
        <div><button className="btn" onClick={controllaNotifiche}>🔄 Controlla adesso</button></div>
      </div>
    </div>
  );
}
