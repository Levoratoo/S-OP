import { beforeEach, describe, expect, it } from "vitest";
import { configPadraoParaTeste, prepararItemCrm, type PacotePipedrive } from "@shared/pipedrive-crm";
import { PipedriveClient } from "./client";
import { extrairPipedrive, limparCacheCamposPipedrive } from "./extract";
import { pacoteFicticio } from "./fixture";
import {
  desfazerPipedrive,
  PipedriveSyncError,
  previaPipedrive,
  syncPipedrive,
  type RepositorioPipedrive,
  type RegistroSync,
} from "./sync";

type Item = Record<string, unknown> & {
  cicloId: number;
  sku: string;
  planoColab: string;
  origem: string;
};

function pacoteComQuantidade(qtd: number): PacotePipedrive {
  const base = pacoteFicticio();
  const modelo = base.deals[0]!;
  const campos = { ...(modelo.custom_fields ?? {}) };
  const chaveEntregas = Object.keys(campos).find(chave => String(campos[chave]) === "12");
  if (chaveEntregas) campos[chaveEntregas] = "1";
  return {
    ...base,
    deals: [
      {
        ...modelo,
        id: 1,
        title: "Mínimo",
        expected_close_date: "2026-12-02",
        label_ids: [3257, 3171],
        custom_fields: campos,
      },
    ],
    dealProducts: [
      {
        id: 1,
        deal_id: 1,
        product_id: 101,
        name: "80.01.000001-Sacola",
        item_price: 2,
        quantity: qtd,
        sum: qtd * 2,
        comments: "",
        is_enabled: true,
      },
    ],
  };
}

function criarMemoria() {
  let status = "EM_COLABORACAO";
  let falharInsert = false;
  let materializacoes = 0;
  let itens: Item[] = [
    { id: 5, cicloId: 7, sku: "ANTIGO-A", planoColab: "CRM", origem: "CRM", m1: "3" },
    { id: 6, cicloId: 7, sku: "ANTIGO-B", planoColab: "CRM", origem: "CRM", m1: "4" },
    { cicloId: 7, sku: "PV-1", planoColab: "PV_MTO", origem: "PV", m1: "9" },
  ];
  let audits: RegistroSync[] = [];
  let seq = 1;

  const cargaCrm = () => itens.filter(item => item.planoColab === "CRM" && item.origem === "CRM");

  const tx = {
    async statusCiclo() {
      return status;
    },
    async snapshotCarga() {
      return structuredClone(cargaCrm());
    },
    async substituirCarga(cicloId: number, novos: object[]) {
      itens = itens.filter(item => !(item.cicloId === cicloId && item.planoColab === "CRM" && item.origem === "CRM"));
      if (falharInsert) throw new Error("insert falhou");
      itens.push(...(novos as Item[]));
    },
    async registrarSync(registro: Omit<RegistroSync, "id" | "createdAt" | "desfeitoEm">) {
      audits.push({
        ...registro,
        id: seq,
        createdAt: "2026-11-25T12:00:00.000Z",
        desfeitoEm: null,
      });
      seq += 1;
    },
    async ultimaSync() {
      return audits[audits.length - 1] ?? null;
    },
    async marcarDesfeita(id: number, quando: Date) {
      const audit = audits.find(item => item.id === id);
      if (audit) audit.desfeitoEm = quando.toISOString();
    },
  };

  const repo: RepositorioPipedrive = {
    async obterCiclo() {
      return { id: 7, status, anoInicio: 2026, mesInicio: 11 };
    },
    async listarGestores() {
      return ["Ana Souza", "Bruno Lima"];
    },
    async listarProdutos() {
      return [{ codigo: "80.01.000001", descricao: "Sacola específica Aurora" }];
    },
    async listarDePara() {
      return [];
    },
    async listarCargaCrm() {
      return cargaCrm().map(item => ({
        marca: "Aurora",
        valorVenda: 2,
        meses: [Number(item.m1 ?? 0), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      }));
    },
    async materializar(_cicloId, linhas) {
      materializacoes += 1;
      return {
        itens: linhas.map(linha => ({
          cicloId: 7,
          sku: linha.sku,
          planoColab: "CRM",
          origem: "CRM",
          descricao: linha.descricao,
          marca: linha.marca,
          m1: String(linha.qtdMes),
        })),
        skusCriados: [],
        erros: [],
        avisos: [],
        foraHorizonte: 0,
      };
    },
    async transacao(fn) {
      const backupItens = structuredClone(itens);
      const backupAudits = structuredClone(audits);
      const backupSeq = seq;
      try {
        return await fn(tx);
      } catch (error) {
        itens = backupItens;
        audits = backupAudits;
        seq = backupSeq;
        throw error;
      }
    },
    async ultimaSincronizacao() {
      return audits[audits.length - 1] ?? null;
    },
  };

  return {
    repo,
    crm: () => cargaCrm().map(item => item.sku),
    pv: () => itens.filter(item => item.planoColab === "PV_MTO").map(item => item.sku),
    ids: () => cargaCrm().map(item => item.id),
    audits: () => audits,
    materializacoes: () => materializacoes,
    setStatus: (valor: string) => {
      status = valor;
    },
    setFalharInsert: (valor: boolean) => {
      falharInsert = valor;
    },
  };
}

function clienteDoPacote(lerPacote: () => PacotePipedrive) {
  const urls: string[] = [];
  const logs: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    urls.push(`${init?.method ?? "GET"} ${url.pathname}${url.search}`);
    expect(new Headers(init?.headers).get("x-api-token")).toBe("segredo-super");
    expect(url.toString()).not.toContain("segredo-super");
    const pacote = lerPacote();
    const path = url.pathname;
    let data: unknown = [];
    if (path === "/api/v2/deals") data = pacote.deals;
    else if (path === "/api/v2/deals/products") data = pacote.dealProducts;
    else if (path === "/api/v2/products") data = pacote.products;
    else if (path === "/api/v2/organizations") data = pacote.organizations;
    else if (path === "/v1/users") data = pacote.users;
    else if (path === "/v1/stages") data = pacote.stages;
    else if (path === "/v1/pipelines") data = pacote.pipelines;
    else if (path === "/v1/dealFields") data = pacote.dealFields;
    else if (path === "/v1/productFields") data = pacote.productFields;
    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { "x-ratelimit-remaining": "80", "x-ratelimit-reset": "2" },
    });
  };
  const config = configPadraoParaTeste();
  config.token = "segredo-super";
  const client = new PipedriveClient({
    baseUrl: config.apiBase,
    token: config.token,
    fetchImpl,
    sleep: async () => undefined,
    log: mensagem => logs.push(mensagem),
  });
  return {
    config,
    urls,
    logs,
    extrair: () => extrairPipedrive(client, config),
  };
}

describe("sync Pipedrive", () => {
  beforeEach(() => limparCacheCamposPipedrive());

  it("substitui a carga em transação, rejeita hash divergente e desfaz", async () => {
    let qtd = 10;
    const http = clienteDoPacote(() => pacoteComQuantidade(qtd));
    const memoria = criarMemoria();
    const previa = await previaPipedrive({
      config: http.config,
      repo: memoria.repo,
      extrair: http.extrair,
      cicloId: 7,
    });
    expect(previa.totais.quantidade).toBe(10);
    expect(http.urls.every(url => url.startsWith("GET "))).toBe(true);
    expect(http.urls.join(" ")).not.toContain("segredo-super");
    expect(http.logs.join(" ")).not.toContain("segredo-super");

    qtd = 11;
    await expect(
      syncPipedrive({
        config: http.config,
        repo: memoria.repo,
        extrair: http.extrair,
        cicloId: 7,
        previewHash: previa.previewHash,
        usuario: "pedro@example.com",
      })
    ).rejects.toMatchObject({ codigo: "HASH_DIVERGENTE" });
    expect(memoria.materializacoes()).toBe(0);
    expect(memoria.crm()).toEqual(["ANTIGO-A", "ANTIGO-B"]);

    qtd = 10;
    const gravado = await syncPipedrive({
      config: http.config,
      repo: memoria.repo,
      extrair: http.extrair,
      cicloId: 7,
      previewHash: previa.previewHash,
      usuario: "pedro@example.com",
    });
    expect(gravado.itensCriados).toBe(1);
    expect(gravado.quantidade).toBe(10);
    expect(memoria.crm()).toEqual(["80.01.000001"]);
    expect(memoria.pv()).toEqual(["PV-1"]);
    expect(memoria.audits()[0]?.usuario).toBe("pedro@example.com");
    expect(memoria.audits()[0]?.previewHash).toBe(previa.previewHash);
    expect(memoria.audits()[0]?.quantidade).toBe(10);

    const desfeito = await desfazerPipedrive({ repo: memoria.repo, cicloId: 7 });
    expect(desfeito.itensRestaurados).toBe(2);
    expect(memoria.crm().sort()).toEqual(["ANTIGO-A", "ANTIGO-B"]);
    expect(memoria.ids().every(id => id == null)).toBe(true);
    expect(memoria.pv()).toEqual(["PV-1"]);
    expect(memoria.audits()[0]?.desfeitoEm).toBeTruthy();
    await expect(desfazerPipedrive({ repo: memoria.repo, cicloId: 7 })).rejects.toBeInstanceOf(PipedriveSyncError);
  });

  it("desfaz o insert se a transação falha e recusa ciclo fora de colaboração", async () => {
    const http = clienteDoPacote(() => pacoteComQuantidade(10));
    const memoria = criarMemoria();
    const previa = await previaPipedrive({
      config: http.config,
      repo: memoria.repo,
      extrair: http.extrair,
      cicloId: 7,
    });
    memoria.setFalharInsert(true);
    await expect(
      syncPipedrive({
        config: http.config,
        repo: memoria.repo,
        extrair: http.extrair,
        cicloId: 7,
        previewHash: previa.previewHash,
        usuario: "pedro@example.com",
      })
    ).rejects.toThrow(/insert falhou/);
    expect(memoria.crm()).toEqual(["ANTIGO-A", "ANTIGO-B"]);
    expect(memoria.audits()).toHaveLength(0);

    memoria.setFalharInsert(false);
    memoria.setStatus("FECHADO");
    await expect(
      syncPipedrive({
        config: http.config,
        repo: memoria.repo,
        extrair: http.extrair,
        cicloId: 7,
        previewHash: previa.previewHash,
        usuario: "pedro@example.com",
      })
    ).rejects.toMatchObject({ codigo: "CICLO_FECHADO" });

    memoria.setStatus("ABERTO");
    await expect(
      previaPipedrive({
        config: http.config,
        repo: memoria.repo,
        extrair: http.extrair,
        cicloId: 7,
      })
    ).rejects.toMatchObject({ codigo: "FORA_COLABORACAO" });

    const semToken = configPadraoParaTeste();
    semToken.token = "";
    await expect(
      previaPipedrive({
        config: semToken,
        repo: memoria.repo,
        extrair: http.extrair,
        cicloId: 7,
      })
    ).rejects.toMatchObject({ codigo: "SEM_TOKEN" });
  });

  it("prepara o snapshot sem id", () => {
    const item = prepararItemCrm(
      { id: 9, cicloId: 1, sku: "80.01.000001", planoColab: "CRM", origem: "CRM", createdAt: "ontem" },
      7
    );
    expect(item.cicloId).toBe(7);
    expect(item.sku).toBe("80.01.000001");
    expect(item.id).toBeUndefined();
    expect(item.createdAt).toBeUndefined();
  });
});
