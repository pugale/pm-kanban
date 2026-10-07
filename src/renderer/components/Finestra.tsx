import { useEffect, type ReactNode } from "react";

interface Props {
  titolo: ReactNode;
  onChiudi(): void;
  children: ReactNode;
  piede?: ReactNode;
  larga?: boolean;
}

/** Finestra modale: si chiude con Esc o con il pulsante ✕ */
export default function Finestra({ titolo, onChiudi, children, piede, larga }: Props) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onChiudi();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onChiudi]);

  return (
    <div className="sfondo-modale" onMouseDown={(e) => e.target === e.currentTarget && onChiudi()}>
      <div className={`modale ${larga ? "larga" : ""}`} role="dialog" aria-modal="true">
        <div className="modale-testa">
          <h2>{titolo}</h2>
          <button className="btn-icona" onClick={onChiudi} title="Chiudi (Esc)">✕</button>
        </div>
        <div className="modale-corpo">{children}</div>
        {piede && <div className="modale-piede">{piede}</div>}
      </div>
    </div>
  );
}
