import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2,
  ArrowLeft,
  Download,
  BarChart3,
  X,
  LayoutDashboard,
  Users,
  BookOpen,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  FileSpreadsheet,
} from "lucide-react";
import { toast } from "sonner";
import { downloadPrevisaoJobExcel } from "@/lib/downloadPrevisaoJobExcel";
import {
  EXCEL_FONT_FAMILY,
  EXCEL_HEADER_BG,
  EXCEL_HEADER_FG,
  excelStyleForCell,
} from "./excelReportStyles";

type AppliedFilter = {
  id: string;
  column: string;
  value: string;
};

type ViewerModule = "previsao" | "executivo" | "clientes" | "metodos";

type ViewerStateFromUrl = {
  module: ViewerModule;
  sku: string;
  sheetName: string;
  search: string;
  sortBy: string;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: 50 | 100 | 250;
  filters: AppliedFilter[];
};

type DrillSnapshot = {
  id: string;
  source: string;
  label: string;
  globalSkuSearch: string;
  selectedSheet: string;
  search: string;
  sortBy: string;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: 50 | 100 | 250;
  filters: AppliedFilter[];
};

const PAGE_SIZE_OPTIONS = new Set([50, 100, 250]);
const DEFAULT_PAGE_SIZE: 50 | 100 | 250 = 100;
const SEARCH_DEBOUNCE_MS = 350;
const FILTER_DEBOUNCE_MS = 300;

function formatSheetLabel(sheetName: string) {
  // Nomes literais das abas do Excel gerado
  return sheetName;
}

function formatDate(value: Date | string | number | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-BR");
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return "--";
  return `${(value * 100).toFixed(1)}%`;
}

function formatCompactNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return "--";
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function formatCompactCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) return "--";
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  });
}

function formatSheetCell(column: string, value: string) {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "None" || raw === "nan" || raw === "NaN") return "";
  const token = normalizeToken(column);
  const textColumn =
    token === "codigo" ||
    token === "marca" ||
    token.includes("cliente") && token.includes("cod") ||
    token.includes("status") ||
    token.includes("modelo") ||
    token.includes("opcao") ||
    token.includes("premissa") ||
    token.includes("classe") ||
    token.includes("tipo") ||
    token.includes("flag") ||
    token.includes("direcao") ||
    token.includes("consistencia") ||
    token.includes("range utilizado") ||
    token.includes("melhor opcao") ||
    token.includes("tendencia") ||
    token.includes("recorrencia");
  if (textColumn || /[a-zA-ZÀ-ÿ]/.test(raw)) return raw;
  const numeric = Number(raw.replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(numeric)) return raw;
  const percentCol = column.includes("%") || token.includes("pct") || token.includes("variacao");
  if (percentCol) {
    const ratio = Math.abs(numeric) <= 2 ? numeric : numeric / 100;
    return ratio.toLocaleString("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }
  return numeric.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

function formatSignedPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return "--";
  const absolute = `${Math.abs(value * 100).toFixed(1)}%`;
  if (value > 0) return `+${absolute}`;
  if (value < 0) return `-${absolute}`;
  return absolute;
}

function getMovementBadgeVariant(direction: "SUBIU" | "CAIU" | "ESTAVEL") {
  if (direction === "SUBIU") return "default";
  if (direction === "CAIU") return "destructive";
  return "secondary";
}

function normalizeToken(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function resolveColumnByAliases(columns: string[], aliases: string[]) {
  const normalizedAliases = aliases.map(alias => normalizeToken(alias));
  return (
    columns.find(column => normalizedAliases.includes(normalizeToken(column))) ||
    null
  );
}

function resolveSheetByPriority(
  sheetNames: string[] | undefined,
  preferredNames: string[]
) {
  if (!sheetNames || sheetNames.length === 0) return null;

  const normalizedPreferred = preferredNames.map(name => normalizeToken(name));
  return (
    sheetNames.find(sheetName =>
      normalizedPreferred.includes(normalizeToken(sheetName))
    ) || null
  );
}

function toCsvCell(value: string) {
  if (/[;"\n\r]/.test(value)) {
    return `"${value.replace(/"/g, "\"\"")}"`;
  }
  return value;
}

function buildFilterId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function parsePositiveInt(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const integer = Math.floor(parsed);
  return integer > 0 ? integer : fallback;
}

function parsePageSize(value: string | null): 50 | 100 | 250 {
  const parsed = parsePositiveInt(value, DEFAULT_PAGE_SIZE);
  if (PAGE_SIZE_OPTIONS.has(parsed)) {
    return parsed as 50 | 100 | 250;
  }
  return DEFAULT_PAGE_SIZE;
}

function parseViewerModule(value: string | null): ViewerModule {
  const normalized = (value || "").trim().toLowerCase();
  if (normalized === "executivo") return "executivo";
  if (normalized === "clientes") return "clientes";
  if (normalized === "metodos") return "metodos";
  return "previsao";
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [delayMs, value]);

  return debouncedValue;
}

function readViewerStateFromUrl(): ViewerStateFromUrl {
  if (typeof window === "undefined") {
    return {
      module: "previsao",
      sku: "",
      sheetName: "",
      search: "",
      sortBy: "",
      sortDir: "asc",
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      filters: [],
    };
  }

  const query = new URLSearchParams(window.location.search);
  const filtersRaw = query.get("filters");
  let filters: AppliedFilter[] = [];

  if (filtersRaw) {
    try {
      const parsed = JSON.parse(filtersRaw);
      if (Array.isArray(parsed)) {
        filters = parsed
          .map(item => {
            const column = typeof item?.column === "string" ? item.column.trim() : "";
            const value = typeof item?.value === "string" ? item.value.trim() : "";
            if (!column || !value) return null;
            return { id: buildFilterId(), column, value };
          })
          .filter((item): item is AppliedFilter => Boolean(item));
      }
    } catch {
      filters = [];
    }
  }

  const sortDir = query.get("sortDir") === "desc" ? "desc" : "asc";

  return {
    module: parseViewerModule(query.get("module")),
    sku: (query.get("sku") || "").trim(),
    sheetName: (query.get("sheet") || "").trim(),
    search: (query.get("q") || "").trim(),
    sortBy: (query.get("sortBy") || "").trim(),
    sortDir,
    page: parsePositiveInt(query.get("page"), 1),
    pageSize: parsePageSize(query.get("pageSize")),
    filters,
  };
}

export default function PrevisaoPythonViewer() {
  const [, setLocation] = useLocation();
  const [legacyMatch, legacyParams] = useRoute("/previsao-python/jobs/:id/visualizacao");
  const [ciclo13Match, ciclo13Params] = useRoute(
    "/previsao-python/jobs/:id/visualizacao-ciclo-13"
  );
  const match = legacyMatch || ciclo13Match;
  const params = legacyMatch ? legacyParams : ciclo13Params;
  const isCiclo13View = Boolean(ciclo13Match);
  const utils = trpc.useUtils();

  const jobId = match ? Number((params as { id?: string } | null)?.id ?? 0) : Number.NaN;
  const isValidJobId = Number.isInteger(jobId) && jobId > 0;

  const initialStateFromUrl = useMemo(() => readViewerStateFromUrl(), []);
  const [activeModule, setActiveModule] = useState<ViewerModule>(
    isCiclo13View ? initialStateFromUrl.module : "previsao"
  );
  const [globalSkuSearch, setGlobalSkuSearch] = useState(initialStateFromUrl.sku);
  const [selectedSheet, setSelectedSheet] = useState(initialStateFromUrl.sheetName);
  const [search, setSearch] = useState(initialStateFromUrl.search);
  const [sortBy, setSortBy] = useState(initialStateFromUrl.sortBy);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(initialStateFromUrl.sortDir);
  const [page, setPage] = useState(initialStateFromUrl.page);
  const [pageSize, setPageSize] = useState<50 | 100 | 250>(initialStateFromUrl.pageSize);
  const [filters, setFilters] = useState<AppliedFilter[]>(initialStateFromUrl.filters);
  const [newFilterColumn, setNewFilterColumn] = useState("");
  const [newFilterValue, setNewFilterValue] = useState("");
  const [exportingCsv, setExportingCsv] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerSkuFilter, setCustomerSkuFilter] = useState("");
  const [customerCodClienteFilter, setCustomerCodClienteFilter] = useState("");
  const [customerComportamentoFilter, setCustomerComportamentoFilter] = useState("");
  const [customerFidelidadeFilter, setCustomerFidelidadeFilter] = useState("");
  const [customerSortBy, setCustomerSortBy] = useState("TOTAL_UNIDADES");
  const [customerSortDir, setCustomerSortDir] = useState<"asc" | "desc">("desc");
  const [customerPage, setCustomerPage] = useState(1);
  const [customerPageSize, setCustomerPageSize] = useState<50 | 100 | 250>(100);
  const [exportingCustomerCsv, setExportingCustomerCsv] = useState(false);
  const [pendingDrillFilter, setPendingDrillFilter] = useState<{
    value: string;
    columnAliases: string[];
  } | null>(null);
  const [drillHistory, setDrillHistory] = useState<DrillSnapshot[]>([]);
  const [drillBaseSnapshot, setDrillBaseSnapshot] = useState<DrillSnapshot | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const skipPageResetOnFirstRender = useRef(true);
  const debouncedGlobalSkuSearch = useDebouncedValue(globalSkuSearch, SEARCH_DEBOUNCE_MS);
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const debouncedCustomerSearch = useDebouncedValue(customerSearch, SEARCH_DEBOUNCE_MS);
  const debouncedCustomerSkuFilter = useDebouncedValue(customerSkuFilter, FILTER_DEBOUNCE_MS);
  const debouncedCustomerCodClienteFilter = useDebouncedValue(
    customerCodClienteFilter,
    FILTER_DEBOUNCE_MS
  );
  const debouncedCustomerComportamentoFilter = useDebouncedValue(
    customerComportamentoFilter,
    FILTER_DEBOUNCE_MS
  );
  const debouncedCustomerFidelidadeFilter = useDebouncedValue(
    customerFidelidadeFilter,
    FILTER_DEBOUNCE_MS
  );
  const serializedFilters = useMemo(
    () => JSON.stringify(filters.map(filter => ({ column: filter.column, value: filter.value }))),
    [filters]
  );
  const debouncedSerializedFilters = useDebouncedValue(
    serializedFilters,
    FILTER_DEBOUNCE_MS
  );
  const debouncedFilters = useMemo(() => {
    try {
      const parsed = JSON.parse(debouncedSerializedFilters);
      if (!Array.isArray(parsed)) return [] as Array<{ column: string; value: string }>;
      return parsed
        .map(item => ({
          column: typeof item?.column === "string" ? item.column : "",
          value: typeof item?.value === "string" ? item.value : "",
        }))
        .filter(item => item.column.trim() && item.value.trim());
    } catch {
      return [] as Array<{ column: string; value: string }>;
    }
  }, [debouncedSerializedFilters]);
  const normalizedSkuSearch = debouncedGlobalSkuSearch.trim().toLowerCase();
  const localSearchForQuery = search.trim() ? debouncedSearch.trim() : "";
  const filtersForQuery = filters.length === 0 ? [] : debouncedFilters;
  const effectiveSearch = [localSearchForQuery, debouncedGlobalSkuSearch.trim()]
    .filter(Boolean)
    .join(" ");

  const {
    data: job,
    isLoading: loadingJob,
    isError: jobQueryFailed,
    error: jobQueryError,
  } = trpc.previsaoPython.getById.useQuery(
    { id: jobId || 0 },
    {
      enabled: isValidJobId,
      refetchInterval: query => (query.state.data?.status === "SUCCESS" ? false : 4000),
      staleTime: 30_000,
    }
  );

  const hasOutputAvailable = Boolean(job?.workdir && job?.outputFileName);
  const canVisualizeJob = hasOutputAvailable;

  const {
    data: workbookSheets,
    isLoading: loadingSheets,
    isError: sheetsQueryFailed,
    error: sheetsQueryError,
  } = trpc.previsaoPython.workbookMeta.useQuery(
    { id: jobId || 0 },
    { enabled: isValidJobId && canVisualizeJob, staleTime: 5 * 60_000 }
  );


  const executiveAnalyticsQuery = trpc.previsaoPython.executiveAnalytics.useQuery(
    { id: jobId || 0 },
    {
      enabled: isValidJobId && canVisualizeJob && isCiclo13View && activeModule === "executivo",
      staleTime: 20_000,
    }
  );

  const customerAnalyticsQuery = trpc.previsaoPython.customerAnalytics.useQuery(
    { id: jobId || 0 },
    {
      enabled: isValidJobId && canVisualizeJob && isCiclo13View && activeModule === "clientes",
      staleTime: 20_000,
    }
  );

  const customerDetailDataQuery = trpc.previsaoPython.customerDetailData.useQuery(
    {
      id: jobId || 0,
      page: customerPage,
      pageSize: customerPageSize,
      search: [debouncedCustomerSearch.trim(), debouncedGlobalSkuSearch.trim()]
        .filter(Boolean)
        .join(" "),
      sortBy: customerSortBy,
      sortDir: customerSortDir,
      sku: debouncedCustomerSkuFilter.trim(),
      codCliente: debouncedCustomerCodClienteFilter.trim(),
      comportamento: debouncedCustomerComportamentoFilter.trim(),
      fidelidade: debouncedCustomerFidelidadeFilter.trim(),
    },
    {
      enabled: isValidJobId && canVisualizeJob && isCiclo13View && activeModule === "clientes",
      staleTime: 10_000,
      placeholderData: previous => previous,
    }
  );

  const sheetDataQuery = trpc.previsaoPython.sheetData.useQuery(
    {
      id: jobId || 0,
      sheetName: selectedSheet,
      page,
      pageSize,
      search: effectiveSearch,
      sortBy,
      sortDir,
      filters: filtersForQuery,
    },
    {
      enabled: isValidJobId && canVisualizeJob && Boolean(selectedSheet),
      staleTime: 5 * 60_000,
      gcTime: 15 * 60_000,
    }
  );

  const buildSheetPrefetchInput = (sheetName: string) => ({
    id: jobId,
    sheetName,
    page: 1 as const,
    pageSize,
    search: globalSkuSearch.trim(),
    sortBy: "",
    sortDir: "asc" as const,
    filters: [] as Array<{ column: string; value: string }>,
  });

  const prefetchSheet = (sheetName: string) => {
    if (!isValidJobId || !canVisualizeJob || !sheetName) return;
    void utils.previsaoPython.sheetData.prefetch(buildSheetPrefetchInput(sheetName));
  };

  useEffect(() => {
    if (!isValidJobId || !canVisualizeJob || !workbookSheets?.length) return;

    const priority = [
      "Visao_Executiva",
      "Geral",
      "Detalhado",
      "Backtest",
      "Backtest_Sku",
      "Analise_Cenarios",
      "Acuracidade",
      "Acuracidade_Detalhada",
      "Clientes",
      "Clientes_Analise",
      "Modelos_Estatisticos",
      "Sazonalidade",
      "Metodologia",
    ];
    const skipHeavy = new Set(["Cliente_detalhado", "Clientes_Por_Marca"]);
    const toPrefetch = [
      ...priority.filter(name => workbookSheets.includes(name) && !skipHeavy.has(name)),
      ...workbookSheets.filter(
        name => !priority.includes(name) && !skipHeavy.has(name)
      ),
    ].slice(0, 10);

    let cancelled = false;
    let index = 0;

    const runNext = () => {
      if (cancelled || index >= toPrefetch.length) return;
      const sheetName = toPrefetch[index++];
      void utils.previsaoPython.sheetData
        .prefetch(buildSheetPrefetchInput(sheetName))
        .finally(() => {
          if (!cancelled) {
            window.setTimeout(runNext, 40);
          }
        });
    };

    const timer = window.setTimeout(runNext, 80);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prefetch on sheet list / pageSize / sku only
  }, [
    canVisualizeJob,
    globalSkuSearch,
    isValidJobId,
    jobId,
    pageSize,
    utils.previsaoPython.sheetData,
    workbookSheets,
  ]);

  const methodsSheetName = useMemo(
    () => resolveSheetByPriority(workbookSheets, ["Modelos_Estatisticos", "Modelos Estatisticos"]),
    [workbookSheets]
  );

  const methodsSheetDataQuery = trpc.previsaoPython.sheetData.useQuery(
    {
      id: jobId || 0,
      sheetName: methodsSheetName || "",
      page: 1,
      pageSize: 250,
      search: "",
      sortBy: "",
      sortDir: "asc",
      filters: [],
    },
    {
      enabled:
        isValidJobId &&
        canVisualizeJob &&
        isCiclo13View &&
        activeModule === "metodos" &&
        Boolean(methodsSheetName),
      staleTime: 20_000,
      placeholderData: previous => previous,
    }
  );

  useEffect(() => {
    if (!isCiclo13View && activeModule !== "previsao") {
      setActiveModule("previsao");
    }
  }, [activeModule, isCiclo13View]);

  const downloadMutationPending = false;
  const handleDownloadOfficialExcel = () => {
    if (!jobId) return;
    downloadPrevisaoJobExcel(jobId);
    toast.success(
      `Baixando ${job?.outputFileName || `relatorio_previsao_demanda_job_${jobId}.xlsx`}`
    );
  };

  useEffect(() => {
    if (!workbookSheets || workbookSheets.length === 0) {
      setSelectedSheet("");
      return;
    }

    if (!selectedSheet || !workbookSheets.includes(selectedSheet)) {
      setSelectedSheet(workbookSheets[0]);
    }
  }, [selectedSheet, workbookSheets]);

  useEffect(() => {
    if (skipPageResetOnFirstRender.current) {
      skipPageResetOnFirstRender.current = false;
      return;
    }
    setPage(1);
  }, [
    selectedSheet,
    debouncedSearch,
    debouncedGlobalSkuSearch,
    debouncedSerializedFilters,
    sortBy,
    sortDir,
    pageSize,
  ]);

  useEffect(() => {
    setCustomerPage(1);
  }, [
    customerPageSize,
    customerSortBy,
    customerSortDir,
    debouncedCustomerSearch,
    debouncedCustomerSkuFilter,
    debouncedCustomerCodClienteFilter,
    debouncedCustomerComportamentoFilter,
    debouncedCustomerFidelidadeFilter,
    debouncedGlobalSkuSearch,
  ]);

  const sheetColumns = sheetDataQuery.data?.columns ?? [];

  useEffect(() => {
    if (!sortBy) return;
    if (!sheetColumns.includes(sortBy)) {
      setSortBy("");
    }
  }, [sheetColumns, sortBy]);

  useEffect(() => {
    if (typeof window === "undefined" || !match) return;

    const query = new URLSearchParams();
    if (isCiclo13View && activeModule !== "previsao") query.set("module", activeModule);
    if (globalSkuSearch) query.set("sku", globalSkuSearch);
    if (selectedSheet) query.set("sheet", selectedSheet);
    if (search) query.set("q", search);
    if (sortBy) query.set("sortBy", sortBy);
    if (sortDir !== "asc") query.set("sortDir", sortDir);
    if (page !== 1) query.set("page", String(page));
    if (pageSize !== DEFAULT_PAGE_SIZE) query.set("pageSize", String(pageSize));
    if (filters.length > 0) {
      query.set(
        "filters",
        JSON.stringify(filters.map(filter => ({ column: filter.column, value: filter.value })))
      );
    }

    const nextSearch = query.toString();
    const nextUrl = nextSearch
      ? `${window.location.pathname}?${nextSearch}`
      : window.location.pathname;
    const currentUrl = `${window.location.pathname}${window.location.search}`;

    if (nextUrl !== currentUrl) {
      window.history.replaceState(null, "", nextUrl);
    }
  }, [
    activeModule,
    filters,
    globalSkuSearch,
    isCiclo13View,
    match,
    page,
    pageSize,
    search,
    selectedSheet,
    sortBy,
    sortDir,
  ]);

  const executiveTopValorFiltered = useMemo(
    () =>
      (executiveAnalyticsQuery.data?.topValor || []).filter(item =>
        !normalizedSkuSearch || item.codigo.toLowerCase().includes(normalizedSkuSearch)
      ),
    [executiveAnalyticsQuery.data?.topValor, normalizedSkuSearch]
  );

  const executiveTopVariacaoFiltered = useMemo(
    () =>
      (executiveAnalyticsQuery.data?.topVariacao || []).filter(item =>
        !normalizedSkuSearch || item.codigo.toLowerCase().includes(normalizedSkuSearch)
      ),
    [executiveAnalyticsQuery.data?.topVariacao, normalizedSkuSearch]
  );

  const customerComportamentoOptions = useMemo(
    () => (customerAnalyticsQuery.data?.comportamentoDistribution || []).map(item => item.label),
    [customerAnalyticsQuery.data?.comportamentoDistribution]
  );

  const customerFidelidadeOptions = useMemo(
    () => (customerAnalyticsQuery.data?.fidelidadeDistribution || []).map(item => item.label),
    [customerAnalyticsQuery.data?.fidelidadeDistribution]
  );

  const methodsCatalogMap = useMemo(() => {
    const data = methodsSheetDataQuery.data;
    if (!data || data.columns.length === 0) return new Map<string, Record<string, string>>();

    const resolveIndex = (aliases: string[]) =>
      data.columns.findIndex(column => aliases.some(alias => normalizeToken(column) === normalizeToken(alias)));

    const modeloIndex = resolveIndex(["MODELO"]);
    const categoriaIndex = resolveIndex(["CATEGORIA"]);
    const descricaoIndex = resolveIndex(["DESCRICAO"]);
    const quandoUsarIndex = resolveIndex(["QUANDO_USAR"]);
    const vantagensIndex = resolveIndex(["VANTAGENS"]);
    const desvantagensIndex = resolveIndex(["DESVANTAGENS"]);
    const complexidadeIndex = resolveIndex(["COMPLEXIDADE"]);

    const map = new Map<string, Record<string, string>>();
    for (const row of data.rows) {
      const modelo = (row[modeloIndex] || "").trim();
      if (!modelo) continue;
      map.set(normalizeToken(modelo), {
        modelo,
        categoria: row[categoriaIndex] || "--",
        descricao: row[descricaoIndex] || "--",
        quandoUsar: row[quandoUsarIndex] || "--",
        vantagens: row[vantagensIndex] || "--",
        desvantagens: row[desvantagensIndex] || "--",
        complexidade: row[complexidadeIndex] || "--",
      });
    }
    return map;
  }, [methodsSheetDataQuery.data]);

  const modelRankingWithCatalog = useMemo(
    () =>
      Array.from(methodsCatalogMap.values())
        .slice(0, 12)
        .map(item => ({
          modelo: item.modelo,
          skuCount: null as number | null,
          avgMape: null as number | null,
          catalog: item,
        })),
    [methodsCatalogMap]
  );

  const buildDrillSnapshot = (label: string, source: string): DrillSnapshot => ({
    id: buildFilterId(),
    source,
    label,
    globalSkuSearch,
    selectedSheet,
    search,
    sortBy,
    sortDir,
    page,
    pageSize,
    filters: filters.map(filter => ({ ...filter })),
  });

  const restoreDrillSnapshot = (snapshot: DrillSnapshot) => {
    setGlobalSkuSearch(snapshot.globalSkuSearch);
    setSelectedSheet(snapshot.selectedSheet);
    setSearch(snapshot.search);
    setSortBy(snapshot.sortBy);
    setSortDir(snapshot.sortDir);
    setPage(snapshot.page);
    setPageSize(snapshot.pageSize);
    setFilters(snapshot.filters.map(filter => ({ ...filter })));
    setPendingDrillFilter(null);
  };

  const pushDrillSnapshot = (label: string, source: string) => {
    const snapshot = buildDrillSnapshot(label, source);
    if (!drillBaseSnapshot && drillHistory.length === 0) {
      setDrillBaseSnapshot(snapshot);
    }
    setDrillHistory(prev => [...prev.slice(-19), snapshot]);
  };

  const handleUndoDrill = () => {
    if (drillHistory.length === 0) return;
    const snapshot = drillHistory[drillHistory.length - 1];
    setDrillHistory(prev => prev.slice(0, -1));
    if (drillHistory.length === 1) {
      setDrillBaseSnapshot(null);
    }
    restoreDrillSnapshot(snapshot);
    toast.success(`Drill-down desfeito: ${snapshot.label}`);
  };

  const handleResetDrill = () => {
    const firstSnapshot = drillBaseSnapshot || drillHistory[0];
    if (!firstSnapshot) return;
    const levels = drillHistory.length;
    setDrillHistory([]);
    setDrillBaseSnapshot(null);
    restoreDrillSnapshot(firstSnapshot);
    toast.success(`Drill-down resetado (${levels} niveis).`);
  };

  const applyDrillFilter = (
    value: string,
    options: {
      preferredSheets: string[];
      columnAliases: string[];
      message: string;
      trailLabel: string;
      sourceKey: string;
    }
  ) => {
    const trimmedValue = value.trim();
    if (!trimmedValue) return;
    pushDrillSnapshot(options.trailLabel, options.sourceKey);

    const preferredSheet = resolveSheetByPriority(workbookSheets, options.preferredSheets);
    if (preferredSheet && preferredSheet !== selectedSheet) {
      setSelectedSheet(preferredSheet);
      setPendingDrillFilter({ value: trimmedValue, columnAliases: options.columnAliases });
      setPage(1);
      toast.success(options.message);
      return;
    }

    const columnName = resolveColumnByAliases(sheetColumns, options.columnAliases);
    if (columnName) {
      setFilters(prev => [
        ...prev.filter(item => normalizeToken(item.column) !== normalizeToken(columnName)),
        { id: buildFilterId(), column: columnName, value: trimmedValue },
      ]);
    } else {
      setPendingDrillFilter({ value: trimmedValue, columnAliases: options.columnAliases });
    }

    setPage(1);
    toast.success(options.message);
  };

  useEffect(() => {
    if (!pendingDrillFilter) return;

    const columnName = resolveColumnByAliases(sheetColumns, pendingDrillFilter.columnAliases);
    if (!columnName) return;

    setFilters(prev => [
      ...prev.filter(item => normalizeToken(item.column) !== normalizeToken(columnName)),
      { id: buildFilterId(), column: columnName, value: pendingDrillFilter.value },
    ]);
    setPendingDrillFilter(null);
  }, [pendingDrillFilter, sheetColumns]);

  const handleExportFilteredCsv = async () => {
    if (!selectedSheet) {
      toast.error("Selecione uma aba para exportar.");
      return;
    }

    setExportingCsv(true);
    try {
      const baseInput = {
        id: jobId || 0,
        sheetName: selectedSheet,
        pageSize: 250 as const,
        search: effectiveSearch,
        sortBy,
        sortDir,
        filters: debouncedFilters,
      };

      const firstPage = await utils.previsaoPython.sheetData.fetch({ ...baseInput, page: 1 });
      const allRows = [...firstPage.rows];

      for (let current = 2; current <= firstPage.totalPages; current++) {
        const pageData = await utils.previsaoPython.sheetData.fetch({
          ...baseInput,
          page: current,
        });
        allRows.push(...pageData.rows);
      }

      const csvLines = [firstPage.columns, ...allRows]
        .map(row => row.map(cell => toCsvCell(cell ?? "")).join(";"))
        .join("\n");

      const blob = new Blob([`\uFEFF${csvLines}`], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `job-${jobId}-${selectedSheet}-filtrado.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success(`CSV exportado com ${allRows.length} linhas.`);
    } catch (error) {
      toast.error(`Falha ao exportar CSV: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setExportingCsv(false);
    }
  };

  const handleExportCustomerCsv = async () => {
    setExportingCustomerCsv(true);
    try {
      const baseInput = {
        id: jobId || 0,
        pageSize: 250 as const,
        search: [debouncedCustomerSearch.trim(), debouncedGlobalSkuSearch.trim()]
          .filter(Boolean)
          .join(" "),
        sortBy: customerSortBy,
        sortDir: customerSortDir,
        sku: debouncedCustomerSkuFilter.trim(),
        codCliente: debouncedCustomerCodClienteFilter.trim(),
        comportamento: debouncedCustomerComportamentoFilter.trim(),
        fidelidade: debouncedCustomerFidelidadeFilter.trim(),
      };

      const firstPage = await utils.previsaoPython.customerDetailData.fetch({
        ...baseInput,
        page: 1,
      });
      const allRows = [...firstPage.rows];

      for (let current = 2; current <= firstPage.totalPages; current++) {
        const pageData = await utils.previsaoPython.customerDetailData.fetch({
          ...baseInput,
          page: current,
        });
        allRows.push(...pageData.rows);
      }

      const csvLines = [firstPage.columns, ...allRows]
        .map(row => row.map(cell => toCsvCell(cell ?? "")).join(";"))
        .join("\n");

      const blob = new Blob([`\uFEFF${csvLines}`], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `job-${jobId}-clientes-filtrado.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success(`CSV de clientes exportado com ${allRows.length} linhas.`);
    } catch (error) {
      toast.error(
        `Falha ao exportar CSV de clientes: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setExportingCustomerCsv(false);
    }
  };

  const handleSkuRowClick = (
    sku: string,
    preferredSheets: string[],
    sourceKey: string
  ) => {
    const trimmed = sku.trim();
    if (!trimmed) return;
    pushDrillSnapshot(`SKU: ${trimmed}`, sourceKey);

    setGlobalSkuSearch(trimmed);
    setPage(1);

    const preferredSheet = resolveSheetByPriority(workbookSheets, preferredSheets);
    if (preferredSheet && preferredSheet !== selectedSheet) {
      setSelectedSheet(preferredSheet);
    }

    toast.success(`SKU ${trimmed} aplicado na busca global.`);
  };

  const activeDrillSource =
    drillHistory.length > 0 ? drillHistory[drillHistory.length - 1].source : null;

  const renderDrillActions = (sourceKey: string) => {
    if (drillHistory.length === 0 || activeDrillSource !== sourceKey) return null;

    return (
      <div className="flex items-center gap-1 rounded-md border bg-background/70 p-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[11px]"
          onClick={handleUndoDrill}
        >
          Voltar
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[11px]"
          onClick={handleResetDrill}
        >
          Limpar
        </Button>
      </div>
    );
  };

  const handleAddFilter = () => {
    if (!newFilterColumn || !newFilterValue.trim()) return;

    setFilters(prev => [
      ...prev,
      {
        id: buildFilterId(),
        column: newFilterColumn,
        value: newFilterValue.trim(),
      },
    ]);

    setNewFilterValue("");
  };

  const handleRemoveFilter = (filterId: string) => {
    setFilters(prev => prev.filter(filter => filter.id !== filterId));
  };

  if (!isValidJobId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Job invalido</CardTitle>
          <CardDescription>O ID informado na URL e invalido.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => setLocation("/previsao-python")}>Voltar</Button>
        </CardContent>
      </Card>
    );
  }

  const totalRows = sheetDataQuery.data?.totalRows ?? 0;
  const currentPage = sheetDataQuery.data?.page ?? page;
  const currentPageSize = sheetDataQuery.data?.pageSize ?? pageSize;
  const totalPages = sheetDataQuery.data?.totalPages ?? 1;
  const firstRow = totalRows === 0 ? 0 : (currentPage - 1) * currentPageSize + 1;
  const lastRow = totalRows === 0 ? 0 : Math.min(currentPage * currentPageSize, totalRows);
  const customerTotalRows = customerDetailDataQuery.data?.totalRows ?? 0;
  const customerCurrentPage = customerDetailDataQuery.data?.page ?? customerPage;
  const customerCurrentPageSize = customerDetailDataQuery.data?.pageSize ?? customerPageSize;
  const customerTotalPages = customerDetailDataQuery.data?.totalPages ?? 1;
  const customerFirstRow =
    customerTotalRows === 0 ? 0 : (customerCurrentPage - 1) * customerCurrentPageSize + 1;
  const customerLastRow =
    customerTotalRows === 0
      ? 0
      : Math.min(customerCurrentPage * customerCurrentPageSize, customerTotalRows);

  const activeFilterCount =
    filters.length +
    (globalSkuSearch.trim() ? 1 : 0) +
    (search.trim() ? 1 : 0) +
    (sortBy ? 1 : 0);

  const clearAllSheetFilters = () => {
    setDrillHistory([]);
    setDrillBaseSnapshot(null);
    setPendingDrillFilter(null);
    setGlobalSkuSearch("");
    setSearch("");
    setSortBy("");
    setSortDir("asc");
    setFilters([]);
  };

  const handleColumnHeaderSort = (column: string) => {
    if (sortBy === column) {
      setSortDir(current => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(column);
    setSortDir("asc");
  };

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-primary/[0.04] shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4 md:px-6">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-bold tracking-tight md:text-2xl">
                Relatório da previsão
              </h1>
              <Badge variant="outline" className="font-mono text-xs">
                Job #{jobId}
              </Badge>
              {job?.status === "SUCCESS" ? (
                <Badge className="bg-emerald-600 hover:bg-emerald-600">Pronto</Badge>
              ) : job?.status ? (
                <Badge variant="secondary">{job.status}</Badge>
              ) : null}
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Cópia visual do Excel oficial do job
              {job?.outputFileName ? (
                <>
                  : <span className="font-medium text-foreground">{job.outputFileName}</span>
                </>
              ) : null}
              . Cores e abas iguais ao arquivo gerado.
            </p>
            {job && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>Versão {job.scriptVersion}</span>
                <span>Criado {formatDate(job.createdAt)}</span>
                <span>Finalizado {formatDate(job.finishedAt)}</span>
              </div>
            )}
            {loadingJob && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Carregando job...
              </div>
            )}
            {jobQueryFailed && (
              <p className="text-sm text-destructive">
                {jobQueryError.message || "Nao foi possivel carregar o job."}
              </p>
            )}
            {!loadingJob && !jobQueryFailed && !job && (
              <p className="text-sm text-muted-foreground">
                Job nao encontrado. O registro sumiu do banco e nao ha Excel deste job no disco.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setLocation("/previsao-python")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Button>
            <Button
              disabled={!canVisualizeJob || downloadMutationPending}
              onClick={handleDownloadOfficialExcel}
            >
              <Download className="mr-2 h-4 w-4" />
              Baixar Excel
            </Button>
          </div>
        </div>
      </div>

      {job && !canVisualizeJob && (
        <Card>
          <CardHeader>
            <CardTitle>Visualizacao indisponivel</CardTitle>
            <CardDescription>
              Arquivo de saida indisponivel para este job.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {canVisualizeJob && (
        <>
          {isCiclo13View && (
            <Tabs
              value={activeModule}
              onValueChange={value => setActiveModule(parseViewerModule(value))}
              className="space-y-2"
            >
              <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 md:grid-cols-4">
                <TabsTrigger value="previsao" className="gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Previsao
                </TabsTrigger>
                <TabsTrigger value="executivo" className="gap-2">
                  <LayoutDashboard className="h-4 w-4" />
                  Executivo
                </TabsTrigger>
                <TabsTrigger value="clientes" className="gap-2">
                  <Users className="h-4 w-4" />
                  Clientes
                </TabsTrigger>
                <TabsTrigger value="metodos" className="gap-2">
                  <BookOpen className="h-4 w-4" />
                  Metodos
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}

          {(!isCiclo13View || activeModule === "previsao") && (
            <>
          <Card className="overflow-hidden border-border/70 shadow-sm">
            <CardHeader className="space-y-4 border-b bg-muted/20 pb-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">
                    {selectedSheet ? formatSheetLabel(selectedSheet) : "Planilha"}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {selectedSheet ? (
                      <>
                        Aba <span className="font-medium text-foreground">{selectedSheet}</span>
                        {totalRows > 0 ? ` · ${totalRows.toLocaleString("pt-BR")} linhas` : ""}
                      </>
                    ) : (
                      "Escolha uma aba abaixo para ver os dados."
                    )}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {(filters.length > 0 || globalSkuSearch || search || sortBy) && (
                    <Button size="sm" variant="ghost" className="h-9" onClick={clearAllSheetFilters}>
                      Limpar tudo
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9"
                    disabled={!selectedSheet || exportingCsv || loadingSheets}
                    onClick={handleExportFilteredCsv}
                  >
                    {exportingCsv ? "Exportando..." : "Exportar CSV"}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Abas do Excel
                  </Label>
                  {loadingSheets && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Carregando...
                    </span>
                  )}
                </div>
                <div className="snop-blue-scroll rounded-xl border border-slate-200/80 bg-gradient-to-b from-slate-50 to-slate-100/80 p-1.5 shadow-inner">
                  <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                    {(workbookSheets || []).map(sheet => {
                      const active = selectedSheet === sheet;
                      return (
                        <button
                          key={sheet}
                          type="button"
                          onMouseEnter={() => prefetchSheet(sheet)}
                          onFocus={() => prefetchSheet(sheet)}
                          onClick={() => {
                            if (sheet === selectedSheet) return;
                            setPage(1);
                            setSearch("");
                            setSortBy("");
                            setSortDir("asc");
                            setFilters([]);
                            setSelectedSheet(sheet);
                          }}
                          className={`shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-medium tracking-tight transition-all duration-150 ${
                            active
                              ? "bg-[#1F4E79] text-white shadow-md shadow-[#1F4E79]/25 ring-1 ring-[#1F4E79]"
                              : "bg-white/90 text-slate-600 ring-1 ring-slate-200/90 hover:bg-white hover:text-slate-900 hover:ring-slate-300 hover:shadow-sm"
                          }`}
                          title={sheet}
                          style={{ fontFamily: EXCEL_FONT_FAMILY }}
                        >
                          {formatSheetLabel(sheet)}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {sheetsQueryFailed && (
                  <p className="text-xs text-destructive">
                    {sheetsQueryError.message || "Falha ao carregar abas do Excel."}
                  </p>
                )}
                {!loadingSheets && !sheetsQueryFailed && (workbookSheets || []).length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Nenhuma aba encontrada no Excel deste job.
                  </p>
                )}
              </div>

              <div className="grid gap-2 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-10 pl-9"
                    placeholder="Buscar em todas as colunas desta aba"
                    value={search}
                    onChange={event => setSearch(event.target.value)}
                  />
                </div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="sku-global"
                    className="h-10 pl-9"
                    placeholder="Filtrar por SKU / código"
                    value={globalSkuSearch}
                    onChange={event => setGlobalSkuSearch(event.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  variant={showAdvancedFilters || activeFilterCount > 0 ? "default" : "outline"}
                  className="h-10"
                  onClick={() => setShowAdvancedFilters(current => !current)}
                >
                  <Filter className="mr-2 h-4 w-4" />
                  Filtros
                  {activeFilterCount > 0 && (
                    <Badge
                      variant="secondary"
                      className="ml-2 h-5 min-w-5 justify-center rounded-full px-1.5"
                    >
                      {activeFilterCount}
                    </Badge>
                  )}
                </Button>
              </div>

              {(globalSkuSearch || filters.length > 0) && (
                <div className="flex flex-wrap gap-2">
                  {globalSkuSearch && (
                    <Badge variant="secondary" className="gap-2">
                      SKU: {globalSkuSearch}
                      <button
                        type="button"
                        onClick={() => setGlobalSkuSearch("")}
                        className="rounded-sm p-0.5 hover:bg-muted"
                        aria-label="Limpar SKU"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                  {filters.map(filter => (
                    <Badge key={filter.id} variant="secondary" className="gap-2">
                      <span>
                        {filter.column}: {filter.value}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveFilter(filter.id)}
                        className="rounded-sm p-0.5 hover:bg-muted"
                        aria-label="Remover filtro"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              {showAdvancedFilters && (
                <div className="grid gap-3 rounded-xl border bg-background/80 p-3 md:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Ordenar por</Label>
                    <Select
                      value={sortBy || "__none"}
                      onValueChange={value => setSortBy(value === "__none" ? "" : value)}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Sem ordenacao" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Sem ordenacao</SelectItem>
                        {sheetColumns.map(column => (
                          <SelectItem key={column} value={column}>
                            {column}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Direção</Label>
                    <Select value={sortDir} onValueChange={value => setSortDir(value as "asc" | "desc")}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="asc">Ascendente</SelectItem>
                        <SelectItem value="desc">Descendente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Linhas por página</Label>
                    <Select
                      value={String(pageSize)}
                      onValueChange={value => setPageSize(parsePageSize(value))}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Tamanho" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                        <SelectItem value="250">250</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 md:col-span-2 lg:col-span-1">
                    <Label className="text-xs text-muted-foreground">Filtro de coluna</Label>
                    <div className="flex gap-2">
                      <Select
                        value={newFilterColumn || "__none"}
                        onValueChange={value => setNewFilterColumn(value === "__none" ? "" : value)}
                      >
                        <SelectTrigger className="h-9 min-w-0 flex-1">
                          <SelectValue placeholder="Coluna" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">Coluna</SelectItem>
                          {sheetColumns.map(column => (
                            <SelectItem key={`filter-col-${column}`} value={column}>
                              {column}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1 md:col-span-2 lg:col-span-3">
                    <Label className="text-xs text-muted-foreground">Valor contém</Label>
                    <div className="flex flex-wrap gap-2">
                      <Input
                        className="h-9 min-w-[180px] flex-1"
                        placeholder="Ex.: Adidas, QUEDA, 80.01..."
                        value={newFilterValue}
                        onChange={event => setNewFilterValue(event.target.value)}
                        onKeyDown={event => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            handleAddFilter();
                          }
                        }}
                      />
                      <Button
                        className="h-9"
                        onClick={handleAddFilter}
                        disabled={!newFilterColumn || !newFilterValue.trim()}
                      >
                        Aplicar
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardHeader>

            <CardContent className="space-y-3 pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span>
                    {totalRows === 0
                      ? "Nenhuma linha"
                      : `Linhas ${firstRow.toLocaleString("pt-BR")}–${lastRow.toLocaleString("pt-BR")} de ${totalRows.toLocaleString("pt-BR")}`}
                  </span>
                  {sheetDataQuery.isFetching && !sheetDataQuery.isLoading && (
                    <Badge variant="secondary" className="text-[10px]">
                      Atualizando...
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    disabled={currentPage <= 1 || sheetDataQuery.isFetching}
                    onClick={() => setPage(prev => Math.max(1, prev - 1))}
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Anterior
                  </Button>
                  <span className="min-w-[5.5rem] text-center text-xs text-muted-foreground">
                    Pág. {currentPage}/{totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    disabled={currentPage >= totalPages || sheetDataQuery.isFetching}
                    onClick={() => setPage(prev => prev + 1)}
                  >
                    Próxima
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>

              {sheetDataQuery.isLoading ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
                  <Loader2 className="h-7 w-7 animate-spin" />
                  <p className="text-sm">Carregando dados da aba...</p>
                </div>
              ) : sheetDataQuery.isError ? (
                <p className="py-10 text-center text-sm text-destructive">
                  {sheetDataQuery.error.message || "Falha ao carregar a aba."}
                </p>
              ) : !sheetDataQuery.data ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Selecione uma aba para visualizar.
                </p>
              ) : (
                <>
                  {/* Um único scroll: evita Table (overflow interno) + sticky quebrando as colunas */}
                  <div
                    className="snop-blue-scroll max-h-[72vh] overflow-auto rounded-b-xl border border-border/80 bg-white"
                    style={{ fontFamily: EXCEL_FONT_FAMILY, fontSize: "12px" }}
                  >
                    <table className="w-max min-w-full border-collapse">
                      <thead>
                        <tr>
                          {sheetDataQuery.data.columns.length === 0 ? (
                            <th
                              className="sticky top-0 z-20 px-2 py-1.5 text-left font-bold"
                              style={{
                                backgroundColor: EXCEL_HEADER_BG,
                                color: EXCEL_HEADER_FG,
                              }}
                            >
                              Sem colunas
                            </th>
                          ) : (
                            sheetDataQuery.data.columns.map((column, index) => {
                              const isSorted = sortBy === column;
                              return (
                                <th
                                  key={`col-${index}`}
                                  className={`sticky top-0 z-20 whitespace-nowrap px-2 py-1.5 text-left font-bold ${
                                    index === 0 ? "left-0 z-30" : ""
                                  }`}
                                  style={{
                                    backgroundColor: EXCEL_HEADER_BG,
                                    color: EXCEL_HEADER_FG,
                                    borderRight: "1px solid #2F5496",
                                  }}
                                >
                                  <button
                                    type="button"
                                    className="inline-flex items-center gap-1 hover:opacity-90"
                                    onClick={() => handleColumnHeaderSort(column)}
                                    title={`Ordenar por ${column}`}
                                  >
                                    <span>{column}</span>
                                    <ArrowUpDown
                                      className={`h-3 w-3 ${
                                        isSorted ? "opacity-100" : "opacity-40"
                                      }`}
                                    />
                                  </button>
                                </th>
                              );
                            })
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {sheetDataQuery.data.rows.length === 0 ? (
                          <tr>
                            <td
                              colSpan={Math.max(1, sheetDataQuery.data.columns.length)}
                              className="px-3 py-12 text-center text-muted-foreground"
                            >
                              Nenhum dado encontrado para os filtros atuais.
                            </td>
                          </tr>
                        ) : (
                          sheetDataQuery.data.rows.map((row, rowIndex) => {
                            const zebra = rowIndex % 2 === 1;
                            const rowBg = zebra ? "#F2F2F2" : "#FFFFFF";
                            return (
                              <tr key={`row-${rowIndex}`}>
                                {row.map((cell, colIndex) => {
                                  const column = sheetDataQuery.data?.columns[colIndex] || "";
                                  const formatted = formatSheetCell(column, cell);
                                  const excelStyle = excelStyleForCell(column, String(cell ?? ""));
                                  const numeric =
                                    !excelStyle &&
                                    formatted !== cell &&
                                    formatted !== "" &&
                                    !/[a-zA-ZÀ-ÿ]/.test(formatted);
                                  const bg = excelStyle?.bg || rowBg;
                                  const fg = excelStyle?.fg || "#000000";
                                  return (
                                    <td
                                      key={`cell-${rowIndex}-${colIndex}`}
                                      className={`whitespace-nowrap px-2 py-1 align-middle ${
                                        colIndex === 0
                                          ? "sticky left-0 z-10 border-r border-[#D0D0D0]"
                                          : ""
                                      } ${numeric ? "text-right tabular-nums" : ""}`}
                                      style={{
                                        backgroundColor: bg,
                                        color: fg,
                                        fontWeight: excelStyle?.bold ? 700 : 400,
                                        borderBottom: "1px solid #E0E0E0",
                                        borderRight: "1px solid #EEEEEE",
                                      }}
                                    >
                                      {formatted}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
            </>
          )}

          {isCiclo13View && activeModule === "executivo" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LayoutDashboard className="h-5 w-5" />
                  Modulo Executivo (Visao_Executiva)
                </CardTitle>
                <CardDescription>
                  Leitura para decisao: ajustes, oportunidades, riscos e recomendacoes.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {executiveAnalyticsQuery.isLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !executiveAnalyticsQuery.data ? (
                  <p className="text-sm text-muted-foreground">
                    Nao foi possivel gerar leitura executiva para este arquivo.
                  </p>
                ) : (
                  <>
                    <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">SKUs</p>
                        <p className="text-xl font-semibold">
                          {formatCompactNumber(executiveAnalyticsQuery.data.summary.skuCount)}
                        </p>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">Sugestao media</p>
                        <p className="text-xl font-semibold">
                          {formatPercent(executiveAnalyticsQuery.data.summary.avgSugestaoAjustePct)}
                        </p>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">Sugestao mediana</p>
                        <p className="text-xl font-semibold">
                          {formatPercent(executiveAnalyticsQuery.data.summary.medianSugestaoAjustePct)}
                        </p>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">Classificacao dominante</p>
                        <p className="text-sm font-semibold">
                          {executiveAnalyticsQuery.data.summary.classificacaoDominante}
                        </p>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">Oportunidades / Riscos</p>
                        <p className="text-xl font-semibold">
                          {formatCompactNumber(executiveAnalyticsQuery.data.summary.oportunidades)} /{" "}
                          {formatCompactNumber(executiveAnalyticsQuery.data.summary.riscos)}
                        </p>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">Valor total melhor opcao</p>
                        <p className="text-xl font-semibold">
                          {formatCompactCurrency(executiveAnalyticsQuery.data.summary.valorTotalMelhorOpcao)}
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Top valor por SKU</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>SKU</TableHead>
                                <TableHead>Melhor opcao</TableHead>
                                <TableHead className="text-right">Valor</TableHead>
                                <TableHead className="text-right">Variacao</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {executiveTopValorFiltered.slice(0, 10).map(item => (
                                <TableRow
                                  key={`exec-valor-${item.codigo}`}
                                  className="cursor-pointer hover:bg-muted/40"
                                  onClick={() =>
                                    handleSkuRowClick(item.codigo, ["Visao_Executiva", "Analise_Cenarios"], "executivo_valor")
                                  }
                                >
                                  <TableCell>{item.codigo}</TableCell>
                                  <TableCell>{item.melhorOpcao || "--"}</TableCell>
                                  <TableCell className="text-right">{formatCompactCurrency(item.valorMelhorOpcao)}</TableCell>
                                  <TableCell className="text-right">{formatSignedPercent(item.variacaoMelhorOpcaoPct)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Top variacao por SKU</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>SKU</TableHead>
                                <TableHead>Classificacao</TableHead>
                                <TableHead className="text-right">Variacao</TableHead>
                                <TableHead className="text-right">Sugestao</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {executiveTopVariacaoFiltered.slice(0, 10).map(item => (
                                <TableRow
                                  key={`exec-var-${item.codigo}`}
                                  className="cursor-pointer hover:bg-muted/40"
                                  onClick={() =>
                                    handleSkuRowClick(item.codigo, ["Visao_Executiva", "Analise_Cenarios"], "executivo_variacao")
                                  }
                                >
                                  <TableCell>{item.codigo}</TableCell>
                                  <TableCell>{item.classificacaoAjuste || "--"}</TableCell>
                                  <TableCell className="text-right">{formatSignedPercent(item.variacaoMelhorOpcaoPct)}</TableCell>
                                  <TableCell className="text-right">{formatSignedPercent(item.sugestaoAjustePct)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </CardContent>
                      </Card>
                    </div>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Recomendacoes do ciclo</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                          {executiveAnalyticsQuery.data.recomendacoes.map((item, index) => (
                            <li key={`exec-rec-${index}`}>{item}</li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {isCiclo13View && activeModule === "clientes" && (
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Modulo Clientes
                    </CardTitle>
                    <CardDescription>
                      KPIs de recorrencia/fidelidade e detalhe paginado por cliente.
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={exportingCustomerCsv || customerDetailDataQuery.isLoading}
                    onClick={handleExportCustomerCsv}
                  >
                    {exportingCustomerCsv ? "Exportando..." : "CSV clientes"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {customerAnalyticsQuery.isLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !customerAnalyticsQuery.data ? (
                  <p className="text-sm text-muted-foreground">Nao foi possivel carregar o modulo de clientes.</p>
                ) : (
                  <>
                    <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-5">
                      <div className="rounded-lg border p-2.5">
                        <p className="text-[11px] text-muted-foreground">SKUs com clientes</p>
                        <p className="text-lg font-semibold">
                          {formatCompactNumber(customerAnalyticsQuery.data.summary.skuCount)}
                        </p>
                      </div>
                      <div className="rounded-lg border p-2.5">
                        <p className="text-[11px] text-muted-foreground">Clientes unicos</p>
                        <p className="text-lg font-semibold">
                          {formatCompactNumber(customerAnalyticsQuery.data.summary.totalClientesUnicos)}
                        </p>
                      </div>
                      <div className="rounded-lg border p-2.5">
                        <p className="text-[11px] text-muted-foreground">Media ativos 12M</p>
                        <p className="text-lg font-semibold">
                          {formatCompactNumber(customerAnalyticsQuery.data.summary.mediaClientesAtivos12m)}
                        </p>
                      </div>
                      <div className="rounded-lg border p-2.5">
                        <p className="text-[11px] text-muted-foreground">Media em risco</p>
                        <p className="text-lg font-semibold">
                          {formatCompactNumber(customerAnalyticsQuery.data.summary.mediaClientesEmRisco)}
                        </p>
                      </div>
                      <div className="rounded-lg border p-2.5">
                        <p className="text-[11px] text-muted-foreground">Tempo medio entre compras</p>
                        <p className="text-lg font-semibold">
                          {formatCompactNumber(customerAnalyticsQuery.data.summary.tempoMedioEntreComprasMeses)}
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-2">
                      <div className="rounded-lg border p-2.5">
                        <p className="mb-2 text-sm font-medium">Concentracao por marca</p>
                        <div className="max-h-[220px] overflow-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Marca</TableHead>
                                <TableHead className="text-right">SKUs</TableHead>
                                <TableHead className="text-right">Clientes unicos</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {customerAnalyticsQuery.data.concentracaoMarcas.slice(0, 8).map(item => (
                                <TableRow key={`marca-${item.marca}`}>
                                  <TableCell>{item.marca}</TableCell>
                                  <TableCell className="text-right">{formatCompactNumber(item.skuCount)}</TableCell>
                                  <TableCell className="text-right">{formatCompactNumber(item.totalClientesUnicos)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>

                      <div className="rounded-lg border p-2.5">
                        <p className="mb-2 text-sm font-medium">Top clientes por volume</p>
                        <div className="max-h-[220px] overflow-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>SKU</TableHead>
                                <TableHead>Cliente</TableHead>
                                <TableHead className="text-right">Unidades</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {customerAnalyticsQuery.data.topClientes.slice(0, 8).map(item => (
                                <TableRow key={`top-cli-${item.codigo}-${item.codCliente}`}>
                                  <TableCell>{item.codigo}</TableCell>
                                  <TableCell>{item.codCliente}</TableCell>
                                  <TableCell className="text-right">{formatCompactNumber(item.totalUnidades)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-md border bg-muted/10 p-2.5">
                      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-5">
                        <div className="space-y-1 lg:col-span-2">
                          <Label className="text-[11px] text-muted-foreground">Busca detalhe cliente</Label>
                          <Input className="h-8" value={customerSearch} onChange={event => setCustomerSearch(event.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">SKU</Label>
                          <Input className="h-8" value={customerSkuFilter} onChange={event => setCustomerSkuFilter(event.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">Cod cliente</Label>
                          <Input className="h-8" value={customerCodClienteFilter} onChange={event => setCustomerCodClienteFilter(event.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">Comportamento</Label>
                          <Select
                            value={customerComportamentoFilter || "__all"}
                            onValueChange={value => setCustomerComportamentoFilter(value === "__all" ? "" : value)}
                          >
                            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__all">Todos</SelectItem>
                              {customerComportamentoOptions.map(item => (
                                <SelectItem key={`comp-opt-${item}`} value={item}>{item}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="mt-2 grid gap-2 md:grid-cols-5">
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">Fidelidade</Label>
                          <Select
                            value={customerFidelidadeFilter || "__all"}
                            onValueChange={value => setCustomerFidelidadeFilter(value === "__all" ? "" : value)}
                          >
                            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__all">Todos</SelectItem>
                              {customerFidelidadeOptions.map(item => (
                                <SelectItem key={`fid-opt-${item}`} value={item}>{item}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">Ordenar por</Label>
                          <Select value={customerSortBy} onValueChange={setCustomerSortBy}>
                            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="TOTAL_UNIDADES">Total unidades</SelectItem>
                              <SelectItem value="MESES_COM_COMPRAS">Meses com compras</SelectItem>
                              <SelectItem value="ULTIMO_MES">Ultimo mes</SelectItem>
                              <SelectItem value="Codigo">SKU</SelectItem>
                              <SelectItem value="Cod_Cliente">Cod cliente</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">Direcao</Label>
                          <Select value={customerSortDir} onValueChange={value => setCustomerSortDir(value as "asc" | "desc")}>
                            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="asc">Ascendente</SelectItem>
                              <SelectItem value="desc">Descendente</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">Tamanho da pagina</Label>
                          <Select value={String(customerPageSize)} onValueChange={value => setCustomerPageSize(parsePageSize(value))}>
                            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="50">50</SelectItem>
                              <SelectItem value="100">100</SelectItem>
                              <SelectItem value="250">250</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-end">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 w-full"
                            onClick={() => {
                              setCustomerSearch("");
                              setCustomerSkuFilter("");
                              setCustomerCodClienteFilter("");
                              setCustomerComportamentoFilter("");
                              setCustomerFidelidadeFilter("");
                            }}
                          >
                            Limpar
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>Mostrando {customerFirstRow}-{customerLastRow} de {customerTotalRows} linhas.</span>
                      {customerDetailDataQuery.isFetching && !customerDetailDataQuery.isLoading && (
                        <Badge variant="secondary" className="text-[10px]">Atualizando...</Badge>
                      )}
                    </div>

                    {customerDetailDataQuery.isLoading ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : !customerDetailDataQuery.data ? (
                      <p className="text-sm text-muted-foreground">Sem detalhe de clientes para os filtros atuais.</p>
                    ) : (
                      <>
                        <ScrollArea className="h-[360px] rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                {customerDetailDataQuery.data.columns.map((column, index) => (
                                  <TableHead key={`customer-col-${index}`} className="whitespace-nowrap">{column}</TableHead>
                                ))}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {customerDetailDataQuery.data.rows.map((row, rowIndex) => (
                                <TableRow key={`customer-row-${rowIndex}`}>
                                  {row.map((cell, colIndex) => (
                                    <TableCell key={`customer-cell-${rowIndex}-${colIndex}`} className="whitespace-nowrap">
                                      {cell}
                                    </TableCell>
                                  ))}
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </ScrollArea>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs text-muted-foreground">
                            Pagina {customerCurrentPage} de {customerTotalPages}
                          </p>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={customerCurrentPage <= 1 || customerDetailDataQuery.isFetching}
                              onClick={() => setCustomerPage(prev => Math.max(1, prev - 1))}
                            >
                              Anterior
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={customerCurrentPage >= customerTotalPages || customerDetailDataQuery.isFetching}
                              onClick={() => setCustomerPage(prev => prev + 1)}
                            >
                              Proxima
                            </Button>
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {isCiclo13View && activeModule === "metodos" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  Modulo Metodos Estatisticos
                </CardTitle>
                <CardDescription>
                  Catalogo dos modelos e contexto do ranking vencedor do ciclo.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {methodsSheetDataQuery.isLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !methodsSheetDataQuery.data ? (
                  <p className="text-sm text-muted-foreground">
                    Aba Modelos_Estatisticos nao encontrada para este relatorio.
                  </p>
                ) : (
                  <>
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Modelos vencedores com guia de uso</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Modelo</TableHead>
                              <TableHead className="text-right">SKUs</TableHead>
                              <TableHead className="text-right">MAPE medio</TableHead>
                              <TableHead>Quando usar</TableHead>
                              <TableHead>Complexidade</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {modelRankingWithCatalog.slice(0, 12).map(item => (
                              <TableRow key={`method-ranking-${item.modelo}`}>
                                <TableCell>{item.modelo}</TableCell>
                                <TableCell className="text-right">{formatCompactNumber(item.skuCount)}</TableCell>
                                <TableCell className="text-right">{formatPercent(item.avgMape)}</TableCell>
                                <TableCell className="max-w-[360px] whitespace-normal">
                                  {item.catalog?.quandoUsar || "--"}
                                </TableCell>
                                <TableCell>{item.catalog?.complexidade || "--"}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Catalogo completo</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ScrollArea className="h-[420px] rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                {methodsSheetDataQuery.data.columns.map((column, index) => (
                                  <TableHead key={`method-col-${index}`}>{column}</TableHead>
                                ))}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {methodsSheetDataQuery.data.rows.map((row, rowIndex) => (
                                <TableRow key={`method-row-${rowIndex}`}>
                                  {row.map((cell, colIndex) => (
                                    <TableCell key={`method-cell-${rowIndex}-${colIndex}`} className="max-w-[300px] whitespace-normal">
                                      {cell}
                                    </TableCell>
                                  ))}
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
