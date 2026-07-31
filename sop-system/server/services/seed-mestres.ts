/**
 * Seed operacional: importa CSVs da pasta dados-sistema e garante marcas/gestores/vínculos.
 */
import * as db from "../db";
import { importSystemCadastros } from "./system-cadastros-importer";
import { seedSazonalidadeUniformeSeVazia } from "./desagregacao";

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
  sazonalidade: Awaited<ReturnType<typeof seedSazonalidadeUniformeSeVazia>>;
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

  let sazonalidade = dryRun
    ? { inserted: 0 }
    : await seedSazonalidadeUniformeSeVazia();

  // Se já existia sazonalidade parcial, completa marcas cadastradas sem curva
  if (!dryRun) {
    const marcas = await db.listMarcas();
    const sazRows = await db.listSazonalidadeMarca();
    const marcasComSaz = new Set(sazRows.map(r => (r.marcaNome || "").trim().toLowerCase()));
    const pct = String(Math.round((1 / 12) * 1e6) / 1e6);
    const missing: Array<{ marcaNome: string; mes: number; percentual: string; marcaId?: number }> = [];
    for (const marca of marcas) {
      const key = (marca.nome || "").trim().toLowerCase();
      if (!key || marcasComSaz.has(key)) continue;
      for (let mes = 1; mes <= 12; mes++) {
        missing.push({ marcaNome: marca.nome, mes, percentual: pct, marcaId: marca.id });
      }
    }
    if (missing.length > 0) {
      await db.upsertSazonalidadeMarcaBatch(missing);
      sazonalidade = { inserted: (sazonalidade.inserted || 0) + missing.length };
    }
  }

  return {
    dirPath: options.dirPath,
    dryRun,
    importacao,
    marcasCriadas,
    gestoresCriados,
    vinculosCriados,
    sazonalidade,
  };
}
