/**
 * Exporta dados para arquivo CSV
 * @param data - Array de objetos a serem exportados
 * @param filename - Nome do arquivo (sem extensão)
 * @param columns - Configuração das colunas (chave do objeto -> título da coluna)
 */
export function exportToCsv<T extends Record<string, unknown>>(
  data: T[],
  filename: string,
  columns: { key: keyof T; title: string }[]
): void {
  if (data.length === 0) {
    alert("Não há dados para exportar");
    return;
  }

  // Criar cabeçalho
  const header = columns.map(col => `"${col.title}"`).join(";");

  // Criar linhas de dados
  const rows = data.map(item => {
    return columns
      .map(col => {
        const value = item[col.key];
        if (value === null || value === undefined) {
          return '""';
        }
        if (typeof value === "string") {
          // Escapar aspas duplas e envolver em aspas
          return `"${value.replace(/"/g, '""')}"`;
        }
        if (typeof value === "boolean") {
          return value ? '"Sim"' : '"Não"';
        }
        if (value instanceof Date) {
          return `"${value.toLocaleDateString("pt-BR")}"`;
        }
        return `"${String(value)}"`;
      })
      .join(";");
  });

  // Montar conteúdo CSV com BOM para UTF-8
  const BOM = "\uFEFF";
  const csvContent = BOM + [header, ...rows].join("\n");

  // Criar blob e fazer download
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `${filename}.csv`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
