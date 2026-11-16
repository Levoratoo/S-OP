/**
 * Seed operacional: importa CSVs da pasta dados-sistema e garante marcas/gestores/vínculos.
 */
import * as db from "../db";
import { importSystemCadastros } from "./system-cadastros-importer";

const MARCAS_PADRAO = [
  "Adidas",
  "Nike",
  "Puma",
  "Fila",
  "Olympikus",
  "Asics",
  "Under Armour",
  "New Balance",
  "Printbag",
  "Sem Marca",
];

const GESTORES_PADRAO = [
  { nome: "Gestor Comercial Geral", email: "gestor.geral@printbag.local" },
  { nome: "Gestor Marcas Esportivas", email: "gestor.esporte@printbag.local" },
];

export type SeedMestresResult = {
  dirPath: string;
  dryRun: boolean;
  importacao: Awaited<ReturnType<typeof importSystemCadastros>>;
  marcasCriadas: number;
  gestoresCriados: number;
  vinculosCriados: number;
  sazonalidade: { inserted: 0; skipped: true };
};

export async function seedDadosMestresOperacionais(options: {
  dirPath: string;
  dryRun?: boolean;
}): Promise<SeedMestresResult> {
  const dryRun = Boolean(options.dryRun);

  const importacao = await importSystemCadastros({
    dirPath: options.dirPath,
    dryRun,
  });

  let marcasCriadas = 0;
  let gestoresCriados = 0;
  let vinculosCriados = 0;

  if (!dryRun) {
    const marcasExistentes = await db.listMarcas();
    const nomesMarca = new Set(
      marcasExistentes.map(m => (m.nome || "").trim().toLowerCase()).filter(Boolean)
    );

    for (const nome of MARCAS_PADRAO) {
      if (nomesMarca.has(nome.toLowerCase())) continue;
      await db.createMarca({ nome, ativo: true });
      marcasCriadas += 1;
      nomesMarca.add(nome.toLowerCase());
    }

    const gestoresExistentes = await db.listGestores();
    const emailsGestores = new Set(
      gestoresExistentes.map(g => (g.email || "").trim().toLowerCase()).filter(Boolean)
    );
    const nomesGestores = new Set(
      gestoresExistentes.map(g => (g.nome || "").trim().toLowerCase()).filter(Boolean)
    );

    for (const g of GESTORES_PADRAO) {
      const emailKey = g.email.toLowerCase();
      const nomeKey = g.nome.toLowerCase();
      if (emailsGestores.has(emailKey) || nomesGestores.has(nomeKey)) continue;
      await db.createGestor({ nome: g.nome, email: g.email, ativo: true });
      gestoresCriados += 1;
    }

    const marcas = await db.listMarcas();
    const gestores = await db.listGestores();
    const gestorGeral =
      gestores.find(g => (g.email || "").toLowerCase() === "gestor.geral@printbag.local") ||
      gestores[0];
    const vinculos = await db.listGestorMarca();
    const pairSet = new Set(vinculos.map(v => `${v.gestorId}:${v.marcaId}`));

    if (gestorGeral) {
      for (const marca of marcas) {
        const key = `${gestorGeral.id}:${marca.id}`;
        if (pairSet.has(key)) continue;
        await db.createGestorMarca({
          gestorId: gestorGeral.id,
          marcaId: marca.id,
          ativo: true,
        });
        vinculosCriados += 1;
        pairSet.add(key);
      }
    }
  }

  return {
    dirPath: options.dirPath,
    dryRun,
    importacao,
    marcasCriadas,
    gestoresCriados,
    vinculosCriados,
    sazonalidade: { inserted: 0, skipped: true },
  };
}
