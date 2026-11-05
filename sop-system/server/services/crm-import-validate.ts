import { validateCrmExcelHeaders, CrmExcelLayoutError } from "@shared/crm-excel-layout";
import { TRPCError } from "@trpc/server";

export function assertCrmExcelHeaders(headers: string[]) {
  try {
    validateCrmExcelHeaders(headers);
  } catch (err) {
    if (err instanceof CrmExcelLayoutError) {
      throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
    }
    throw err;
  }
}

export type CrmImportRowPayload = {
  sku: string;
  descricao?: string;
  marca?: string;
  gestor?: string;
  temperatura?: string;
  tipo?: string;
  valorVenda?: number;
  qtdeTotal?: number;
  valorTotal?: number;
  qtdMes?: number;
  valorTotalMes?: number;
  modalidade?: string;
  tipoNegocio?: string;
};

/** Garante que a importação veio do layout de 15 colunas (SKU/produto obrigatório). */
export function assertCrmImportRows(rows: CrmImportRowPayload[]) {
  if (!rows.length) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Planilha CRM sem linhas de dados." });
  }
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (!String(row.sku || "").trim()) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Linha ${i + 2} do CRM: coluna Produto/SKU vazia.`,
      });
    }
  }
}
