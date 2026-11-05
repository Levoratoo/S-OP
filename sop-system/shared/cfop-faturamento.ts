/** CFOPs que entram na base de faturamento do S&OP. Qualquer outro é descartado. */
export const CFOPS_FATURAMENTO_PERMITIDOS = [
  "1.201",
  "1.201.01",
  "1.202",
  "1.202.01",
  "1.949.05",
  "2.201",
  "2.201.01",
  "2.201.03",
  "2.202",
  "2.203",
  "2.204",
  "2.410",
  "2.949.05",
  "5.101",
  "5.101.02",
  "5.101.03",
  "5.102",
  "5.105",
  "5.105.01",
  "5.105.04",
  "5.106",
  "5.118",
  "5.122",
  "5.124",
  "5.910.05",
  "5.910.06",
  "5.922.02",
  "5.933",
  "5.949.01",
  "5.949.06",
  "6.101",
  "6.101.02",
  "6.101.03",
  "6.101.04",
  "6.101.06",
  "6.102",
  "6.102.03",
  "6.105",
  "6.105.01",
  "6.105.03",
  "6.105.04",
  "6.106",
  "6.107",
  "6.107.04",
  "6.108",
  "6.109",
  "6.109.01",
  "6.110.01",
  "6.118",
  "6.119",
  "6.124",
  "6.401",
  "6.501",
  "6.910",
  "6.910.05",
  "6.910.06",
  "6.922.02",
  "6.933",
  "7.101",
  "8.933",
] as const;

function apenasDigitos(value: string): string {
  return value.replace(/\D/g, "");
}

const CFOP_DIGITOS_PERMITIDOS = new Set(
  CFOPS_FATURAMENTO_PERMITIDOS.map(code => {
    const digits = apenasDigitos(code);
    if (!/^\d{4,8}$/.test(digits)) {
      throw new Error(`CFOP permitido inválido: ${code}`);
    }
    return digits;
  })
);

export function cfopDigitos(value: unknown): string {
  if (value === null || value === undefined) return "";
  return apenasDigitos(String(value).trim());
}

/** Aceita o código com pontos (6.105.01) ou só dígitos (610501). */
export function isCfopFaturamentoPermitido(value: unknown): boolean {
  const digits = cfopDigitos(value);
  return digits.length > 0 && CFOP_DIGITOS_PERMITIDOS.has(digits);
}

/** Lista `'1201','610501',...` para SQL. Só dígitos, sem entrada externa. */
export function cfopDigitosSqlIn(): string {
  return [...CFOP_DIGITOS_PERMITIDOS].map(digits => `'${digits}'`).join(",");
}

/** Predicado SQL Server para a view do ERP. */
export function erpCfopPermitidoSql(): string {
  return `REPLACE(REPLACE(LTRIM(RTRIM(CAST(CFOP AS varchar(20)))), '.', ''), ' ', '') IN (${cfopDigitosSqlIn()})`;
}
