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
  Lightbulb,
  History,
  Save,
  GitCompare,
  Printer,
  LayoutDashboard,
  Users,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
} from "recharts";

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
  const [cicloRef, setCicloRef] = useState("");
  const [horizonteRef, setHorizonteRef] = useState("");
  const [snapshotTitulo, setSnapshotTitulo] = useState("");
  const [snapshotObservacoes, setSnapshotObservacoes] = useState("");
  const [compareBaseSnapshotId, setCompareBaseSnapshotId] = useState<number | null>(null);
  const [compareTargetSnapshotId, setCompareTargetSnapshotId] = useState<number | null>(null);
  const [selectedSummarySnapshotId, setSelectedSummarySnapshotId] = useState<number | null>(null);
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
  const skipPageResetOnFirstRender = useRef(true);
  const cycleSummaryRef = useRef<HTMLDivElement | null>(null);
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
  const effectiveSearch = [debouncedSearch.trim(), debouncedGlobalSkuSearch.trim()]
    .filter(Boolean)
    .join(" ");

  const { data: job, isLoading: loadingJob } = trpc.previsaoPython.getById.useQuery(
    { id: jobId || 0 },
    { enabled: isValidJobId, refetchInterval: 4000 }
  );

  const hasOutputAvailable = Boolean(job?.workdir && job?.outputFileName);
  const canVisualizeJob = hasOutputAvailable;

  const { data: workbookSheets, isLoading: loadingSheets } = trpc.previsaoPython.workbookMeta.useQuery(
    { id: jobId || 0 },
    { enabled: isValidJobId && canVisualizeJob, staleTime: 30_000 }
  );

  const { data: analytics, isLoading: loadingAnalytics } = trpc.previsaoPython.analytics.useQuery(
    { id: jobId || 0, monthsLimit: 24 },
    { enabled: isValidJobId && canVisualizeJob, staleTime: 20_000 }
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

  const explainabilityQuery = trpc.previsaoPython.explainability.useQuery(
    { id: jobId || 0, limit: 40 },
    { enabled: isValidJobId && canVisualizeJob, staleTime: 20_000 }
  );

  const scenarioSnapshotsQuery = trpc.previsaoPython.scenarioSnapshots.useQuery(
    { id: jobId || 0 },
    { enabled: isValidJobId && canVisualizeJob, staleTime: 10_000 }
  );
  const scenarioSnapshots = scenarioSnapshotsQuery.data ?? [];

  const compareSnapshotsEnabled =
    isValidJobId &&
    canVisualizeJob &&
    Boolean(compareBaseSnapshotId) &&
    Boolean(compareTargetSnapshotId) &&
    compareBaseSnapshotId !== compareTargetSnapshotId;

  const compareSnapshotsQuery = trpc.previsaoPython.compareScenarioSnapshots.useQuery(
    {
      id: jobId || 0,
      baseSnapshotId: compareBaseSnapshotId || 0,
      targetSnapshotId: compareTargetSnapshotId || 0,
    },
    {
      enabled: compareSnapshotsEnabled,
      staleTime: 10_000,
    }
  );

  const cycleSummaryQuery = trpc.previsaoPython.cycleSummary.useQuery(
    {
      id: jobId || 0,
      snapshotId: selectedSummarySnapshotId || undefined,
    },
    {
      enabled: isValidJobId && canVisualizeJob,
      staleTime: 20_000,
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
      filters: debouncedFilters,
    },
    {
      enabled: isValidJobId && canVisualizeJob && Boolean(selectedSheet),
      staleTime: 10_000,
      placeholderData: previous => previous,
    }
  );

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

  const createSnapshotMutation = trpc.previsaoPython.createScenarioSnapshot.useMutation({
    onSuccess: snapshot => {
      setSelectedSummarySnapshotId(snapshot.id);
      setCompareTargetSnapshotId(snapshot.id);
      setSnapshotTitulo("");
      setSnapshotObservacoes("");
      void utils.previsaoPython.scenarioSnapshots.invalidate();
      void utils.previsaoPython.cycleSummary.invalidate();
      toast.success(`Snapshot ${snapshot.cicloRef} salvo com sucesso.`);
    },
    onError: error => toast.error(error.message),
  });

  const downloadMutation = trpc.previsaoPython.download.useMutation({
    onSuccess: payload => {
      const binary = atob(payload.contentBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const blob = new Blob([bytes], { type: payload.mimeType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = payload.fileName;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("Download iniciado.");
    },
    onError: error => toast.error(error.message),
  });

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
    if (scenarioSnapshots.length === 0) {
      if (selectedSummarySnapshotId !== null) setSelectedSummarySnapshotId(null);
      if (compareBaseSnapshotId !== null) setCompareBaseSnapshotId(null);
      if (compareTargetSnapshotId !== null) setCompareTargetSnapshotId(null);
      return;
    }

    const latestSnapshotId = scenarioSnapshots[0].id;
    const hasSelectedSummary = scenarioSnapshots.some(
      snapshot => snapshot.id === selectedSummarySnapshotId
    );
    if (!hasSelectedSummary) {
      setSelectedSummarySnapshotId(latestSnapshotId);
    }

    const hasTarget = scenarioSnapshots.some(snapshot => snapshot.id === compareTargetSnapshotId);
    const nextTargetId = hasTarget ? compareTargetSnapshotId : latestSnapshotId;
    if (nextTargetId !== compareTargetSnapshotId) {
      setCompareTargetSnapshotId(nextTargetId);
    }

    const preferredBase = scenarioSnapshots.find(snapshot => snapshot.id !== nextTargetId) || null;
    const hasBase = scenarioSnapshots.some(snapshot => snapshot.id === compareBaseSnapshotId);
    const isSameAsTarget = compareBaseSnapshotId === nextTargetId;
    if (!hasBase || isSameAsTarget) {
      setCompareBaseSnapshotId(preferredBase ? preferredBase.id : nextTargetId);
    }
  }, [
    compareBaseSnapshotId,
    compareTargetSnapshotId,
    scenarioSnapshots,
    selectedSummarySnapshotId,
  ]);

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

  const modelChartData = useMemo(
    () =>
      (analytics?.modelRanking || []).slice(0, 8).map(item => ({
        modelo: item.modelo,
        skuCount: item.skuCount,
      })),
    [analytics?.modelRanking]
  );

  const modelMapeChartData = useMemo(
    () =>
      (analytics?.modelRanking || [])
        .filter(item => item.avgMape !== null)
        .slice(0, 8)
        .map(item => ({
          modelo: item.modelo,
          avgMapePct: Number(((item.avgMape ?? 0) * 100).toFixed(2)),
        })),
    [analytics?.modelRanking]
  );

  const acuracidadeChartData = useMemo(
    () =>
      (analytics?.acuracidadeDistribution || []).slice(0, 8).map(item => ({
        classificacao: item.label,
        count: item.count,
      })),
    [analytics?.acuracidadeDistribution]
  );

  const biasChartData = useMemo(
    () =>
      (analytics?.biasDistribution || []).slice(0, 8).map(item => ({
        bias: item.label,
        count: item.count,
      })),
    [analytics?.biasDistribution]
  );

  const status12mChartData = useMemo(
    () =>
      (analytics?.status12mDistribution || []).slice(0, 8).map(item => ({
        status: item.label,
        count: item.count,
      })),
    [analytics?.status12mDistribution]
  );

  const filteredTopErros = useMemo(
    () =>
      (analytics?.topErros || []).filter(item =>
        !normalizedSkuSearch || item.codigo.toLowerCase().includes(normalizedSkuSearch)
      ),
    [analytics?.topErros, normalizedSkuSearch]
  );

  const filteredTopAcertos = useMemo(
    () =>
      (analytics?.topAcertos || []).filter(item =>
        !normalizedSkuSearch || item.codigo.toLowerCase().includes(normalizedSkuSearch)
      ),
    [analytics?.topAcertos, normalizedSkuSearch]
  );

  const filteredTopOportunidades = useMemo(
    () =>
      (analytics?.topOportunidades || []).filter(item =>
        !normalizedSkuSearch || item.codigo.toLowerCase().includes(normalizedSkuSearch)
      ),
    [analytics?.topOportunidades, normalizedSkuSearch]
  );

  const filteredTopRiscos = useMemo(
    () =>
      (analytics?.topRiscos || []).filter(item =>
        !normalizedSkuSearch || item.codigo.toLowerCase().includes(normalizedSkuSearch)
      ),
    [analytics?.topRiscos, normalizedSkuSearch]
  );

  const filteredExplainabilityItems = useMemo(
    () =>
      (explainabilityQuery.data?.itens || []).filter(item =>
        !normalizedSkuSearch || item.codigo.toLowerCase().includes(normalizedSkuSearch)
      ),
    [explainabilityQuery.data?.itens, normalizedSkuSearch]
  );

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
      (analytics?.modelRanking || []).slice(0, 12).map(item => ({
        ...item,
        catalog: methodsCatalogMap.get(normalizeToken(item.modelo)) || null,
      })),
    [analytics?.modelRanking, methodsCatalogMap]
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

  const handleCreateScenarioSnapshot = () => {
    if (!cicloRef.trim()) {
      toast.error("Informe o ciclo para salvar o snapshot.");
      return;
    }
    createSnapshotMutation.mutate({
      id: jobId || 0,
      cicloRef: cicloRef.trim(),
      horizonteRef: horizonteRef.trim() || undefined,
      titulo: snapshotTitulo.trim() || undefined,
      observacoes: snapshotObservacoes.trim() || undefined,
    });
  };

  const handleExportCycleSummaryPdf = () => {
    const summaryRoot = cycleSummaryRef.current;
    if (!summaryRoot) {
      toast.error("Resumo do ciclo ainda nao carregado.");
      return;
    }

    const printWindow = window.open("", "_blank", "width=1100,height=900");
    if (!printWindow) {
      toast.error("Nao foi possivel abrir janela para impressao.");
      return;
    }

    const css = `
      body { font-family: Arial, sans-serif; margin: 24px; color: #0f172a; }
      h1, h2, h3 { margin: 0 0 10px; }
      .card { border: 1px solid #cbd5e1; border-radius: 10px; padding: 14px; margin-bottom: 12px; }
      .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
      .kpi { border: 1px solid #dbeafe; border-radius: 8px; padding: 10px; background: #f8fafc; }
      ul { margin: 0; padding-left: 20px; }
      li { margin-bottom: 6px; }
      @media print { body { margin: 8mm; } }
    `;

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Resumo do ciclo - Job ${jobId}</title>
          <style>${css}</style>
        </head>
        <body>
          ${summaryRoot.innerHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Visualizacao do Excel da Previsao</h1>
          <p className="text-muted-foreground">Job #{jobId}</p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setLocation("/previsao-python")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
          <Button
            variant="outline"
            disabled={!canVisualizeJob || downloadMutation.isPending}
            onClick={() => downloadMutation.mutate({ id: jobId })}
          >
            <Download className="mr-2 h-4 w-4" />
            Excel
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Metadados do Job</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingJob ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !job ? (
            <p className="text-sm text-muted-foreground">Job nao encontrado.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-4">
              <div>
                <span className="text-muted-foreground">Status: </span>
                <Badge variant={job.status === "SUCCESS" ? "default" : "secondary"}>{job.status}</Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Versao: </span>
                <span className="font-medium">{job.scriptVersion}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Criado em: </span>
                <span className="font-medium">{formatDate(job.createdAt)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Finalizado em: </span>
                <span className="font-medium">{formatDate(job.finishedAt)}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

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
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Resumo Analitico
              </CardTitle>
              <CardDescription>Leitura visual dos principais resultados do job #{jobId}.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {loadingAnalytics ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !analytics ? (
                <p className="text-sm text-muted-foreground">Nao foi possivel gerar analise visual para este relatorio.</p>
              ) : (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Painel Executivo de Previsao</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
                        <div className="rounded-lg border p-4">
                          <p className="text-xs text-muted-foreground">SKUs analisados</p>
                          <p className="text-2xl font-semibold">{formatCompactNumber(analytics.summary.skuCount)}</p>
                        </div>
                        <div className="rounded-lg border p-4">
                          <p className="text-xs text-muted-foreground">MAPE medio</p>
                          <p className="text-2xl font-semibold">{formatPercent(analytics.summary.avgMapeTotal)}</p>
                        </div>
                        <div className="rounded-lg border p-4">
                          <p className="text-xs text-muted-foreground">MAPE mediano</p>
                          <p className="text-2xl font-semibold">{formatPercent(analytics.summary.medianMapeTotal)}</p>
                        </div>
                        <div className="rounded-lg border p-4">
                          <p className="text-xs text-muted-foreground">Acuracidade media</p>
                          <p className="text-2xl font-semibold">{formatPercent(analytics.summary.acuracidadeMedia)}</p>
                        </div>
                        <div className="rounded-lg border p-4">
                          <p className="text-xs text-muted-foreground">Modelos vencedores</p>
                          <p className="text-2xl font-semibold">{formatCompactNumber(analytics.summary.modelCount)}</p>
                        </div>
                        <div className="rounded-lg border p-4">
                          <p className="text-xs text-muted-foreground">Sugestao media ajuste</p>
                          <p className="text-2xl font-semibold">{formatPercent(analytics.summary.avgSugestaoAjustePct)}</p>
                        </div>
                      </div>

                      <div className="grid gap-4 lg:grid-cols-2">
                        <Card>
                          <CardHeader>
                            <CardTitle className="text-base">Tendencia mensal (ultimos 24 meses)</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="h-[280px]">
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={analytics.monthlySeries}>
                                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                  <XAxis dataKey="label" className="text-xs" />
                                  <YAxis className="text-xs" />
                                  <Tooltip formatter={(value: number) => [value.toLocaleString("pt-BR"), "Volume"]} />
                                  <Line type="monotone" dataKey="total" stroke="#2563eb" strokeWidth={2} dot={false} />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader>
                            <div className="flex items-center justify-between gap-2">
                              <CardTitle className="text-base">Status 12M (distribuicao)</CardTitle>
                              {renderDrillActions("status12m")}
                            </div>
                          </CardHeader>
                          <CardContent>
                            {status12mChartData.length === 0 ? (
                              <p className="text-sm text-muted-foreground">Sem dados de status 12M para este relatorio.</p>
                            ) : (
                              <div className="h-[280px]">
                                <ResponsiveContainer width="100%" height="100%">
                                  <BarChart data={status12mChartData}>
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                    <XAxis dataKey="status" className="text-xs" interval={0} angle={-18} textAnchor="end" height={70} />
                                    <YAxis className="text-xs" />
                                    <Tooltip formatter={(value: number) => [value, "SKUs"]} />
                                    <Bar
                                      dataKey="count"
                                      fill="#2563eb"
                                      radius={[4, 4, 0, 0]}
                                      cursor="pointer"
                                      onClick={(entry: any) =>
                                        applyDrillFilter(String(entry?.payload?.status ?? ""), {
                                          preferredSheets: ["Geral"],
                                          columnAliases: ["STATUS_12M", "STATUS 12M"],
                                          message: "Filtro aplicado por status 12M.",
                                          trailLabel: `Status 12M: ${String(entry?.payload?.status ?? "").trim()}`,
                                          sourceKey: "status12m",
                                        })
                                      }
                                    />
                                  </BarChart>
                                </ResponsiveContainer>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </div>

                      <div className="grid gap-4 lg:grid-cols-2">
                        <Card>
                          <CardHeader>
                            <div className="flex items-center justify-between gap-2">
                              <CardTitle className="text-base">Top oportunidades (cenarios)</CardTitle>
                              {renderDrillActions("oportunidades")}
                            </div>
                          </CardHeader>
                          <CardContent>
                            {filteredTopOportunidades.length === 0 ? (
                              <p className="text-sm text-muted-foreground">Sem oportunidades identificadas.</p>
                            ) : (
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
                                  {filteredTopOportunidades.slice(0, 6).map(item => (
                                    <TableRow
                                      key={`oportunidade-${item.codigo}`}
                                      className="cursor-pointer hover:bg-muted/40"
                                      onClick={() =>
                                        handleSkuRowClick(item.codigo, ["Analise_Cenarios"], "oportunidades")
                                      }
                                    >
                                      <TableCell>{item.codigo}</TableCell>
                                      <TableCell>{item.melhorOpcao || "--"}</TableCell>
                                      <TableCell className="text-right">
                                        {formatCompactCurrency(item.valorMelhorOpcao)}
                                      </TableCell>
                                      <TableCell className="text-right text-emerald-600">
                                        {formatSignedPercent(item.variacaoPct)}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            )}
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader>
                            <div className="flex items-center justify-between gap-2">
                              <CardTitle className="text-base">Top riscos (cenarios)</CardTitle>
                              {renderDrillActions("riscos")}
                            </div>
                          </CardHeader>
                          <CardContent>
                            {filteredTopRiscos.length === 0 ? (
                              <p className="text-sm text-muted-foreground">Sem riscos identificados.</p>
                            ) : (
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
                                  {filteredTopRiscos.slice(0, 6).map(item => (
                                    <TableRow
                                      key={`risco-${item.codigo}`}
                                      className="cursor-pointer hover:bg-muted/40"
                                      onClick={() =>
                                        handleSkuRowClick(item.codigo, ["Analise_Cenarios"], "riscos")
                                      }
                                    >
                                      <TableCell>{item.codigo}</TableCell>
                                      <TableCell>{item.melhorOpcao || "--"}</TableCell>
                                      <TableCell className="text-right">
                                        {formatCompactCurrency(item.valorMelhorOpcao)}
                                      </TableCell>
                                      <TableCell className="text-right text-rose-600">
                                        {formatSignedPercent(item.variacaoPct)}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            )}
                          </CardContent>
                        </Card>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Dashboard de Modelos</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="grid gap-4 lg:grid-cols-2">
                        <Card>
                          <CardHeader>
                            <div className="flex items-center justify-between gap-2">
                              <CardTitle className="text-base">Modelos mais frequentes</CardTitle>
                              {renderDrillActions("modelo_frequencia")}
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="h-[280px]">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={modelChartData}>
                                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                  <XAxis dataKey="modelo" className="text-xs" interval={0} angle={-20} textAnchor="end" height={70} />
                                  <YAxis className="text-xs" />
                                  <Tooltip formatter={(value: number) => [value, "SKUs"]} />
                                  <Bar
                                    dataKey="skuCount"
                                    fill="#0d9488"
                                    radius={[4, 4, 0, 0]}
                                    cursor="pointer"
                                    onClick={(entry: any) =>
                                      applyDrillFilter(String(entry?.payload?.modelo ?? ""), {
                                        preferredSheets: ["Backtest_Sku", "Backtest"],
                                        columnAliases: ["MELHOR_MODELO", "MELHOR MODELO", "MODELO"],
                                        message: "Filtro aplicado por modelo.",
                                        trailLabel: `Modelo: ${String(entry?.payload?.modelo ?? "").trim()}`,
                                        sourceKey: "modelo_frequencia",
                                      })
                                    }
                                  />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader>
                            <div className="flex items-center justify-between gap-2">
                              <CardTitle className="text-base">MAPE medio por modelo</CardTitle>
                              {renderDrillActions("modelo_mape")}
                            </div>
                          </CardHeader>
                          <CardContent>
                            {modelMapeChartData.length === 0 ? (
                              <p className="text-sm text-muted-foreground">Sem dados de MAPE por modelo.</p>
                            ) : (
                              <div className="h-[280px]">
                                <ResponsiveContainer width="100%" height="100%">
                                  <BarChart data={modelMapeChartData}>
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                    <XAxis dataKey="modelo" className="text-xs" interval={0} angle={-20} textAnchor="end" height={70} />
                                    <YAxis className="text-xs" />
                                    <Tooltip formatter={(value: number) => [`${value.toLocaleString("pt-BR")}%`, "MAPE"]} />
                                    <Bar
                                      dataKey="avgMapePct"
                                      fill="#14b8a6"
                                      radius={[4, 4, 0, 0]}
                                      cursor="pointer"
                                      onClick={(entry: any) =>
                                        applyDrillFilter(String(entry?.payload?.modelo ?? ""), {
                                          preferredSheets: ["Backtest_Sku", "Backtest"],
                                          columnAliases: ["MELHOR_MODELO", "MELHOR MODELO", "MODELO"],
                                          message: "Filtro aplicado por modelo.",
                                          trailLabel: `Modelo: ${String(entry?.payload?.modelo ?? "").trim()}`,
                                          sourceKey: "modelo_mape",
                                        })
                                      }
                                    />
                                  </BarChart>
                                </ResponsiveContainer>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </div>

                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Ranking de modelos</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ScrollArea className="h-[260px] rounded-md border">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Modelo</TableHead>
                                  <TableHead className="text-right">SKUs</TableHead>
                                  <TableHead className="text-right">MAPE medio</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {analytics.modelRanking.slice(0, 12).map(item => (
                                  <TableRow key={`modelo-${item.modelo}`}>
                                    <TableCell>{item.modelo}</TableCell>
                                    <TableCell className="text-right">{formatCompactNumber(item.skuCount)}</TableCell>
                                    <TableCell className="text-right">{formatPercent(item.avgMape)}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </ScrollArea>
                        </CardContent>
                      </Card>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Dashboard de Erro e Vies</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="grid gap-4 lg:grid-cols-2">
                        <Card>
                          <CardHeader>
                            <div className="flex items-center justify-between gap-2">
                              <CardTitle className="text-base">Distribuicao de acuracidade</CardTitle>
                              {renderDrillActions("acuracidade")}
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="h-[280px]">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={acuracidadeChartData}>
                                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                  <XAxis dataKey="classificacao" className="text-xs" interval={0} angle={-20} textAnchor="end" height={70} />
                                  <YAxis className="text-xs" />
                                  <Tooltip formatter={(value: number) => [value, "SKUs"]} />
                                  <Bar
                                    dataKey="count"
                                    fill="#f59e0b"
                                    radius={[4, 4, 0, 0]}
                                    cursor="pointer"
                                    onClick={(entry: any) =>
                                      applyDrillFilter(String(entry?.payload?.classificacao ?? ""), {
                                        preferredSheets: ["Acuracidade"],
                                        columnAliases: [
                                          "CLASSIFICACAO_ERRO_TOTAL",
                                          "CLASSIFICACAO ERRO TOTAL",
                                        ],
                                        message: "Filtro aplicado por classificacao de erro.",
                                        trailLabel: `Classificacao erro: ${String(entry?.payload?.classificacao ?? "").trim()}`,
                                        sourceKey: "acuracidade",
                                      })
                                    }
                                  />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader>
                            <div className="flex items-center justify-between gap-2">
                              <CardTitle className="text-base">Distribuicao de vies</CardTitle>
                              {renderDrillActions("vies")}
                            </div>
                          </CardHeader>
                          <CardContent>
                            {biasChartData.length === 0 ? (
                              <p className="text-sm text-muted-foreground">Sem dados de vies para este relatorio.</p>
                            ) : (
                              <div className="h-[280px]">
                                <ResponsiveContainer width="100%" height="100%">
                                  <BarChart data={biasChartData}>
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                    <XAxis dataKey="bias" className="text-xs" interval={0} angle={-20} textAnchor="end" height={70} />
                                    <YAxis className="text-xs" />
                                    <Tooltip formatter={(value: number) => [value, "SKUs"]} />
                                    <Bar
                                      dataKey="count"
                                      fill="#6366f1"
                                      radius={[4, 4, 0, 0]}
                                      cursor="pointer"
                                      onClick={(entry: any) =>
                                        applyDrillFilter(String(entry?.payload?.bias ?? ""), {
                                          preferredSheets: ["Acuracidade"],
                                          columnAliases: ["BIAS"],
                                          message: "Filtro aplicado por vies.",
                                          trailLabel: `Vies: ${String(entry?.payload?.bias ?? "").trim()}`,
                                          sourceKey: "vies",
                                        })
                                      }
                                    />
                                  </BarChart>
                                </ResponsiveContainer>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </div>

                      <div className="grid gap-4 lg:grid-cols-2">
                        <Card>
                          <CardHeader>
                            <div className="flex items-center justify-between gap-2">
                              <CardTitle className="text-base">Top erros</CardTitle>
                              {renderDrillActions("erros")}
                            </div>
                          </CardHeader>
                          <CardContent>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>SKU</TableHead>
                                  <TableHead className="text-right">MAPE</TableHead>
                                  <TableHead className="text-right">Ajuste</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {filteredTopErros.slice(0, 8).map(item => (
                                  <TableRow
                                    key={`erro-${item.codigo}`}
                                    className="cursor-pointer hover:bg-muted/40"
                                    onClick={() =>
                                      handleSkuRowClick(item.codigo, ["Acuracidade"], "erros")
                                    }
                                  >
                                    <TableCell>{item.codigo}</TableCell>
                                    <TableCell className="text-right">{formatPercent(item.mapeTotal)}</TableCell>
                                    <TableCell className="text-right">{formatPercent(item.sugestaoAjustePct)}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader>
                            <div className="flex items-center justify-between gap-2">
                              <CardTitle className="text-base">Top acertos</CardTitle>
                              {renderDrillActions("acertos")}
                            </div>
                          </CardHeader>
                          <CardContent>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>SKU</TableHead>
                                  <TableHead className="text-right">MAPE</TableHead>
                                  <TableHead className="text-right">Ajuste</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {filteredTopAcertos.slice(0, 8).map(item => (
                                  <TableRow
                                    key={`acerto-${item.codigo}`}
                                    className="cursor-pointer hover:bg-muted/40"
                                    onClick={() =>
                                      handleSkuRowClick(item.codigo, ["Acuracidade"], "acertos")
                                    }
                                  >
                                    <TableCell>{item.codigo}</TableCell>
                                    <TableCell className="text-right">{formatPercent(item.mapeTotal)}</TableCell>
                                    <TableCell className="text-right">{formatPercent(item.sugestaoAjustePct)}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </CardContent>
                        </Card>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2">
                  <Lightbulb className="h-5 w-5" />
                  Camada de explicabilidade da previsao
                </CardTitle>
                {renderDrillActions("explicabilidade")}
              </div>
              <CardDescription>
                Explicacao por SKU: por que subiu/caiu e o que pode melhorar no proximo ciclo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {explainabilityQuery.isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !explainabilityQuery.data ? (
                <p className="text-sm text-muted-foreground">
                  Nao foi possivel gerar explicabilidade para este relatorio.
                </p>
              ) : (
                <>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">SKUs avaliados</p>
                      <p className="text-xl font-semibold">
                        {formatCompactNumber(explainabilityQuery.data.totalSku)}
                      </p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Variacao relevante (3M)</p>
                      <p className="text-xl font-semibold">
                        {formatCompactNumber(explainabilityQuery.data.skuComVariacaoRelevante)}
                      </p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Atualizado em</p>
                      <p className="text-sm font-medium">
                        {formatDate(explainabilityQuery.data.generatedAt)}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg border bg-muted/20 p-3">
                    <p className="mb-2 text-sm font-medium">Leituras e melhorias sugeridas</p>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {explainabilityQuery.data.recomendacoesGerais.map((item, index) => (
                        <li key={`rec-${index}`}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-md border">
                    <Table className="table-fixed [&_th]:whitespace-normal [&_td]:whitespace-normal [&_th]:align-top [&_td]:align-top">
                      <colgroup>
                        <col className="w-[26%]" />
                        <col className="w-[9%]" />
                        <col className="w-[31%]" />
                        <col className="w-[34%]" />
                      </colgroup>
                      <TableHeader>
                        <TableRow>
                          <TableHead>SKU</TableHead>
                          <TableHead>Movimento</TableHead>
                          <TableHead>Por que aconteceu</TableHead>
                          <TableHead>O que melhorar</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredExplainabilityItems.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                              Nenhum SKU encontrado para o filtro global atual.
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredExplainabilityItems.slice(0, 12).map(item => (
                            <TableRow
                              key={`exp-${item.codigo}`}
                              className="cursor-pointer hover:bg-muted/30"
                              onClick={() =>
                                handleSkuRowClick(
                                  item.codigo,
                                  ["Geral", "Acuracidade", "Analise_Cenarios"],
                                  "explicabilidade"
                                )
                              }
                            >
                              <TableCell className="font-medium break-words">{item.codigo}</TableCell>
                              <TableCell className="space-y-1">
                                <Badge variant={getMovementBadgeVariant(item.direcao)}>
                                  {item.direcao}
                                </Badge>
                                <p className="text-xs text-muted-foreground">
                                  {formatSignedPercent(item.variacaoPct)}
                                </p>
                              </TableCell>
                              <TableCell className="break-words">
                                <p className="text-sm leading-relaxed">{item.explicacao}</p>
                              </TableCell>
                              <TableCell className="break-words">
                                <p className="text-sm leading-relaxed text-muted-foreground">
                                  {item.melhorias[0] || "Sem recomendacao adicional."}
                                </p>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Versionamento de cenarios
              </CardTitle>
              <CardDescription>
                Salve snapshots por ciclo e compare mudancas para auditoria da previsao.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border bg-muted/20 p-3">
                <div className="grid gap-3 md:grid-cols-5">
                  <div className="space-y-1">
                    <Label>Ciclo</Label>
                    <Input
                      placeholder="Ex.: 2026-C2"
                      value={cicloRef}
                      onChange={event => setCicloRef(event.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Horizonte</Label>
                    <Input
                      placeholder="Ex.: M+1"
                      value={horizonteRef}
                      onChange={event => setHorizonteRef(event.target.value)}
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label>Titulo (opcional)</Label>
                    <Input
                      placeholder="Ex.: fechamento comercial"
                      value={snapshotTitulo}
                      onChange={event => setSnapshotTitulo(event.target.value)}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      className="w-full"
                      onClick={handleCreateScenarioSnapshot}
                      disabled={createSnapshotMutation.isPending || !cicloRef.trim()}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      {createSnapshotMutation.isPending ? "Salvando..." : "Salvar snapshot"}
                    </Button>
                  </div>
                </div>
                <div className="mt-3 space-y-1">
                  <Label>Observacoes (opcional)</Label>
                  <Input
                    placeholder="Contexto da mudanca de cenario"
                    value={snapshotObservacoes}
                    onChange={event => setSnapshotObservacoes(event.target.value)}
                  />
                </div>
              </div>

              {scenarioSnapshotsQuery.isLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : scenarioSnapshots.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum snapshot salvo ainda para este job.
                </p>
              ) : (
                <>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ciclo</TableHead>
                          <TableHead>Horizonte</TableHead>
                          <TableHead>SKUs</TableHead>
                          <TableHead>Oportunidades</TableHead>
                          <TableHead>Riscos</TableHead>
                          <TableHead>Criado em</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {scenarioSnapshots.map(snapshot => (
                          <TableRow key={`snapshot-${snapshot.id}`}>
                            <TableCell className="font-medium">{snapshot.cicloRef}</TableCell>
                            <TableCell>{snapshot.horizonteRef || "--"}</TableCell>
                            <TableCell>{formatCompactNumber(snapshot.summary.skuCount)}</TableCell>
                            <TableCell className="text-emerald-600">
                              {formatCompactNumber(snapshot.summary.oportunidades)}
                            </TableCell>
                            <TableCell className="text-rose-600">
                              {formatCompactNumber(snapshot.summary.riscos)}
                            </TableCell>
                            <TableCell>{formatDate(snapshot.createdAt)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {scenarioSnapshots.length >= 2 && (
                    <div className="rounded-md border bg-muted/20 p-3 space-y-3">
                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="space-y-1">
                          <Label>Base</Label>
                          <Select
                            value={compareBaseSnapshotId ? String(compareBaseSnapshotId) : "__none"}
                            onValueChange={value =>
                              setCompareBaseSnapshotId(value === "__none" ? null : Number(value))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Snapshot base" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none">Selecione</SelectItem>
                              {scenarioSnapshots.map(snapshot => (
                                <SelectItem key={`base-${snapshot.id}`} value={String(snapshot.id)}>
                                  {snapshot.cicloRef} {snapshot.horizonteRef ? `(${snapshot.horizonteRef})` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <Label>Comparar com</Label>
                          <Select
                            value={compareTargetSnapshotId ? String(compareTargetSnapshotId) : "__none"}
                            onValueChange={value =>
                              setCompareTargetSnapshotId(value === "__none" ? null : Number(value))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Snapshot alvo" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none">Selecione</SelectItem>
                              {scenarioSnapshots.map(snapshot => (
                                <SelectItem key={`target-${snapshot.id}`} value={String(snapshot.id)}>
                                  {snapshot.cicloRef} {snapshot.horizonteRef ? `(${snapshot.horizonteRef})` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex items-end">
                          <div className="rounded-md border bg-background px-3 py-2 text-sm w-full">
                            <p className="font-medium flex items-center gap-2">
                              <GitCompare className="h-4 w-4" />
                              Comparativo
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {compareSnapshotsEnabled
                                ? "Deltas entre snapshots selecionados."
                                : "Selecione base e alvo diferentes."}
                            </p>
                          </div>
                        </div>
                      </div>

                      {compareSnapshotsEnabled && (
                        <>
                          {compareSnapshotsQuery.isLoading ? (
                            <div className="flex justify-center py-4">
                              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                            </div>
                          ) : !compareSnapshotsQuery.data ? (
                            <p className="text-sm text-muted-foreground">
                              Nao foi possivel comparar os snapshots.
                            </p>
                          ) : (
                            <div className="space-y-3">
                              <div className="grid gap-3 md:grid-cols-3">
                                <div className="rounded-lg border p-3">
                                  <p className="text-xs text-muted-foreground">SKUs comparados</p>
                                  <p className="text-lg font-semibold">
                                    {formatCompactNumber(compareSnapshotsQuery.data.skuComparados)}
                                  </p>
                                </div>
                                <div className="rounded-lg border p-3">
                                  <p className="text-xs text-muted-foreground">Mudanca de opcao</p>
                                  <p className="text-lg font-semibold">
                                    {formatCompactNumber(compareSnapshotsQuery.data.skuMudouOpcao)}
                                  </p>
                                </div>
                                <div className="rounded-lg border p-3">
                                  <p className="text-xs text-muted-foreground">Delta medio</p>
                                  <p className="text-lg font-semibold">
                                    {formatSignedPercent(compareSnapshotsQuery.data.deltaVariacaoMediaPct)}
                                  </p>
                                </div>
                              </div>

                              <div className="rounded-md border">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>SKU</TableHead>
                                      <TableHead>Base</TableHead>
                                      <TableHead>Alvo</TableHead>
                                      <TableHead>Delta</TableHead>
                                      <TableHead>Opcao</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {compareSnapshotsQuery.data.principaisMudancas.length === 0 ? (
                                      <TableRow>
                                        <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                                          Sem mudancas relevantes entre os snapshots selecionados.
                                        </TableCell>
                                      </TableRow>
                                    ) : (
                                      compareSnapshotsQuery.data.principaisMudancas
                                        .slice(0, 10)
                                        .map(item => (
                                          <TableRow key={`cmp-${item.codigo}`}>
                                            <TableCell>{item.codigo}</TableCell>
                                            <TableCell>{formatSignedPercent(item.variacaoBasePct)}</TableCell>
                                            <TableCell>{formatSignedPercent(item.variacaoTargetPct)}</TableCell>
                                            <TableCell>{formatSignedPercent(item.deltaVariacaoPct)}</TableCell>
                                            <TableCell>
                                              {item.mudouOpcao
                                                ? `${item.melhorOpcaoBase} -> ${item.melhorOpcaoTarget}`
                                                : item.melhorOpcaoTarget}
                                            </TableCell>
                                          </TableRow>
                                        ))
                                    )}
                                  </TableBody>
                                </Table>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Resumo do ciclo (diretoria)</CardTitle>
                  <CardDescription>
                    Uma tela executiva com KPIs, riscos, decisoes pendentes e plano de acao.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {scenarioSnapshots.length > 0 && (
                    <Select
                      value={selectedSummarySnapshotId ? String(selectedSummarySnapshotId) : "__none"}
                      onValueChange={value =>
                        setSelectedSummarySnapshotId(value === "__none" ? null : Number(value))
                      }
                    >
                      <SelectTrigger className="w-[220px]">
                        <SelectValue placeholder="Snapshot do resumo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Sem snapshot</SelectItem>
                        {scenarioSnapshots.map(snapshot => (
                          <SelectItem key={`summary-${snapshot.id}`} value={String(snapshot.id)}>
                            {snapshot.cicloRef} {snapshot.horizonteRef ? `(${snapshot.horizonteRef})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Button
                    variant="outline"
                    onClick={handleExportCycleSummaryPdf}
                    disabled={!cycleSummaryQuery.data}
                  >
                    <Printer className="mr-2 h-4 w-4" />
                    PDF
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {cycleSummaryQuery.isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !cycleSummaryQuery.data ? (
                <p className="text-sm text-muted-foreground">
                  Nao foi possivel montar o resumo do ciclo.
                </p>
              ) : (
                <div ref={cycleSummaryRef} className="space-y-4">
                  <div className="card rounded-lg border p-4">
                    <h2 className="text-lg font-semibold">{cycleSummaryQuery.data.titulo}</h2>
                    <p className="text-sm text-muted-foreground">{cycleSummaryQuery.data.contexto}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Gerado em {formatDate(cycleSummaryQuery.data.generatedAt)}
                    </p>
                  </div>

                  <div className="card rounded-lg border p-4">
                    <h3 className="mb-3 text-base font-semibold">KPIs executivos</h3>
                    <div className="grid gap-3 md:grid-cols-3">
                      {cycleSummaryQuery.data.kpis.map((kpi, index) => (
                        <div
                          key={`kpi-${index}`}
                          className={`kpi rounded-md border p-3 ${
                            kpi.destaque === "POSITIVO"
                              ? "border-emerald-200 bg-emerald-50"
                              : kpi.destaque === "ATENCAO"
                                ? "border-amber-200 bg-amber-50"
                                : "border-slate-200 bg-slate-50"
                          }`}
                        >
                          <p className="text-xs text-muted-foreground">{kpi.label}</p>
                          <p className="text-lg font-semibold">{kpi.valor}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-3">
                    <div className="card rounded-lg border p-4">
                      <h3 className="mb-2 text-base font-semibold">Riscos</h3>
                      <ul className="list-disc space-y-1 pl-5 text-sm">
                        {cycleSummaryQuery.data.riscos.map((item, index) => (
                          <li key={`risk-${index}`}>{item}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="card rounded-lg border p-4">
                      <h3 className="mb-2 text-base font-semibold">Decisoes pendentes</h3>
                      <ul className="list-disc space-y-1 pl-5 text-sm">
                        {cycleSummaryQuery.data.decisoesPendentes.map((item, index) => (
                          <li key={`dec-${index}`}>{item}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="card rounded-lg border p-4">
                      <h3 className="mb-2 text-base font-semibold">Plano de acao</h3>
                      <ul className="list-disc space-y-1 pl-5 text-sm">
                        {cycleSummaryQuery.data.planoAcao.map((item, index) => (
                          <li key={`plan-${index}`}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {cycleSummaryQuery.data.comparativoSnapshots && (
                    <div className="card rounded-lg border p-4">
                      <h3 className="mb-2 text-base font-semibold">Comparativo de snapshots</h3>
                      <p className="text-sm text-muted-foreground">
                        Delta medio:{" "}
                        {formatSignedPercent(
                          cycleSummaryQuery.data.comparativoSnapshots.deltaVariacaoMediaPct
                        )}{" "}
                        | Mudanca de opcao em{" "}
                        {formatCompactNumber(
                          cycleSummaryQuery.data.comparativoSnapshots.skuMudouOpcao
                        )}{" "}
                        SKU(s).
                      </p>
                    </div>
                  )}

                  <div className="card rounded-lg border bg-muted/20 p-4">
                    <h3 className="mb-2 text-base font-semibold">Recomendacao executiva</h3>
                    <p className="text-sm">{cycleSummaryQuery.data.recomendacaoExecutiva}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dados por Aba</CardTitle>
              <CardDescription>Visualizacao paginada com busca, filtros e ordenacao.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border bg-muted/20 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Label htmlFor="sku-global" className="text-xs text-muted-foreground">
                    SKU global
                  </Label>
                  <Input
                    id="sku-global"
                    className="h-9 w-full md:w-[340px]"
                    placeholder="Buscar SKU"
                    value={globalSkuSearch}
                    onChange={event => setGlobalSkuSearch(event.target.value)}
                  />
                  {globalSkuSearch && (
                    <Badge variant="secondary" className="gap-2">
                      <span className="max-w-[220px] truncate">SKU: {globalSkuSearch}</span>
                      <button
                        type="button"
                        onClick={() => setGlobalSkuSearch("")}
                        className="rounded-sm p-0.5 hover:bg-muted"
                        aria-label="Limpar SKU global"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto h-9"
                    disabled={!selectedSheet || exportingCsv || loadingSheets}
                    onClick={handleExportFilteredCsv}
                  >
                    {exportingCsv ? "Exportando..." : "CSV filtrado"}
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                <div className="space-y-2 lg:col-span-2">
                  <Label>Aba</Label>
                  <Select value={selectedSheet} onValueChange={setSelectedSheet}>
                    <SelectTrigger>
                      <SelectValue placeholder={loadingSheets ? "Carregando abas..." : "Selecione uma aba"} />
                    </SelectTrigger>
                    <SelectContent>
                      {(workbookSheets || []).map(sheet => (
                        <SelectItem key={sheet} value={sheet}>
                          {sheet}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 lg:col-span-2">
                  <Label>Busca na aba</Label>
                  <Input
                    placeholder="Digite para buscar em todas as colunas"
                    value={search}
                    onChange={event => setSearch(event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Tamanho da pagina</Label>
                  <Select
                    value={String(pageSize)}
                    onValueChange={value => setPageSize(parsePageSize(value))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Tamanho" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                      <SelectItem value="250">250</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-md border bg-muted/20 p-3">
                <div className="grid items-end gap-2 md:grid-cols-[minmax(0,2fr)_170px_auto]">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Ordenacao</Label>
                    <Select value={sortBy || "__none"} onValueChange={value => setSortBy(value === "__none" ? "" : value)}>
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
                    <Label className="text-xs text-muted-foreground">Direcao</Label>
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

                  <div className="flex md:justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 w-full md:w-auto"
                      onClick={() => {
                        setDrillHistory([]);
                        setDrillBaseSnapshot(null);
                        setPendingDrillFilter(null);
                        setGlobalSkuSearch("");
                        setSearch("");
                        setSortBy("");
                        setSortDir("asc");
                        setFilters([]);
                      }}
                    >
                      Limpar filtros
                    </Button>
                  </div>
                </div>
              </div>

              <div className="rounded-md border p-3">
                <p className="mb-3 text-sm font-medium">Filtro por coluna (contains)</p>
                <div className="grid gap-3 md:grid-cols-3">
                  <Select value={newFilterColumn || "__none"} onValueChange={value => setNewFilterColumn(value === "__none" ? "" : value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma coluna" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Selecione</SelectItem>
                      {sheetColumns.map(column => (
                        <SelectItem key={`filter-col-${column}`} value={column}>
                          {column}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Input
                    placeholder="Valor do filtro"
                    value={newFilterValue}
                    onChange={event => setNewFilterValue(event.target.value)}
                  />

                  <Button onClick={handleAddFilter} disabled={!newFilterColumn || !newFilterValue.trim()}>
                    Adicionar filtro
                  </Button>
                </div>

                {filters.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {filters.map(filter => (
                      <Badge key={filter.id} variant="secondary" className="gap-2">
                        <span>{filter.column}: {filter.value}</span>
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
              </div>

              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  Mostrando {firstRow}-{lastRow} de {totalRows} linhas.
                </span>
                {sheetDataQuery.isFetching && !sheetDataQuery.isLoading && (
                  <Badge variant="secondary" className="text-[10px]">
                    Atualizando...
                  </Badge>
                )}
              </div>

              {sheetDataQuery.isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !sheetDataQuery.data ? (
                <p className="text-sm text-muted-foreground">Selecione uma aba para visualizar.</p>
              ) : (
                <>
                  <ScrollArea className="h-[460px] rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {sheetDataQuery.data.columns.length === 0 ? (
                            <TableHead>Sem colunas</TableHead>
                          ) : (
                            sheetDataQuery.data.columns.map((column, index) => (
                              <TableHead key={`col-${index}`} className="whitespace-nowrap">
                                {column}
                              </TableHead>
                            ))
                          )}
                        </TableRow>
                      </TableHeader>

                      <TableBody>
                        {sheetDataQuery.data.rows.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={Math.max(1, sheetDataQuery.data.columns.length)}
                              className="py-8 text-center text-muted-foreground"
                            >
                              Nenhum dado encontrado para os filtros atuais.
                            </TableCell>
                          </TableRow>
                        ) : (
                          sheetDataQuery.data.rows.map((row, rowIndex) => (
                            <TableRow key={`row-${rowIndex}`}>
                              {row.map((cell, colIndex) => (
                                <TableCell key={`cell-${rowIndex}-${colIndex}`} className="whitespace-nowrap">
                                  {cell}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </ScrollArea>

                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      Pagina {currentPage} de {totalPages}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage <= 1 || sheetDataQuery.isFetching}
                        onClick={() => setPage(prev => Math.max(1, prev - 1))}
                      >
                        Anterior
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage >= totalPages || sheetDataQuery.isFetching}
                        onClick={() => setPage(prev => prev + 1)}
                      >
                        Proxima
                      </Button>
                    </div>
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
