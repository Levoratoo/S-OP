/**
 * Smoke E2E contra o ambiente compartilhado.
 * Roda somente com SNOP_E2E_BASE_URL (ex.: http://192.168.1.82:3042).
 *
 * Observação: endpoints novos (ex.: cicloComercial.resumoProd) só passam
 * depois do deploy das correções de paridade.
 */
import { describe, expect, it } from "vitest";

const baseUrl = process.env.SNOP_E2E_BASE_URL?.replace(/\/$/, "");
const describeLive = baseUrl ? describe : describe.skip;

async function trpcGetRaw(procedure: string, input: unknown) {
  const url =
    `${baseUrl}/api/trpc/${procedure}?batch=1&input=` +
    encodeURIComponent(JSON.stringify({ 0: { json: input } }));
  const response = await fetch(url);
  const payload = await response.json();
  return { status: response.status, payload };
}

async function trpcGet<T>(procedure: string, input: unknown): Promise<T> {
  const { status, payload } = await trpcGetRaw(procedure, input);
  if (status !== 200 || payload?.[0]?.error) {
    throw new Error(
      `${procedure} failed (${status}): ${JSON.stringify(payload?.[0]?.error || payload)}`
    );
  }
  return payload[0].result.data.json as T;
}

describeLive("E2E live SNOP (paridade Word)", () => {
  it("lista jobs e mantém Visao_Executiva quando houver SUCCESS", async () => {
    const jobs = await trpcGet<
      Array<{ id: number; status: string; outputFileName: string | null }>
    >("previsaoPython.list", { limit: 10 });

    expect(Array.isArray(jobs)).toBe(true);
    if (jobs.length === 0) {
      // Ambiente local fresco: sem jobs ainda, mas a API de listagem responde.
      return;
    }

    const success = jobs.find(job => job.status === "SUCCESS" && job.outputFileName);
    expect(success).toBeTruthy();

    const meta = await trpcGet<string[] | { sheetNames: string[] }>(
      "previsaoPython.workbookMeta",
      { id: success!.id }
    );
    const sheetNames = Array.isArray(meta) ? meta : meta.sheetNames;
    expect(sheetNames).toContain("Visao_Executiva");

    const sheet = await trpcGet<{
      columns: string[];
      rows: unknown[][];
      totalRows: number;
    }>("previsaoPython.sheetData", {
      id: success!.id,
      sheetName: "Visao_Executiva",
      page: 1,
      pageSize: 250,
    });

    expect(sheet.totalRows).toBeGreaterThan(0);
    expect(sheet.columns).toContain("Previsão Final Sugerida");
    expect(sheet.columns).toContain("Codigo");
  });

  it(
    "expõe APIs dos relatórios comerciais no ciclo aberto",
    async () => {
      const ciclos = await trpcGet<Array<{ id: number; status: string }>>(
        "cicloComercial.list",
        {}
      );
      expect(Array.isArray(ciclos)).toBe(true);
      if (ciclos.length === 0) return;

      const cicloId = ciclos[0].id;
      const required = [
        ["cicloComercial.baseCicloFull", { cicloId }],
        ["cicloComercial.resumoRs", { cicloId }],
        ["cicloComercial.pvVsCrm", { cicloId }],
        ["cicloComercial.mtoVariacao", { cicloId }],
        ["cicloComercial.relatorioRfs", { cicloId }],
      ] as const;

      for (const [procedure, input] of required) {
        const data = await trpcGet<unknown>(procedure, input);
        expect(data).toBeTruthy();
      }

    // 4-Resumo PROD: após deploy da paridade a procedure existe.
    const prod = await trpcGetRaw("cicloComercial.resumoProd", { cicloId });
    if (prod.status === 200 && !prod.payload?.[0]?.error) {
      expect(prod.payload[0].result.data.json).toBeTruthy();
    } else {
      const message = JSON.stringify(prod.payload?.[0]?.error || {});
      // Aceita "ciclo não encontrado" (procedure já publicada) ou ausência no servidor antigo.
      expect(message).toMatch(/resumoProd|No procedure found|Ciclo não encontrado|não encontrado/i);
    }
    },
    60_000
  );
});
