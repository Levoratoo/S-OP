from pathlib import Path
import re

path = Path(r"client/src/pages/previsao/PrevisaoPythonViewer.tsx")
text = path.read_text(encoding="utf-8")

# Fix leftover showLegacyDashboard references by disabling those queries entirely.
text = text.replace(
    """  const { data: analytics, isLoading: loadingAnalytics } = trpc.previsaoPython.analytics.useQuery(
    { id: jobId || 0, monthsLimit: 24 },
    { enabled: isValidJobId && canVisualizeJob && showLegacyDashboard, staleTime: 20_000 }
  );
""",
    "",
)

text = text.replace(
    """  const explainabilityQuery = trpc.previsaoPython.explainability.useQuery(
    { id: jobId || 0, limit: 40 },
    { enabled: isValidJobId && canVisualizeJob && showLegacyDashboard, staleTime: 20_000 }
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
      enabled: isValidJobId && canVisualizeJob && showLegacyDashboard,
      staleTime: 20_000,
    }
  );

""",
    "",
)

# Remove dead chart/filter memos that depended on analytics.
patterns = [
    r"  const modelChartData = useMemo\(\n    \(\) =>\n      \(analytics\?\.modelRanking \|\| \[\]\)\.slice\(0, 8\)\.map\(item => \(\{\n        modelo: item\.modelo,\n        skuCount: item\.skuCount,\n      \}\)\),\n    \[analytics\?\.modelRanking\]\n  \);\n\n",
    r"  const modelMapeChartData = useMemo\(\n    \(\) =>\n      \(analytics\?\.modelRanking \|\| \[\]\)\n        \.filter\(item => item\.avgMape !== null\)\n        \.slice\(0, 8\)\n        \.map\(item => \(\{\n          modelo: item\.modelo,\n          avgMapePct: Number\(\(\(item\.avgMape \?\? 0\) \* 100\)\.toFixed\(2\)\),\n        \}\)\),\n    \[analytics\?\.modelRanking\]\n  \);\n\n",
    r"  const acuracidadeChartData = useMemo\(\n    \(\) =>\n      \(analytics\?\.acuracidadeDistribution \|\| \[\]\)\.slice\(0, 8\)\.map\(item => \(\{\n        classificacao: item\.label,\n        count: item\.count,\n      \}\)\),\n    \[analytics\?\.acuracidadeDistribution\]\n  \);\n\n",
    r"  const biasChartData = useMemo\(\n    \(\) =>\n      \(analytics\?\.biasDistribution \|\| \[\]\)\.slice\(0, 8\)\.map\(item => \(\{\n        bias: item\.label,\n        count: item\.count,\n      \}\)\),\n    \[analytics\?\.biasDistribution\]\n  \);\n\n",
    r"  const status12mChartData = useMemo\(\n    \(\) =>\n      \(analytics\?\.status12mDistribution \|\| \[\]\)\.slice\(0, 8\)\.map\(item => \(\{\n        status: item\.label,\n        count: item\.count,\n      \}\)\),\n    \[analytics\?\.status12mDistribution\]\n  \);\n\n",
]

for pattern in patterns:
    text, n = re.subn(pattern, "", text, count=1)
    print("removed pattern", n)

# Remove filtered* memos that only served legacy dashboard
for name in [
    "filteredTopErros",
    "filteredTopAcertos",
    "filteredTopOportunidades",
    "filteredTopRiscos",
    "filteredExplainabilityItems",
]:
    pattern = rf"  const {name} = useMemo\(\n    \(\) =>[\s\S]*?,\n    \[[^\]]+\]\n  \);\n\n"
    text, n = re.subn(pattern, "", text, count=1)
    print(name, n)

# Remove methods ranking that used analytics if present
text, n = re.subn(
    r"  const methodsRankingRows = useMemo\(\n    \(\) =>\n      \(analytics\?\.modelRanking \|\| \[\]\)\.slice\(0, 12\)\.map\(item => \(\{\n        modelo: item\.modelo,\n        skuCount: item\.skuCount,\n      \}\)\),\n    \[analytics\?\.modelRanking, methodsCatalogMap\]\n  \);\n\n",
    "",
    text,
    count=1,
)
print("methodsRankingRows", n)

if "showLegacyDashboard" in text or "analytics" in text:
    print("WARN leftovers:")
    for i, line in enumerate(text.splitlines(), 1):
        if "showLegacyDashboard" in line or "analytics" in line or "explainabilityQuery" in line or "scenarioSnapshots" in line or "cycleSummaryQuery" in line or "createSnapshotMutation" in line or "compareSnapshots" in line:
            print(f"  {i}: {line[:120]}")

path.write_text(text, encoding="utf-8")
print("written", path.stat().st_size)
