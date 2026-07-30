import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { trpc } from "@/lib/trpc";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, Trash2, Download } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

// Mapeamento de colunas do Excel para campos do banco
const COLUMN_MAPPING: Record<string, string> = {
  "Data Emissão": "dataEmissao",
  "Data Emissao": "dataEmissao",
  "Cod. Cliente": "codCliente",
  "Cod Cliente": "codCliente",
  "CNPJ": "cnpj",
  "Unidade": "unidade",
  "Nº da NF": "nfNumero",
  "N° da NF": "nfNumero",
  "No da NF": "nfNumero",
  "Cidade": "cidade",
  "UF": "uf",
  "Marca": "marca",
  "Cod. Material": "codMaterial",
  "Cod Material": "codMaterial",
  "Descrição Item": "descricaoItem",
  "Descricao Item": "descricaoItem",
  "Tipo Negocio": "tipoNegocio",
  "Tipo Negócio": "tipoNegocio",
  "Tipo Estoque": "tipoEstoque",
  "Linha Produto": "linhaProduto",
  "Qtd.": "qtd",
  "Qtd": "qtd",
  "Valor Total": "valorTotal",
  "Gestor": "gestor",
  "CFOP": "cfop",
  "Desc. CFOP": "descCfop",
  "Desc CFOP": "descCfop",
  "Tipo de Fatur.": "tipoFaturamento",
  "Tipo de Faturamento": "tipoFaturamento",
  "Tipo Faturamento": "tipoFaturamento",
};

interface ParsedRow {
  dataEmissao: string;
  codCliente?: string;
  cnpj?: string;
  unidade?: string;
  nfNumero?: string;
  cidade?: string;
  uf?: string;
  marca?: string;
  codMaterial?: string;
  descricaoItem?: string;
  tipoNegocio?: string;
  tipoEstoque?: "MTS" | "MTO";
  linhaProduto?: string;
  qtd: string;
  valorTotal: string;
  gestor?: string;
  cfop?: string;
  descCfop?: string;
  tipoFaturamento?: "DEVOLUCAO" | "SAIDA";
}

export default function ImportarFaturamento() {
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importProgress, setImportProgress] = useState(0);

  const utils = trpc.useUtils();
  const { data: stats, isLoading: loadingStats } = trpc.faturamento.stats.useQuery();
  
  const importMutation = trpc.faturamento.importBatch.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.count} registros importados com sucesso!`);
      utils.faturamento.stats.invalidate();
      utils.faturamento.list.invalidate();
      setParsedData([]);
      setFile(null);
      setImportProgress(100);
    },
    onError: (error) => {
      toast.error(`Erro na importação: ${error.message}`);
      setImportProgress(0);
    },
  });

  const clearMutation = trpc.faturamento.clear.useMutation({
    onSuccess: () => {
      toast.success("Base de faturamento limpa com sucesso!");
      utils.faturamento.stats.invalidate();
      utils.faturamento.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const parseExcelDate = (value: unknown): string => {
    if (typeof value === "number") {
      // Excel date serial number
      const date = XLSX.SSF.parse_date_code(value);
      return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
    }
    if (typeof value === "string") {
      // Try to parse DD/MM/YYYY format
      const parts = value.split("/");
      if (parts.length === 3) {
        return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
      }
      return value;
    }
    return new Date().toISOString().split("T")[0];
  };

  const parseNumber = (value: unknown): string => {
    if (typeof value === "number") return value.toString();
    if (typeof value === "string") {
      // Remove thousand separators and convert decimal comma to dot
      return value.replace(/\./g, "").replace(",", ".").trim();
    }
    return "0";
  };

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setIsProcessing(true);
    setErrors([]);
    setParsedData([]);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];

        if (jsonData.length < 2) {
          setErrors(["Arquivo vazio ou sem dados"]);
          setIsProcessing(false);
          return;
        }

        // Get headers from first row
        const headers = jsonData[0] as string[];
        const mappedHeaders: string[] = headers.map(h => {
          const normalized = String(h).trim();
          return COLUMN_MAPPING[normalized] || normalized.toLowerCase().replace(/\s+/g, "");
        });

        // Find required column indexes
        const dataEmissaoIdx = mappedHeaders.indexOf("dataEmissao");
        const qtdIdx = mappedHeaders.indexOf("qtd");
        const valorTotalIdx = mappedHeaders.indexOf("valorTotal");

        const parseErrors: string[] = [];
        if (dataEmissaoIdx === -1) parseErrors.push("Coluna 'Data Emissão' não encontrada");
        if (qtdIdx === -1) parseErrors.push("Coluna 'Qtd.' não encontrada");
        if (valorTotalIdx === -1) parseErrors.push("Coluna 'Valor Total' não encontrada");

        if (parseErrors.length > 0) {
          setErrors(parseErrors);
          setIsProcessing(false);
          return;
        }

        // Parse data rows
        const rows: ParsedRow[] = [];
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i] as unknown[];
          if (!row || row.length === 0) continue;

          const dataEmissao = parseExcelDate(row[dataEmissaoIdx]);
          const qtd = parseNumber(row[qtdIdx]);
          const valorTotal = parseNumber(row[valorTotalIdx]);

          // Skip empty rows
          if (!dataEmissao || qtd === "0" || qtd === "") continue;

          const parsedRow: ParsedRow = {
            dataEmissao,
            qtd,
            valorTotal,
          };

          // Map optional fields
          mappedHeaders.forEach((field, idx) => {
            if (idx === dataEmissaoIdx || idx === qtdIdx || idx === valorTotalIdx) return;
            const value = row[idx];
            if (value !== undefined && value !== null && value !== "") {
              if (field === "tipoEstoque") {
                const v = String(value).toUpperCase();
                if (v === "MTS" || v === "MTO") {
                  parsedRow.tipoEstoque = v;
                }
              } else if (field === "tipoFaturamento") {
                const v = String(value).toUpperCase();
                if (v.includes("DEVOL")) {
                  parsedRow.tipoFaturamento = "DEVOLUCAO";
                } else {
                  parsedRow.tipoFaturamento = "SAIDA";
                }
              } else if (field in parsedRow || ["codCliente", "cnpj", "unidade", "nfNumero", "cidade", "uf", "marca", "codMaterial", "descricaoItem", "tipoNegocio", "linhaProduto", "gestor", "cfop", "descCfop"].includes(field)) {
                (parsedRow as unknown as Record<string, unknown>)[field] = String(value);
              }
            }
          });

          rows.push(parsedRow);
        }

        setParsedData(rows);
        setIsProcessing(false);
        toast.success(`${rows.length} registros carregados do arquivo`);
      } catch (error) {
        setErrors([`Erro ao processar arquivo: ${error}`]);
        setIsProcessing(false);
      }
    };

    reader.readAsArrayBuffer(selectedFile);
  }, []);

  const handleImport = async () => {
    if (parsedData.length === 0) return;
    
    setImportProgress(10);
    
    // Import in batches to show progress
    const batchSize = 1000;
    const batches = Math.ceil(parsedData.length / batchSize);
    
    for (let i = 0; i < batches; i++) {
      const batch = parsedData.slice(i * batchSize, (i + 1) * batchSize);
      await importMutation.mutateAsync(batch);
      setImportProgress(Math.round(((i + 1) / batches) * 90) + 10);
    }
  };

  const downloadTemplate = () => {
    const headers = [
      "Data Emissão", "Cod. Cliente", "CNPJ", "Unidade", "Nº da NF", "Cidade", "UF",
      "Marca", "Cod. Material", "Descrição Item", "Tipo Negocio", "Tipo Estoque",
      "Linha Produto", "Qtd.", "Valor Total", "Gestor", "CFOP", "Desc. CFOP", "Tipo de Fatur."
    ];
    const exampleRow = [
      "15/12/2024", "12345", "12.345.678/0001-90", "Franquia", "1234", "São Paulo", "SP",
      "Marca X", "99.99.999999", "Produto Exemplo", "VAR", "MTS",
      "Classic", "100", "5000.00", "João Silva", "5102", "Venda de mercadoria", "Saída"
    ];
    
    const ws = XLSX.utils.aoa_to_sheet([headers, exampleRow]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "template_faturamento.xlsx");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Importar Faturamento</h1>
          <p className="text-muted-foreground">Importe dados de faturamento via arquivo Excel ou CSV</p>
        </div>
        <Button variant="outline" onClick={downloadTemplate}>
          <Download className="h-4 w-4 mr-2" />
          Baixar Template
        </Button>
      </div>

      {/* Stats Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Base de Faturamento Atual
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingStats ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <div className="grid gap-4 md:grid-cols-4">
              <div className="p-4 border rounded-lg">
                <p className="text-sm text-muted-foreground">Total de Registros</p>
                <p className="text-2xl font-bold">{stats?.totalRegistros.toLocaleString("pt-BR")}</p>
              </div>
              <div className="p-4 border rounded-lg">
                <p className="text-sm text-muted-foreground">Valor Total</p>
                <p className="text-2xl font-bold">R$ {stats?.totalValor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="p-4 border rounded-lg">
                <p className="text-sm text-muted-foreground">Quantidade Total</p>
                <p className="text-2xl font-bold">{stats?.totalQtd.toLocaleString("pt-BR")}</p>
              </div>
              <div className="p-4 border rounded-lg flex items-center justify-center">
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={() => {
                    if (confirm("Tem certeza que deseja limpar toda a base de faturamento?")) {
                      clearMutation.mutate();
                    }
                  }}
                  disabled={clearMutation.isPending || stats?.totalRegistros === 0}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Limpar Base
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload Card */}
      <Card>
        <CardHeader>
          <CardTitle>Upload de Arquivo</CardTitle>
          <CardDescription>
            Selecione um arquivo Excel (.xlsx, .xls) ou CSV com os dados de faturamento
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="hidden"
                id="file-upload"
                disabled={isProcessing}
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-lg font-medium">
                  {file ? file.name : "Clique para selecionar ou arraste o arquivo"}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Formatos suportados: .xlsx, .xls, .csv
                </p>
              </label>
            </div>

            {isProcessing && (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Processando arquivo...</span>
              </div>
            )}

            {errors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Erros encontrados</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc list-inside">
                    {errors.map((error, idx) => (
                      <li key={idx}>{error}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {importProgress > 0 && importProgress < 100 && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Importando...</span>
                  <span>{importProgress}%</span>
                </div>
                <Progress value={importProgress} />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Preview Card */}
      {parsedData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                Preview dos Dados ({parsedData.length} registros)
              </span>
              <Button onClick={handleImport} disabled={importMutation.isPending}>
                {importMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Importar Dados
              </Button>
            </CardTitle>
            <CardDescription>
              Verifique os dados antes de importar. Mostrando os primeiros 10 registros.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>NF</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Material</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Qtd</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Tipo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedData.slice(0, 10).map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{new Date(row.dataEmissao).toLocaleDateString("pt-BR")}</TableCell>
                      <TableCell>{row.nfNumero || "-"}</TableCell>
                      <TableCell>{row.codCliente || "-"}</TableCell>
                      <TableCell className="font-mono text-xs">{row.codMaterial || "-"}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{row.descricaoItem || "-"}</TableCell>
                      <TableCell className="text-right">{parseFloat(row.qtd).toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-right">R$ {parseFloat(row.valorTotal).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell>
                        <Badge variant={row.tipoFaturamento === "DEVOLUCAO" ? "destructive" : "default"}>
                          {row.tipoFaturamento || "SAIDA"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {parsedData.length > 10 && (
              <p className="text-sm text-muted-foreground mt-4 text-center">
                ... e mais {parsedData.length - 10} registros
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Column Mapping Reference */}
      <Card>
        <CardHeader>
          <CardTitle>Colunas Esperadas</CardTitle>
          <CardDescription>O arquivo deve conter as seguintes colunas (nomes flexíveis)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 md:grid-cols-3 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant="destructive">Obrigatório</Badge>
              <span>Data Emissão</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="destructive">Obrigatório</Badge>
              <span>Qtd.</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="destructive">Obrigatório</Badge>
              <span>Valor Total</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Opcional</Badge>
              <span>Cod. Cliente</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Opcional</Badge>
              <span>CNPJ</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Opcional</Badge>
              <span>Unidade</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Opcional</Badge>
              <span>Nº da NF</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Opcional</Badge>
              <span>Cidade / UF</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Opcional</Badge>
              <span>Marca</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Opcional</Badge>
              <span>Cod. Material</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Opcional</Badge>
              <span>Descrição Item</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Opcional</Badge>
              <span>Tipo Negocio</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Opcional</Badge>
              <span>Tipo Estoque (MTS/MTO)</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Opcional</Badge>
              <span>Linha Produto</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Opcional</Badge>
              <span>Gestor</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Opcional</Badge>
              <span>CFOP / Desc. CFOP</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Opcional</Badge>
              <span>Tipo de Fatur. (Devolução/Saída)</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
