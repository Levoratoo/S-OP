import { afterEach, describe, expect, it } from "vitest";
import { configPadraoParaTeste } from "@shared/pipedrive-crm";
import { fatiarLista, mascararSegredoPipedrive, PipedriveClient, PipedriveHttpError } from "./client";
import { extrairPipedrive, limparCacheCamposPipedrive } from "./extract";
import { pacoteFicticio } from "./fixture";

function resposta(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "x-ratelimit-remaining": "90",
      "x-ratelimit-reset": "2",
      ...headers,
    },
  });
}

describe("cliente Pipedrive", () => {
  afterEach(() => limparCacheCamposPipedrive());

  it("fatiar lista e mascarar token", () => {
    expect(fatiarLista([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(mascararSegredoPipedrive("https://api.pipedrive.com/v1/deals?api_token=segredo", "segredo")).not.toContain(
      "segredo"
    );
  });

  it("usa o header, omite api_token da URL e tenta de novo em 429 e 5xx", async () => {
    const urls: string[] = [];
    const logs: string[] = [];
    let chamadas = 0;
    const fetchImpl: typeof fetch = async (input, init) => {
      chamadas += 1;
      const url = String(input);
      urls.push(url);
      expect(init?.method).toBe("GET");
      expect(new Headers(init?.headers).get("x-api-token")).toBe("segredo-super");
      expect(url).not.toContain("segredo-super");
      if (chamadas === 1) return resposta({ success: false }, 429, { "x-ratelimit-reset": "0" });
      if (chamadas === 2) return resposta({ error: "instavel" }, 503);
      return resposta({
        success: true,
        data: [{ id: 1 }],
        additional_data: { next_cursor: chamadas === 3 ? "pagina-2" : null },
      });
    };
    const client = new PipedriveClient({
      baseUrl: "https://api.pipedrive.com",
      token: "segredo-super",
      fetchImpl,
      sleep: async () => undefined,
      log: mensagem => logs.push(mensagem),
    });
    const pagina = await client.listarV2<{ id: number }>("/api/v2/deals", { api_token: "segredo-super", status: "open" });
    expect(pagina.map(item => item.id)).toEqual([1, 1]);
    expect(urls.every(url => !url.includes("api_token"))).toBe(true);
    expect(logs.join(" ")).not.toContain("segredo-super");
    expect(chamadas).toBe(4);
  });

  it("não repete erro 400", async () => {
    let chamadas = 0;
    const fetchImpl: typeof fetch = async () => {
      chamadas += 1;
      return resposta({ error: "ruim" }, 400);
    };
    const client = new PipedriveClient({
      baseUrl: "https://api.pipedrive.com",
      token: "abc",
      fetchImpl,
      sleep: async () => undefined,
    });
    await expect(client.getJson("/v1/users")).rejects.toBeInstanceOf(PipedriveHttpError);
    expect(chamadas).toBe(1);
  });

  it("extrai o pacote só com GET e reaproveita dealFields", async () => {
    const pacote = pacoteFicticio();
    const caminhos: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      caminhos.push(url.pathname);
      expect(init?.method).toBe("GET");
      expect(url.search).not.toContain("token-de-teste");
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
      return resposta({ success: true, data });
    };
    const config = configPadraoParaTeste();
    const client = new PipedriveClient({
      baseUrl: config.apiBase,
      token: "token-de-teste",
      fetchImpl,
      sleep: async () => undefined,
    });
    const primeiro = await extrairPipedrive(client, config);
    const segundo = await extrairPipedrive(client, config);
    expect(primeiro.deals).toHaveLength(pacote.deals.length);
    expect(segundo.dealFields).toEqual(pacote.dealFields);
    expect(caminhos.filter(caminho => caminho === "/v1/dealFields")).toHaveLength(1);
    expect(caminhos.every(caminho => caminho.startsWith("/api/v2/") || caminho.startsWith("/v1/"))).toBe(true);
  });
});
