import { useState } from "react";
import type { InfoProgetto } from "../../shared/types";
import Finestra from "./Finestra";

interface Props {
  onChiudi(): void;
  onCreato(p: InfoProgetto): void;
}

export default function ModuloProgetto({ onChiudi, onCreato }: Props) {
  const [nome, setNome] = useState("");
  const [cliente, setCliente] = useState("");
  const [prefisso, setPrefisso] = useState("");
  const [tag, setTag] = useState("");
  const [errore, setErrore] = useState("");

  // Prefisso proposto dal nome: "SARA Bologna" → "SARA"
  const prefissoProposto = nome.trim().split(/\s+/)[0]?.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10).toUpperCase() ?? "";

  async function crea() {
    const r = await window.pm.creaProgetto({
      nome,
      cliente,
      prefissoCodice: prefisso || prefissoProposto,
      tag: tag.split(",").map((t) => t.trim()).filter(Boolean),
    });
    if (r.ok) {
      onCreato(r.dati);
      onChiudi();
    } else setErrore(r.messaggio);
  }

  return (
    <Finestra
      titolo="Nuovo progetto"
      onChiudi={onChiudi}
      piede={
        <>
          <span className="spazio" />
          <button className="btn" onClick={onChiudi}>Annulla</button>
          <button className="btn primario" onClick={crea}>Crea progetto</button>
        </>
      }
    >
      {errore && <div className="avviso errore">{errore}</div>}
      <div className="modulo">
        <label className="campo">
          Nome del progetto *
          <input value={nome} onChange={(e) => setNome(e.target.value)} autoFocus placeholder="SARA Bologna" />
        </label>
        <label className="campo">
          Cliente
          <input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Comune di Bologna" />
        </label>
        <div className="riga-modulo">
          <label className="campo">
            Prefisso dei codici attività
            <input value={prefisso} onChange={(e) => setPrefisso(e.target.value.toUpperCase())} placeholder={prefissoProposto || "SARA"} />
          </label>
          <label className="campo">
            Tag (separati da virgola)
            <input value={tag} onChange={(e) => setTag(e.target.value)} />
          </label>
        </div>
        <small className="nota">
          Le attività avranno codici come {(prefisso || prefissoProposto || "SARA")}-001. Il progetto viene salvato come file JSON nella
          cartella condivisa e tu ne sarai l'unico autore: gli altri lo vedranno in sola lettura.
        </small>
      </div>
    </Finestra>
  );
}
