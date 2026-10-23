import { describe, expect, it } from "vitest";
import {
  festivitaAnno,
  inizioSettimana,
  nomeFestivita,
  pasqua,
  perInput,
  daInput,
} from "../src/renderer/utils/date";

describe("utility delle date", () => {
  it("converte correttamente gli orari locali in ISO UTC e viceversa", () => {
    const input = "2026-03-15T10:30";
    const iso = daInput(input);

    expect(iso).not.toBe("");
    expect(perInput(iso)).toBe(input);
  });

  it("restituisce una stringa vuota per una data non valida", () => {
    expect(daInput("data non valida")).toBe("");
  });

  it("calcola la domenica di Pasqua per anni noti", () => {
    expect(pasqua(2025)).toEqual(new Date(2025, 3, 20));
    expect(pasqua(2026)).toEqual(new Date(2026, 3, 5));
  });

  it("calcola il lunedì come inizio della settimana", () => {
    expect(inizioSettimana(new Date(2026, 9, 23))).toEqual(new Date(2026, 9, 19));
    expect(inizioSettimana(new Date(2026, 9, 19))).toEqual(new Date(2026, 9, 19));
  });

  it("include San Francesco tra le festività nazionali dal 2026", () => {
    expect(nomeFestivita(new Date(2025, 9, 4))).toBeUndefined();
    expect(festivitaAnno(2026).get("2026-10-04")).toBe("San Francesco d'Assisi");
  });
});
