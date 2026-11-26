import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";
import { afterEach, describe, expect, it } from "vitest";
import { lerEstatisticaArquivoJob } from "./services/grade-job-estatistica";

const pastas: string[] = [];

afterEach(async () => {
  await Promise.all(pastas.splice(0).map(pasta => rm(pasta, { recursive: true, force: true })));
});

describe("estatística do arquivo do job", () => {
  it("lê o melhor modelo da aba Detalhado", async () => {
    const pasta = await mkdtemp(path.join(os.tmpdir(), "grade-job-"));
    pastas.push(pasta);
    const arquivo = path.join(pasta, "job.xlsx");
    const livro = XLSX.utils.book_new();
    const aba = XLSX.utils.json_to_sheet([
      {
        Codigo: "80.01.000001-ADIDAS",
        MELHOR_CENARIO: "HOLT_WINTERS",
        "jan/2026_HOLT_WINTERS": 12,
        "jan/2026_MEDIA_SIMPLES": 99,
      },
    ]);
    XLSX.utils.book_append_sheet(livro, aba, "Detalhado");
    await writeFile(arquivo, XLSX.write(livro, { type: "buffer", bookType: "xlsx" }));
    const serie = await lerEstatisticaArquivoJob(arquivo);
    expect(serie["80.01.000001"]?.["2026-1"]).toBe(12);
  });
});
