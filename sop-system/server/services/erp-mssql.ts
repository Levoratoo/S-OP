import sql from "mssql";

export type ErpMssqlConfig = {
  server: string;
  instanceName?: string;
  port?: number;
  database: string;
  user: string;
  password: string;
  encrypt?: boolean;
  trustServerCertificate?: boolean;
  requestTimeoutMs?: number;
  connectionTimeoutMs?: number;
};

export type ErpYearCount = {
  year: number;
  count: number;
};

let pool: sql.ConnectionPool | null = null;
let poolKey = "";

function readConfig(): ErpMssqlConfig {
  const serverRaw = (process.env.ERP_MSSQL_SERVER || "VMDB2\\VMDB2").trim();
  let server = serverRaw;
  let instanceName = (process.env.ERP_MSSQL_INSTANCE || "").trim() || undefined;

  if (serverRaw.includes("\\")) {
    const [host, instance] = serverRaw.split("\\");
    server = host;
    instanceName = instanceName || instance;
  }

  const portEnv = process.env.ERP_MSSQL_PORT?.trim();
  const port = portEnv ? Number(portEnv) : undefined;

  return {
    server,
    instanceName: port ? undefined : instanceName,
    port: Number.isFinite(port) ? port : undefined,
    database: (process.env.ERP_MSSQL_DATABASE || "MetricsPROD").trim(),
    user: (process.env.ERP_MSSQL_USER || "mitraconnect").trim(),
    password: process.env.ERP_MSSQL_PASSWORD || "",
    encrypt: (process.env.ERP_MSSQL_ENCRYPT || "false").toLowerCase() === "true",
    trustServerCertificate:
      (process.env.ERP_MSSQL_TRUST_CERT || "true").toLowerCase() !== "false",
    requestTimeoutMs: Number(process.env.ERP_MSSQL_REQUEST_TIMEOUT_MS || 600_000),
    connectionTimeoutMs: Number(process.env.ERP_MSSQL_CONNECTION_TIMEOUT_MS || 30_000),
  };
}

export function getErpMssqlConfig(): ErpMssqlConfig {
  const cfg = readConfig();
  if (!cfg.password) {
    throw new Error(
      "ERP_MSSQL_PASSWORD não configurada. Defina as variáveis ERP_MSSQL_* no .env."
    );
  }
  return cfg;
}

function configKey(cfg: ErpMssqlConfig) {
  return [
    cfg.server,
    cfg.instanceName || "",
    cfg.port || "",
    cfg.database,
    cfg.user,
  ].join("|");
}

export async function getErpPool(): Promise<sql.ConnectionPool> {
  const cfg = getErpMssqlConfig();
  const key = configKey(cfg);
  if (pool?.connected && poolKey === key) return pool;

  if (pool) {
    try {
      await pool.close();
    } catch {
      // ignore
    }
    pool = null;
  }

  const options: sql.config = {
    server: cfg.server,
    database: cfg.database,
    user: cfg.user,
    password: cfg.password,
    port: cfg.port,
    options: {
      encrypt: cfg.encrypt ?? false,
      trustServerCertificate: cfg.trustServerCertificate ?? true,
      instanceName: cfg.instanceName,
      enableArithAbort: true,
    },
    connectionTimeout: cfg.connectionTimeoutMs,
    requestTimeout: cfg.requestTimeoutMs,
    pool: {
      max: 5,
      min: 0,
      idleTimeoutMillis: 30_000,
    },
  };

  pool = await new sql.ConnectionPool(options).connect();
  poolKey = key;
  return pool;
}

export async function closeErpPool() {
  if (!pool) return;
  try {
    await pool.close();
  } finally {
    pool = null;
    poolKey = "";
  }
}

/**
 * Fonte do relatório “Itens Faturados”.
 * No MetricsPROD o objeto real é a view Mitra (o .sql legado usava alias `faturamento`).
 */
export const FATURAMENTO_ERP_SOURCE =
  process.env.ERP_FATURAMENTO_SOURCE?.trim() || "dbo.Usr_VIEW_MITRA_FAT_02";

/** Data inicial do histórico (YYYY-MM-DD). Padrão: 2020-01-01. */
export function defaultDesdeDate(): string {
  const env = process.env.ERP_FATURAMENTO_DESDE?.trim();
  if (env) return env;
  return "2020-01-01";
}

const FATURAMENTO_SELECT = `
  usr_marca AS Marca,
  usr_grupo AS Grupo,
  usr_UFMatriz AS [UF_Marca],
  usr_RamoAtuacao AS [Ramo_Atuacao],
  DescItem AS [Descricao_Item],
  usr_acabado AS Tipo,
  CODMATERIAL AS [Cod_Material],
  CGC AS CNPJ,
  codclientes AS [Cod_Cliente],
  NOME AS Cliente,
  UnidadeAlfa AS Unidade,
  NUMNOTA AS NF,
  Estado AS UF,
  Cidade AS Cidade,
  DATAEMISSAO AS Emissao,
  QUANTIDADE AS Qtd,
  VALORITEMLIQUIDO AS Total,
  Descricao AS [Linha_Prod],
  NOMEVENDEDOR AS Representante,
  CFOP AS CFOP,
  DESCCFOP AS [Desc_CFOP],
  NOMECLIENTE AS [Razao_Social],
  PgtoFrete AS Frete,
  MOTIVOCANCELNF AS [Motivo_Canc],
  observacao1 AS Observacao,
  OBSItemPedido AS [OBS_Item_Pedido],
  CONDPAGTO AS CONDPAGTO,
  QuantidadeDeVolumes AS [Qtde_Volume],
  AliquotaICMS AS ICMS,
  AliquotaIPI AS IPI,
  AliquotaISS AS ISS,
  DESCONTO AS Desconto
`;

/** Query adaptada do relatório “Itens Faturados” (MetricsPROD / Mitra). */
export function buildFaturamentoErpQuery(): { sqlText: string; desde: string } {
  const desde = defaultDesdeDate();
  const sqlText = `
SELECT
${FATURAMENTO_SELECT}
FROM ${FATURAMENTO_ERP_SOURCE}
WHERE DATAEMISSAO >= @desde
ORDER BY DATAEMISSAO DESC
`;
  return { sqlText, desde };
}

/** Janela [inicio, fim) em YYYY-MM-DD. */
export function buildFaturamentoErpRangeQuery(): { sqlText: string } {
  const sqlText = `
SELECT
${FATURAMENTO_SELECT}
FROM ${FATURAMENTO_ERP_SOURCE}
WHERE DATAEMISSAO >= @inicio AND DATAEMISSAO < @fim
ORDER BY DATAEMISSAO DESC
`;
  return { sqlText };
}

export async function queryErpFaturamentoRows(): Promise<{
  rows: Record<string, unknown>[];
  desde: string;
  source: string;
}> {
  const erp = await getErpPool();
  const { sqlText, desde } = buildFaturamentoErpQuery();
  const result = await erp
    .request()
    .input("desde", sql.Date, new Date(`${desde}T00:00:00`))
    .query(sqlText);
  return {
    rows: (result.recordset || []) as Record<string, unknown>[],
    desde,
    source: FATURAMENTO_ERP_SOURCE,
  };
}

/** Busca faturamento no intervalo [inicio, fim) (YYYY-MM-DD). */
export async function queryErpFaturamentoRowsInRange(
  inicio: string,
  fim: string
): Promise<{
  rows: Record<string, unknown>[];
  inicio: string;
  fim: string;
  source: string;
}> {
  const erp = await getErpPool();
  const { sqlText } = buildFaturamentoErpRangeQuery();
  const result = await erp
    .request()
    .input("inicio", sql.Date, new Date(`${inicio}T00:00:00`))
    .input("fim", sql.Date, new Date(`${fim}T00:00:00`))
    .query(sqlText);
  return {
    rows: (result.recordset || []) as Record<string, unknown>[],
    inicio,
    fim,
    source: FATURAMENTO_ERP_SOURCE,
  };
}

export async function countErpFaturamentoByYear(desde?: string): Promise<ErpYearCount[]> {
  const desdeDate = desde || defaultDesdeDate();
  const erp = await getErpPool();
  const result = await erp
    .request()
    .input("desde", sql.Date, new Date(`${desdeDate}T00:00:00`))
    .query(`
      SELECT
        YEAR(DATAEMISSAO) AS ano,
        COUNT(*) AS qtd
      FROM ${FATURAMENTO_ERP_SOURCE}
      WHERE DATAEMISSAO >= @desde
      GROUP BY YEAR(DATAEMISSAO)
      ORDER BY ano
    `);

  return (result.recordset || []).map((row: { ano: number; qtd: number }) => ({
    year: Number(row.ano),
    count: Number(row.qtd),
  }));
}

/**
 * Fonte Pedidos Comercial / S&OP — PV aberto (MetricsPROD).
 * View com StatusPedido, usr_acabado (JIT/PRG/VAR) e cronograma de entrega.
 */
export const CARTEIRA_ERP_SOURCE =
  process.env.ERP_CARTEIRA_SOURCE?.trim() || "dbo.View_Usr_PedidoVenda_SEOP1";

export type ErpCarteiraAbertoRow = {
  codigo: string;
  sku: string;
  competencia: string;
  quantidade: number;
  receitaBruta: number;
  sequencia: number;
};

/**
 * Pedidos em aberto: Status Liberado + tipo PRG.
 * Uma linha por pedido × SKU × mês de entrega (soma das parcelas abertas).
 */
export async function queryErpCarteiraPedidosAbertos(): Promise<{
  rows: ErpCarteiraAbertoRow[];
  source: string;
  fetched: number;
}> {
  const erp = await getErpPool();
  const sqlText = `
WITH abertos AS (
  SELECT
    LTRIM(RTRIM(CAST(NumPedido AS nvarchar(50)))) AS codigo,
    LTRIM(RTRIM(CAST(CodItemEstoque AS nvarchar(80)))) AS sku,
    YEAR(DataEntrega) AS anoEnt,
    MONTH(DataEntrega) AS mesEnt,
    CAST(ISNULL(Qtde, 0) AS float) AS qtde,
    CAST(ISNULL(PrecoUnitario, 0) AS float) AS preco
  FROM ${CARTEIRA_ERP_SOURCE}
  WHERE StatusPedido = N'Liberado'
    AND UPPER(LTRIM(RTRIM(ISNULL(usr_acabado, N'')))) = N'PRG'
    AND ISNULL(Encerrado, N'N') = N'N'
    AND ISNULL(Qtde, 0) > 0
    AND DataEntrega IS NOT NULL
),
agg AS (
  SELECT
    codigo,
    sku,
    anoEnt,
    mesEnt,
    SUM(qtde) AS quantidade,
    SUM(qtde * preco) AS receitaBruta
  FROM abertos
  WHERE codigo <> N'' AND sku <> N''
  GROUP BY codigo, sku, anoEnt, mesEnt
)
SELECT
  codigo,
  sku,
  anoEnt,
  mesEnt,
  quantidade,
  receitaBruta,
  ROW_NUMBER() OVER (
    PARTITION BY codigo
    ORDER BY anoEnt, mesEnt, sku
  ) AS sequencia
FROM agg
ORDER BY codigo, sequencia
`;

  const result = await erp.request().query(sqlText);
  const raw = (result.recordset || []) as Array<{
    codigo: string;
    sku: string;
    anoEnt: number;
    mesEnt: number;
    quantidade: number;
    receitaBruta: number;
    sequencia: number;
  }>;

  const rows: ErpCarteiraAbertoRow[] = raw.map(r => {
    const y = Number(r.anoEnt);
    const m = Number(r.mesEnt);
    const competencia = `${y}-${String(m).padStart(2, "0")}-01`;
    return {
      codigo: String(r.codigo || "").trim(),
      sku: String(r.sku || "").trim(),
      competencia,
      quantidade: Number(r.quantidade) || 0,
      receitaBruta: Number(r.receitaBruta) || 0,
      sequencia: Number(r.sequencia) || 1,
    };
  });

  return {
    rows,
    source: CARTEIRA_ERP_SOURCE,
    fetched: rows.length,
  };
}

export async function testErpConnection(): Promise<{
  ok: boolean;
  server: string;
  database: string;
  source: string;
  desde: string;
  sampleCount: number;
  yearCounts: ErpYearCount[];
  message: string;
}> {
  const cfg = getErpMssqlConfig();
  const erp = await getErpPool();
  const desde = defaultDesdeDate();
  const result = await erp
    .request()
    .input("desde", sql.Date, new Date(`${desde}T00:00:00`))
    .query(`
      SELECT TOP 1
        CODMATERIAL AS cod,
        DATAEMISSAO AS emissao,
        QUANTIDADE AS qtd
      FROM ${FATURAMENTO_ERP_SOURCE}
      WHERE DATAEMISSAO >= @desde
      ORDER BY DATAEMISSAO DESC
    `);

  let yearCounts: ErpYearCount[] = [];
  try {
    yearCounts = await countErpFaturamentoByYear(desde);
  } catch {
    yearCounts = [];
  }

  const serverLabel = cfg.port
    ? `${cfg.server}:${cfg.port}`
    : cfg.instanceName
      ? `${cfg.server}\\${cfg.instanceName}`
      : cfg.server;
  return {
    ok: true,
    server: serverLabel,
    database: cfg.database,
    source: FATURAMENTO_ERP_SOURCE,
    desde,
    sampleCount: result.recordset?.length ?? 0,
    yearCounts,
    message: `Conexão OK com ${FATURAMENTO_ERP_SOURCE}`,
  };
}
