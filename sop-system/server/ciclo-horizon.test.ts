import { describe, expect, it } from "vitest";
import {
  cicloHorizonCalendar,
  cicloHorizonIndexFromCalendar,
  cicloHorizonIsoDate,
  cicloHorizonStartAbsolute,
} from "@shared/ciclo-horizon";

describe("horizonte do ciclo (m1 = mês do ciclo + 1)", () => {
  it("ciclo nov/2026 → dez/2026 … nov/2027", () => {
    const ano = 2026;
    const mesCiclo = 11;
    expect(cicloHorizonCalendar(ano, mesCiclo, 0)).toEqual({ year: 2026, month: 12 });
    expect(cicloHorizonCalendar(ano, mesCiclo, 11)).toEqual({ year: 2027, month: 11 });
    expect(cicloHorizonIsoDate(ano, mesCiclo, 0)).toBe("2026-12-01");
    expect(cicloHorizonIsoDate(ano, mesCiclo, 11)).toBe("2027-11-01");
  });

  it("mês do ciclo fica fora do horizonte", () => {
    expect(cicloHorizonIndexFromCalendar(2026, 11, 2026, 11)).toBeNull();
    expect(cicloHorizonIndexFromCalendar(2026, 11, 2026, 12)).toBe(0);
  });

  it("ciclo dez/2026 → jan/2027", () => {
    expect(cicloHorizonCalendar(2026, 12, 0)).toEqual({ year: 2027, month: 1 });
    expect(cicloHorizonStartAbsolute(2026, 12)).toBe(2027 * 12);
  });
});
