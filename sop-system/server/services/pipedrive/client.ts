/**
 * Cliente somente leitura da API do Pipedrive.
 * Nunca envia POST/PUT/PATCH/DELETE. O token vai no header `x-api-token`
 * e é removido de URL, log e mensagem de erro.
 */

export class PipedriveHttpError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "PipedriveHttpError";
  }
}

export type PipedriveClientOptions = {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  maxParallel?: number;
  maxTentativas?: number;
  log?: (mensagem: string) => void;
};

type Pagina = {
  data: unknown;
  nextCursor: string | null;
  nextStart: number | null;
};

const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);

export function mascararSegredoPipedrive(texto: string, token: string): string {
  let saida = texto.replace(/([?&]api_token=)[^&\s]+/gi, "$1***");
  if (token) saida = saida.split(token).join("***");
  return saida;
}

export function fatiarLista<T>(itens: readonly T[], tamanho: number): T[][] {
  const size = Math.max(1, Math.floor(tamanho));
  const out: T[][] = [];
  for (let i = 0; i < itens.length; i += size) out.push(itens.slice(i, i + size));
  return out;
}

function esperar(ms: number) {
  return new Promise<void>(resolve => {
    setTimeout(resolve, ms);
  });
}

export class PipedriveClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly timeoutMs: number;
  private readonly maxParallel: number;
  private readonly maxTentativas: number;
  private readonly log: (mensagem: string) => void;
  private ativo = 0;
  private fila: Array<() => void> = [];
  private bloqueadoAte = 0;

  constructor(opcoes: PipedriveClientOptions) {
    this.baseUrl = opcoes.baseUrl.replace(/\/+$/, "");
    this.token = opcoes.token;
    this.fetchImpl = opcoes.fetchImpl ?? fetch;
    this.sleep = opcoes.sleep ?? esperar;
    this.timeoutMs = opcoes.timeoutMs ?? 30_000;
    this.maxParallel = Math.min(3, Math.max(1, opcoes.maxParallel ?? 3));
    this.maxTentativas = opcoes.maxTentativas ?? 4;
    this.log = opcoes.log ?? (() => undefined);
  }

  async getJson(path: string, query: Record<string, string | number | undefined> = {}): Promise<Pagina> {
    return this.comLimite(() => this.getComRetry(path, query, 0));
  }

  async listarV2<T>(path: string, query: Record<string, string | number | undefined> = {}): Promise<T[]> {
    const todos: T[] = [];
    let cursor: string | undefined;
    for (let pagina = 0; pagina < 100; pagina++) {
      const resposta = await this.getJson(path, { ...query, limit: 500, cursor });
      const itens = Array.isArray(resposta.data) ? (resposta.data as T[]) : [];
      todos.push(...itens);
      if (!resposta.nextCursor) return todos;
      cursor = resposta.nextCursor;
    }
    throw new PipedriveHttpError("Paginação do Pipedrive excedeu 100 páginas.", 0);
  }

  async listarV1<T>(path: string, query: Record<string, string | number | undefined> = {}): Promise<T[]> {
    const todos: T[] = [];
    let start = 0;
    for (let pagina = 0; pagina < 100; pagina++) {
      const resposta = await this.getJson(path, { ...query, limit: 500, start });
      const itens = Array.isArray(resposta.data) ? (resposta.data as T[]) : [];
      todos.push(...itens);
      if (resposta.nextStart == null) return todos;
      start = resposta.nextStart;
    }
    throw new PipedriveHttpError("Paginação do Pipedrive excedeu 100 páginas.", 0);
  }

  private async comLimite<T>(fn: () => Promise<T>): Promise<T> {
    if (this.ativo >= this.maxParallel) {
      await new Promise<void>(resolve => this.fila.push(resolve));
    }
    this.ativo += 1;
    try {
      return await fn();
    } finally {
      this.ativo -= 1;
      const proximo = this.fila.shift();
      if (proximo) proximo();
    }
  }

  private async getComRetry(
    path: string,
    query: Record<string, string | number | undefined>,
    tentativa: number
  ): Promise<Pagina> {
    const url = this.montarUrl(path, query);
    const espera = this.bloqueadoAte - Date.now();
    if (espera > 0) await this.sleep(espera);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "x-api-token": this.token,
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      if (tentativa >= this.maxTentativas) {
        throw new PipedriveHttpError(
          `Falha de rede ao consultar o Pipedrive (${mascararSegredoPipedrive(url, this.token)}).`,
          0
        );
      }
      this.log(
        `Pipedrive rede em ${mascararSegredoPipedrive(url, this.token)}; nova tentativa ${tentativa + 1}.`
      );
      await this.sleep(500 * (tentativa + 1));
      return this.getComRetry(path, query, tentativa + 1);
    }

    this.anotarLimite(response);
    if (RETRY_STATUS.has(response.status) && tentativa < this.maxTentativas) {
      const reset = Number(response.headers.get("x-ratelimit-reset") || response.headers.get("retry-after") || 1);
      const pausa = Math.min(30_000, Math.max(200, (Number.isFinite(reset) ? reset : 1) * 1000));
      this.log(
        `Pipedrive HTTP ${response.status} em ${mascararSegredoPipedrive(url, this.token)}; nova tentativa ${tentativa + 1}.`
      );
      await this.sleep(pausa);
      return this.getComRetry(path, query, tentativa + 1);
    }

    const bruto = await response.text();
    if (!response.ok) {
      throw new PipedriveHttpError(
        `Pipedrive respondeu HTTP ${response.status} em ${mascararSegredoPipedrive(url, this.token)}: ${mascararSegredoPipedrive(bruto.slice(0, 300), this.token)}`,
        response.status
      );
    }
    let json: unknown = {};
    if (bruto) {
      try {
        json = JSON.parse(bruto);
      } catch {
        throw new PipedriveHttpError("Resposta do Pipedrive não é JSON.", response.status);
      }
    }
    if (json && typeof json === "object" && (json as { success?: unknown }).success === false) {
      const erro = customErro(json);
      throw new PipedriveHttpError(
        `Pipedrive recusou a consulta: ${mascararSegredoPipedrive(erro, this.token)}`,
        response.status
      );
    }
    return interpretarPagina(json);
  }

  private montarUrl(path: string, query: Record<string, string | number | undefined>): string {
    const url = new URL(path.startsWith("/") ? path : `/${path}`, `${this.baseUrl}/`);
    for (const [chave, valor] of Object.entries(query)) {
      if (valor === undefined || valor === null || valor === "") continue;
      if (chave.toLowerCase() === "api_token") continue;
      url.searchParams.set(chave, String(valor));
    }
    url.searchParams.delete("api_token");
    return url.toString();
  }

  private anotarLimite(response: Response) {
    const restante = Number(response.headers.get("x-ratelimit-remaining"));
    const reset = Number(response.headers.get("x-ratelimit-reset"));
    if (Number.isFinite(restante) && restante <= 1 && Number.isFinite(reset) && reset > 0) {
      this.bloqueadoAte = Math.max(this.bloqueadoAte, Date.now() + reset * 1000);
    }
  }
}

function customErro(json: unknown): string {
  if (!json || typeof json !== "object") return "erro desconhecido";
  const obj = json as { error?: unknown; error_info?: unknown };
  if (typeof obj.error === "string") return obj.error;
  if (typeof obj.error_info === "string") return obj.error_info;
  return "erro desconhecido";
}

function interpretarPagina(json: unknown): Pagina {
  const obj = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
  const adicional =
    obj.additional_data && typeof obj.additional_data === "object"
      ? (obj.additional_data as Record<string, unknown>)
      : {};
  const paginacao =
    adicional.pagination && typeof adicional.pagination === "object"
      ? (adicional.pagination as Record<string, unknown>)
      : {};
  const nextCursor = String(adicional.next_cursor ?? paginacao.next_cursor ?? "").trim();
  const mais = paginacao.more_items_in_collection === true;
  const nextStart = mais && paginacao.next_start != null ? Number(paginacao.next_start) : null;
  return {
    data: obj.data ?? [],
    nextCursor: nextCursor || null,
    nextStart: nextStart != null && Number.isFinite(nextStart) ? nextStart : null,
  };
}
