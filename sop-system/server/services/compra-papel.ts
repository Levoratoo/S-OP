import { desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getCicloComercial, getDb, listCicloComercialItens } from "../db";
import {
  cicloCrmNegocio,
  compraPapelDecisao,
  compraPapelSnapshot,
  compraPapelSnapshotLinhas,
  papeis,
  papelEstoque,
} from "../../drizzle/schema";
import {
  janelaCompraPapel,
  montarLinhasCompraPapel,
  pendenciasCompraPapel,
  validarImportacaoCompraPapel,
  type DecisaoCompra,
  type LinhaCompraPapel,
  type LinhaImportadaCompra,
  type ParcelaNegocioCrm,
  type RiscoCompra,
} from "@shared/compra-papel";
import { fonteEstoquePapel } from "./fonte-estoque-papel";

async function parcelasDoCiclo(cicloId: number): Promise<ParcelaNegocioCrm[]> {
  const db = await getDb();
  if (!db) return [];
  const negocios = await db.select().from(cicloCrmNegocio).where(eq(cicloCrmNegocio.cicloId, cicloId));
  if (negocios.length) {
    return negocios.map(row => ({
      dealId: row.dealId,
      titulo: row.titulo,
      proprietario: row.proprietario || "",
      proprietarioEmail: row.proprietarioEmail || "",
      marca: row.marca || "",
      temperatura: row.temperatura || "",
      sku: row.sku,
      descricao: row.descricao || "",
      tipo: row.tipo,
      ano: row.anoEntrega,
      mes: row.mesEntrega,
      quantidade: Number(row.quantidade || 0),
      preco: Number(row.preco || 0),
    }));
  }
  const ciclo = await getCicloComercial(cicloId);
  if (!ciclo) return [];
  const janela = janelaCompraPapel(ciclo.anoInicio, ciclo.mesInicio);
  const itens = await listCicloComercialItens(cicloId, "CRM");
  const parcelas: ParcelaNegocioCrm[] = [];
  for (const item of itens) {
    if (item.origem !== "CRM") continue;
    janela.forEach((mes, indice) => {
      const quantidade = Number(item[`m${indice + 1}` as "m1"] || 0);
      if (!(quantidade > 0)) return;
      parcelas.push({
        dealId: item.id,
        titulo: item.descricao || item.sku,
        proprietario: "",
        proprietarioEmail: "",
        marca: item.marca || "",
        temperatura: item.crmTemperatura || "",
        sku: item.sku,
        descricao: item.descricao || "",
        tipo: item.crmTipo || "",
        ano: mes.ano,
        mes: mes.mes,
        quantidade,
        preco: Number(item.valorVendaSnapshot || 0),
      });
    });
  }
  return parcelas;
}

export async function listarCompraPapel(cicloId: number) {
  const ciclo = await getCicloComercial(cicloId);
  if (!ciclo) throw new TRPCError({ code: "NOT_FOUND", message: "Ciclo não encontrado." });
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  const janela = janelaCompraPapel(ciclo.anoInicio, ciclo.mesInicio);
  const somenteLeitura = ciclo.status === "APROVADO" || ciclo.status === "CONGELADO";
  if (somenteLeitura) {
    const [foto] = await db
      .select()
      .from(compraPapelSnapshot)
      .where(eq(compraPapelSnapshot.cicloId, cicloId))
      .orderBy(desc(compraPapelSnapshot.versao))
      .limit(1);
    const linhasFoto = foto
      ? await db
          .select()
          .from(compraPapelSnapshotLinhas)
          .where(eq(compraPapelSnapshotLinhas.snapshotId, foto.id))
      : [];
    return {
      status: ciclo.status,
      editavel: false,
      janela,
      comentario: foto?.comentario ?? null,
      linhas: linhasFoto.map(linha => JSON.parse(linha.payloadJson) as LinhaCompraPapel & Record<string, unknown>),
      papeis: await db.select().from(papeis),
      estoque: await fonteEstoquePapel().listar(),
    };
  }
  const linhas = montarLinhasCompraPapel(await parcelasDoCiclo(cicloId), janela);
  const decisoes = await db.select().from(compraPapelDecisao).where(eq(compraPapelDecisao.cicloId, cicloId));
  const porId = new Map(decisoes.map(item => [item.linhaId, item]));
  const catalogo = await db.select().from(papeis);
  const estoque = await fonteEstoquePapel().listar();
  return {
    status: ciclo.status,
    editavel: ciclo.status === "CONSENSO",
    janela,
    comentario: null,
    papeis: catalogo,
    estoque,
    linhas: linhas.map(linha => {
      const decisao = porId.get(linha.linhaId);
      return {
        ...linha,
        papelId: decisao?.papelId ?? null,
        risco: (decisao?.risco as RiscoCompra | null) ?? null,
        comprar: (decisao?.comprar as DecisaoCompra | undefined) ?? "PENDENTE",
        quantidadeCompra: decisao?.quantidade != null ? Number(decisao.quantidade) : null,
        observacao: decisao?.observacao ?? "",
        decididoPor: decisao?.decididoPor ?? null,
        decididoEm: decisao?.decididoEm ? new Date(decisao.decididoEm).toISOString() : null,
      };
    }),
  };
}

async function exigirConsenso(cicloId: number) {
  const ciclo = await getCicloComercial(cicloId);
  if (!ciclo) throw new TRPCError({ code: "NOT_FOUND", message: "Ciclo não encontrado." });
  if (ciclo.status !== "CONSENSO") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "A compra de papel só é editada com o ciclo em consenso.",
    });
  }
  return ciclo;
}

export async function salvarDecisoesCompraPapel(input: {
  cicloId: number;
  usuario: string;
  itens: Array<{
    linhaId: string;
    papelId: number | null;
    risco: RiscoCompra | null;
    comprar: DecisaoCompra;
    quantidade: number | null;
    observacao: string;
  }>;
}) {
  await exigirConsenso(input.cicloId);
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  const agora = new Date();
  for (const item of input.itens) {
    await db
      .insert(compraPapelDecisao)
      .values({
        cicloId: input.cicloId,
        linhaId: item.linhaId,
        papelId: item.papelId,
        risco: item.risco,
        comprar: item.comprar,
        quantidade: item.quantidade == null ? null : String(item.quantidade),
        observacao: item.observacao || null,
        decididoPor: input.usuario,
        decididoEm: agora,
      })
      .onDuplicateKeyUpdate({
        set: {
          papelId: item.papelId,
          risco: item.risco,
          comprar: item.comprar,
          quantidade: item.quantidade == null ? null : String(item.quantidade),
          observacao: item.observacao || null,
          decididoPor: input.usuario,
          decididoEm: agora,
        },
      });
  }
  return { gravados: input.itens.length };
}

export async function avaliarCompraPapelParaAprovacao(cicloId: number) {
  const visao = await listarCompraPapel(cicloId);
  const pendentes = pendenciasCompraPapel(visao.linhas.map(linha => ({ comprar: String(linha.comprar ?? "PENDENTE") })));
  return { total: visao.linhas.length, pendentes };
}

export async function congelarCompraPapel(cicloId: number, usuario: string | null, comentario: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const visao = await listarCompraPapel(cicloId);
  const [ultima] = await db
    .select({ versao: compraPapelSnapshot.versao })
    .from(compraPapelSnapshot)
    .where(eq(compraPapelSnapshot.cicloId, cicloId))
    .orderBy(desc(compraPapelSnapshot.versao))
    .limit(1);
  const inserted = await db.insert(compraPapelSnapshot).values({
    cicloId,
    versao: (ultima?.versao ?? 0) + 1,
    linhas: visao.linhas.length,
    comentario,
    createdBy: usuario,
  });
  const snapshotId = Number(inserted[0].insertId);
  if (visao.linhas.length) {
    await db.insert(compraPapelSnapshotLinhas).values(
      visao.linhas.map(linha => ({
        snapshotId,
        linhaId: String(linha.linhaId),
        payloadJson: JSON.stringify(linha),
      }))
    );
  }
  return { snapshotId, linhas: visao.linhas.length };
}

export async function criarPapel(input: {
  codigo: string;
  descricao: string;
  gramatura?: string | null;
  formato?: string | null;
  tipo?: string | null;
  unidade?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  const codigo = input.codigo.trim().toUpperCase();
  if (!codigo || !input.descricao.trim()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Informe código e descrição do papel." });
  }
  try {
    await db.insert(papeis).values({
      codigo,
      descricao: input.descricao.trim(),
      gramatura: input.gramatura || null,
      formato: input.formato || null,
      tipo: input.tipo || null,
      unidade: input.unidade?.trim() || "KG",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Duplicate") || message.includes("uk_papeis")) {
      throw new TRPCError({ code: "CONFLICT", message: `Papel ${codigo} já está cadastrado.` });
    }
    throw error;
  }
  return { codigo };
}

export async function atualizarPapel(id: number, ativo: boolean) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  await db.update(papeis).set({ ativo }).where(eq(papeis.id, id));
}

export async function importarEstoquePapel(linhas: Array<{ codigo: string; quantidade: number; unidade: string; dataBase: string }>) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  const catalogo = await db.select().from(papeis);
  const porCodigo = new Map(catalogo.map(papel => [papel.codigo.toUpperCase(), papel]));
  const erros: string[] = [];
  let gravados = 0;
  for (const linha of linhas) {
    const papel = porCodigo.get(linha.codigo.trim().toUpperCase());
    if (!papel) {
      erros.push(`Papel ${linha.codigo} não está cadastrado.`);
      continue;
    }
    await db
      .insert(papelEstoque)
      .values({
        papelId: papel.id,
        quantidade: String(linha.quantidade),
        unidade: linha.unidade || papel.unidade,
        dataBase: new Date(`${linha.dataBase}T00:00:00Z`),
        origem: "MANUAL",
      })
      .onDuplicateKeyUpdate({
        set: {
          quantidade: String(linha.quantidade),
          unidade: linha.unidade || papel.unidade,
          dataBase: new Date(`${linha.dataBase}T00:00:00Z`),
          origem: "MANUAL",
        },
      });
    gravados += 1;
  }
  return { gravados, erros };
}

export async function preverImportacaoCompraPapel(cicloId: number, linhas: LinhaImportadaCompra[]) {
  await exigirConsenso(cicloId);
  const visao = await listarCompraPapel(cicloId);
  const previa = validarImportacaoCompraPapel({
    linhas,
    idsValidos: visao.linhas.map(linha => String(linha.linhaId)),
    papeis: visao.papeis.map(papel => ({ codigo: papel.codigo, ativo: papel.ativo })),
  });
  return { previa, podeConfirmar: previa.every(linha => linha.erros.length === 0) && previa.length > 0 };
}

export async function confirmarImportacaoCompraPapel(cicloId: number, usuario: string, linhas: LinhaImportadaCompra[]) {
  const previa = await preverImportacaoCompraPapel(cicloId, linhas);
  if (!previa.podeConfirmar) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A prévia tem erros. Corrija a planilha antes de confirmar." });
  }
  const visao = await listarCompraPapel(cicloId);
  const porCodigo = new Map(visao.papeis.map(papel => [papel.codigo.toUpperCase(), papel.id]));
  await salvarDecisoesCompraPapel({
    cicloId,
    usuario,
    itens: previa.previa.map(linha => ({
      linhaId: linha.linhaId,
      papelId: linha.papelIdCodigo ? porCodigo.get(linha.papelIdCodigo.toUpperCase()) ?? null : null,
      risco: linha.risco,
      comprar: linha.comprar ?? "PENDENTE",
      quantidade: linha.quantidade,
      observacao: linha.observacao,
    })),
  });
  return { gravados: previa.previa.length };
}

