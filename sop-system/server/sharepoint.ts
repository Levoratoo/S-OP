import axios from "axios";
import * as XLSX from "xlsx";
import { getDb } from "./db";
import { sharepointConfig, syncLogs, produtos, faturamento, clientes } from "../drizzle/schema";
import { eq, sql } from "drizzle-orm";

// ==================== TIPOS ====================
interface SharePointConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  siteUrl: string;
  folderPath: string;
  arquivoProdutos: string;
  arquivoFaturamento: string;
  arquivoClientes: string;
}

interface AccessTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface DriveItem {
  id: string;
  name: string;
  size: number;
  lastModifiedDateTime: string;
  "@microsoft.graph.downloadUrl"?: string;
}

// ==================== AUTENTICAÇÃO ====================
async function getAccessToken(config: SharePointConfig): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`;
  
  const params = new URLSearchParams();
  params.append("client_id", config.clientId);
  params.append("client_secret", config.clientSecret);
  params.append("scope", "https://graph.microsoft.com/.default");
  params.append("grant_type", "client_credentials");
  
  const response = await axios.post<AccessTokenResponse>(tokenUrl, params, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  
  return response.data.access_token;
}

// ==================== OPERAÇÕES SHAREPOINT ====================
async function getSiteId(accessToken: string, siteUrl: string): Promise<string> {
  // Extrair hostname e path do site URL
  const url = new URL(siteUrl);
  const hostname = url.hostname;
  const sitePath = url.pathname;
  
  const response = await axios.get(
    `https://graph.microsoft.com/v1.0/sites/${hostname}:${sitePath}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  
  return response.data.id;
}

async function getDriveId(accessToken: string, siteId: string): Promise<string> {
  const response = await axios.get(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drive`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  
  return response.data.id;
}

async function listFilesInFolder(
  accessToken: string,
  siteId: string,
  driveId: string,
  folderPath: string
): Promise<DriveItem[]> {
  const encodedPath = encodeURIComponent(folderPath);
  const response = await axios.get(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drives/${driveId}/root:/${encodedPath}:/children`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  
  return response.data.value;
}

async function downloadFile(accessToken: string, downloadUrl: string): Promise<Buffer> {
  const response = await axios.get(downloadUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
    responseType: "arraybuffer",
  });
  
  return Buffer.from(response.data);
}

// ==================== PROCESSAMENTO DE ARQUIVOS ====================
function parseExcelFile(buffer: Buffer): Record<string, unknown>[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet);
}

// ==================== SINCRONIZAÇÃO DE DADOS ====================
async function syncProdutos(data: Record<string, unknown>[]): Promise<{ inseridos: number; atualizados: number; erros: number }> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");
  
  let inseridos = 0;
  let atualizados = 0;
  let erros = 0;
  
  for (const row of data) {
    try {
      const codItem = String(row["Cod Item"] || row["codItem"] || row["codigo"] || "");
      if (!codItem) {
        erros++;
        continue;
      }
      
      const produtoData = {
        codItem,
        nome: String(row["Descrição"] || row["descricao"] || row["nome"] || ""),
        codigo: codItem,
        tipoNegocio: String(row["Tipo Negocio"] || row["tipoNegocio"] || ""),
        tipoEstoque: (String(row["Tipo Estoque"] || row["tipoEstoque"] || "").toUpperCase() === "MTS" ? "MTS" : String(row["Tipo Estoque"] || row["tipoEstoque"] || "").toUpperCase() === "MTO" ? "MTO" : "MTS") as "MTS" | "MTO",
        linha: String(row["Linha"] || row["linha"] || ""),
        modelo: String(row["Modelo"] || row["modelo"] || ""),
        tamanho: String(row["Tamanho"] || row["tamanho"] || ""),
        axlxp: String(row["A X L X P"] || row["axlxp"] || ""),
        marca: String(row["Marca"] || row["marca"] || ""),
        grupo: String(row["Grupo"] || row["grupo"] || ""),
        ramoAtuacao: String(row["Ramo Atuação"] || row["ramoAtuacao"] || ""),
        valorVenda: row["Valor Venda"] ? String(row["Valor Venda"]) : null,
        valorCusto: row["Valor Custo"] ? String(row["Valor Custo"]) : null,
        qtdePallet: row["Qtde Pallet"] ? Number(row["Qtde Pallet"]) : null,
        loteEconomicoViavel: row["Lote Economico Viável"] ? Number(row["Lote Economico Viável"]) : null,
        fluxo: String(row["Fluxo"] || row["fluxo"] || ""),
        caminho: String(row["Caminho"] || row["caminho"] || ""),
        pista: row["Pista"] ? Number(row["Pista"]) : null,
        ativo: String(row["Status"] || "Ativo").toLowerCase() === "ativo",
      };
      
      // Verificar se produto já existe pelo codItem
      const existing = await db.select().from(produtos).where(eq(produtos.codItem, codItem)).limit(1);
      
      if (existing.length > 0) {
        await db.update(produtos).set(produtoData).where(eq(produtos.codItem, codItem));
        atualizados++;
      } else {
        await db.insert(produtos).values(produtoData);
        inseridos++;
      }
    } catch (error) {
      console.error("Erro ao processar produto:", error);
      erros++;
    }
  }
  
  return { inseridos, atualizados, erros };
}

async function syncFaturamento(data: Record<string, unknown>[]): Promise<{ inseridos: number; atualizados: number; erros: number }> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");
  
  let inseridos = 0;
  let erros = 0;
  
  for (const row of data) {
    try {
      // Processar data de emissão
      let dataEmissao: Date | null = null;
      const dataRaw = row["Data Emissão"] || row["dataEmissao"] || row["Data"];
      if (dataRaw) {
        if (typeof dataRaw === "number") {
          // Excel serial date
          dataEmissao = new Date((dataRaw - 25569) * 86400 * 1000);
        } else {
          dataEmissao = new Date(String(dataRaw));
        }
      }
      
      if (!dataEmissao || isNaN(dataEmissao.getTime())) {
        erros++;
        continue;
      }
      
      const faturamentoData = {
        dataEmissao,
        codCliente: String(row["Cod. Cliente"] || row["codCliente"] || ""),
        cnpj: String(row["CNPJ"] || row["cnpj"] || ""),
        unidade: String(row["Unidade"] || row["unidade"] || ""),
        nfNumero: String(row["Nº da NF"] || row["nfNumero"] || ""),
        cidade: String(row["Cidade"] || row["cidade"] || ""),
        uf: String(row["UF"] || row["uf"] || ""),
        marca: String(row["Marca"] || row["marca"] || ""),
        codMaterial: String(row["Cod. Material"] || row["codMaterial"] || ""),
        descricaoItem: String(row["Descrição Item"] || row["descricaoItem"] || ""),
        tipoNegocio: String(row["Tipo Negocio"] || row["tipoNegocio"] || ""),
        tipoEstoque: (String(row["Tipo Estoque"] || row["tipoEstoque"] || "").toUpperCase() === "MTS" ? "MTS" : String(row["Tipo Estoque"] || row["tipoEstoque"] || "").toUpperCase() === "MTO" ? "MTO" : null) as "MTS" | "MTO" | null,
        linhaProduto: String(row["Linha Produto"] || row["linhaProduto"] || ""),
        qtd: String(row["Qtd."] || row["qtd"] || "0"),
        valorTotal: row["Valor Total"] || row["valorTotal"] ? String(row["Valor Total"] || row["valorTotal"]) : "0",
        gestor: String(row["Gestor"] || row["gestor"] || ""),
        cfop: String(row["CFOP"] || row["cfop"] || ""),
        descCfop: String(row["Desc. CFOP"] || row["descCfop"] || ""),
        tipoFaturamento: (String(row["Tipo de Fatur."] || row["tipoFaturamento"] || "").toUpperCase().includes("DEVOLUCAO") || String(row["Tipo de Fatur."] || row["tipoFaturamento"] || "").toUpperCase().includes("DEVOLUÇÃO") ? "DEVOLUCAO" : "SAIDA") as "DEVOLUCAO" | "SAIDA",
      };
      
      await db.insert(faturamento).values(faturamentoData);
      inseridos++;
    } catch (error) {
      console.error("Erro ao processar faturamento:", error);
      erros++;
    }
  }
  
  return { inseridos, atualizados: 0, erros };
}

async function syncClientes(data: Record<string, unknown>[]): Promise<{ inseridos: number; atualizados: number; erros: number }> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");
  
  let inseridos = 0;
  let atualizados = 0;
  let erros = 0;
  
  for (const row of data) {
    try {
      const codigo = String(row["Código"] || row["codigo"] || row["Cod. Cliente"] || "");
      if (!codigo) {
        erros++;
        continue;
      }
      
      const clienteData = {
        codigo,
        razaoSocial: String(row["Razão Social"] || row["razaoSocial"] || row["nome"] || ""),
        nomeFantasia: String(row["Nome Fantasia"] || row["nomeFantasia"] || ""),
        cnpj: String(row["CNPJ"] || row["cnpj"] || ""),
        cidade: String(row["Cidade"] || row["cidade"] || ""),
        uf: String(row["UF"] || row["uf"] || ""),
        segmento: String(row["Segmento"] || row["segmento"] || ""),
        ativo: String(row["Status"] || "Ativo").toLowerCase() === "ativo",
      };
      
      // Verificar se cliente já existe pelo código
      const existing = await db.select().from(clientes).where(eq(clientes.codigo, codigo)).limit(1);
      
      if (existing.length > 0) {
        await db.update(clientes).set(clienteData).where(eq(clientes.codigo, codigo));
        atualizados++;
      } else {
        await db.insert(clientes).values(clienteData);
        inseridos++;
      }
    } catch (error) {
      console.error("Erro ao processar cliente:", error);
      erros++;
    }
  }
  
  return { inseridos, atualizados, erros };
}

// ==================== FUNÇÃO PRINCIPAL DE SINCRONIZAÇÃO ====================
export async function executarSincronizacao(
  tipo: "produtos" | "faturamento" | "clientes" | "todos",
  executadoPor: string = "sistema"
): Promise<{ sucesso: boolean; mensagem: string }> {
  const db = await getDb();
  if (!db) return { sucesso: false, mensagem: "Banco de dados não disponível" };
  
  const inicio = Date.now();
  
  // Buscar configuração do SharePoint
  const configs = await db.select().from(sharepointConfig).where(eq(sharepointConfig.ativo, true)).limit(1);
  
  if (configs.length === 0) {
    return { sucesso: false, mensagem: "Configuração do SharePoint não encontrada ou inativa" };
  }
  
  const config = configs[0];
  
  if (!config.tenantId || !config.clientId || !config.clientSecret || !config.siteUrl) {
    return { sucesso: false, mensagem: "Configuração do SharePoint incompleta" };
  }
  
  // Registrar início da sincronização
  const [logResult] = await db.insert(syncLogs).values({
    tipo,
    status: "iniciado",
    executadoPor,
    arquivoOrigem: config.folderPath || "",
  });
  
  const logId = logResult.insertId;
  
  try {
    // Obter token de acesso
    const accessToken = await getAccessToken({
      tenantId: config.tenantId,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      siteUrl: config.siteUrl,
      folderPath: config.folderPath || "",
      arquivoProdutos: config.arquivoProdutos || "produtos.xlsx",
      arquivoFaturamento: config.arquivoFaturamento || "faturamento.xlsx",
      arquivoClientes: config.arquivoClientes || "clientes.xlsx",
    });
    
    // Obter IDs do site e drive
    const siteId = await getSiteId(accessToken, config.siteUrl);
    const driveId = await getDriveId(accessToken, siteId);
    
    // Listar arquivos na pasta
    const files = await listFilesInFolder(accessToken, siteId, driveId, config.folderPath || "");
    
    let totalProcessados = 0;
    let totalInseridos = 0;
    let totalAtualizados = 0;
    let totalErros = 0;
    
    // Processar arquivos conforme o tipo
    const tiposParaProcessar = tipo === "todos" ? ["produtos", "faturamento", "clientes"] : [tipo];
    
    for (const tipoArquivo of tiposParaProcessar) {
      let nomeArquivo = "";
      switch (tipoArquivo) {
        case "produtos":
          nomeArquivo = config.arquivoProdutos || "produtos.xlsx";
          break;
        case "faturamento":
          nomeArquivo = config.arquivoFaturamento || "faturamento.xlsx";
          break;
        case "clientes":
          nomeArquivo = config.arquivoClientes || "clientes.xlsx";
          break;
      }
      
      const arquivo = files.find(f => f.name.toLowerCase() === nomeArquivo.toLowerCase());
      
      if (arquivo && arquivo["@microsoft.graph.downloadUrl"]) {
        const buffer = await downloadFile(accessToken, arquivo["@microsoft.graph.downloadUrl"]);
        const data = parseExcelFile(buffer);
        
        let resultado: { inseridos: number; atualizados: number; erros: number };
        
        switch (tipoArquivo) {
          case "produtos":
            resultado = await syncProdutos(data);
            break;
          case "faturamento":
            resultado = await syncFaturamento(data);
            break;
          case "clientes":
            resultado = await syncClientes(data);
            break;
          default:
            resultado = { inseridos: 0, atualizados: 0, erros: 0 };
        }
        
        totalProcessados += data.length;
        totalInseridos += resultado.inseridos;
        totalAtualizados += resultado.atualizados;
        totalErros += resultado.erros;
      }
    }
    
    const duracao = Math.round((Date.now() - inicio) / 1000);
    
    // Atualizar log com sucesso
    await db.update(syncLogs).set({
      status: totalErros > 0 ? "parcial" : "sucesso",
      registrosProcessados: totalProcessados,
      registrosInseridos: totalInseridos,
      registrosAtualizados: totalAtualizados,
      registrosErro: totalErros,
      duracaoSegundos: duracao,
      mensagem: `Sincronização concluída: ${totalInseridos} inseridos, ${totalAtualizados} atualizados, ${totalErros} erros`,
    }).where(eq(syncLogs.id, Number(logId)));
    
    // Atualizar última sincronização na config
    await db.update(sharepointConfig).set({
      ultimaSincronizacao: new Date(),
    }).where(eq(sharepointConfig.id, config.id));
    
    return {
      sucesso: true,
      mensagem: `Sincronização concluída: ${totalInseridos} inseridos, ${totalAtualizados} atualizados, ${totalErros} erros`,
    };
    
  } catch (error) {
    const duracao = Math.round((Date.now() - inicio) / 1000);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    
    // Atualizar log com erro
    await db.update(syncLogs).set({
      status: "erro",
      duracaoSegundos: duracao,
      mensagem: "Erro durante a sincronização",
      detalhesErro: errorMessage,
    }).where(eq(syncLogs.id, Number(logId)));
    
    return { sucesso: false, mensagem: `Erro: ${errorMessage}` };
  }
}

// ==================== FUNÇÕES DE CONFIGURAÇÃO ====================
export async function getSharepointConfig() {
  const db = await getDb();
  if (!db) return null;
  
  const configs = await db.select().from(sharepointConfig).limit(1);
  return configs.length > 0 ? configs[0] : null;
}

export async function saveSharepointConfig(data: Partial<SharePointConfig & { intervaloHoras?: number; ativo?: boolean }>) {
  const db = await getDb();
  if (!db) return null;
  
  const existing = await db.select().from(sharepointConfig).limit(1);
  
  if (existing.length > 0) {
    await db.update(sharepointConfig).set(data).where(eq(sharepointConfig.id, existing[0].id));
    return { ...existing[0], ...data };
  } else {
    const [result] = await db.insert(sharepointConfig).values(data as typeof sharepointConfig.$inferInsert);
    return { id: result.insertId, ...data };
  }
}

export async function getSyncLogs(limit: number = 50) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(syncLogs).orderBy(sql`${syncLogs.createdAt} DESC`).limit(limit);
}

export async function testarConexaoSharepoint(): Promise<{ sucesso: boolean; mensagem: string }> {
  const db = await getDb();
  if (!db) return { sucesso: false, mensagem: "Banco de dados não disponível" };
  
  const configs = await db.select().from(sharepointConfig).limit(1);
  
  if (configs.length === 0) {
    return {
      sucesso: false,
      mensagem:
        "Nenhuma configuração salva. Preencha as credenciais reais e clique em Salvar antes de testar.",
    };
  }
  
  const config = configs[0];
  
  if (!config.tenantId || !config.clientId || !config.clientSecret || !config.siteUrl) {
    return {
      sucesso: false,
      mensagem:
        "Configuração incompleta: informe Tenant ID, Client ID, Client Secret e Site URL reais antes de testar a conexão.",
    };
  }
  
  try {
    const accessToken = await getAccessToken({
      tenantId: config.tenantId,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      siteUrl: config.siteUrl,
      folderPath: config.folderPath || "",
      arquivoProdutos: config.arquivoProdutos || "produtos.xlsx",
      arquivoFaturamento: config.arquivoFaturamento || "faturamento.xlsx",
      arquivoClientes: config.arquivoClientes || "clientes.xlsx",
    });
    
    const siteId = await getSiteId(accessToken, config.siteUrl);
    const driveId = await getDriveId(accessToken, siteId);
    const files = await listFilesInFolder(accessToken, siteId, driveId, config.folderPath || "");
    
    return {
      sucesso: true,
      mensagem: `Conexão bem-sucedida! ${files.length} arquivo(s) encontrado(s) na pasta.`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return { sucesso: false, mensagem: `Erro de conexão: ${errorMessage}` };
  }
}
