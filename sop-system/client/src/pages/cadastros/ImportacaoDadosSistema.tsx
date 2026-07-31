import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, FolderOpen, Database, CheckCircle2, AlertTriangle, Sparkles } from "lucide-react";
import { toast } from "sonner";

type Summary = {
  dryRun: boolean;
  dirPath: string;
  startedAt: Date;
  finishedAt: Date;
  totals: {
    inserted: number;
    updated: number;
    skipped: number;
    errors: number;
  };
  files: Array<{
    id: string;
    fileName: string;
    inserted: number;
    updated: number;
    skipped: number;
    errors: number;
    warnings: string[];
  }>;
  fatalErrors: string[];
};

type SeedResult = {
  dirPath: string;
  dryRun: boolean;
  importacao: Summary;
  marcasCriadas: number;
  gestoresCriados: number;
  vinculosCriados: number;
  sazonalidade: { inserted: number };
};

const DEFAULT_DIR = "dados-sistema";

export default function ImportacaoDadosSistema() {
  const [dirPath, setDirPath] = useState(DEFAULT_DIR);
  const [onlyInput, setOnlyInput] = useState("");
  const [result, setResult] = useState<Summary | null>(null);
  const [seedInfo, setSeedInfo] = useState<SeedResult | null>(null);

  const importMutation = trpc.cadastrosSistema.importFromFolder.useMutation({
    onSuccess: (data) => {
      const summary = data as Summary;
      setResult(summary);
      setSeedInfo(null);
      if (summary.fatalErrors.length > 0) {
        toast.error("Importacao finalizou com erro fatal.");
        return;
      }
      if (summary.dryRun) {
        toast.success("Validacao (dry-run) concluida.");
      } else {
        toast.success("Importacao concluida com sucesso.");
      }
    },
    onError: (error) => toast.error(error.message),
  });

  const seedMutation = trpc.cadastrosSistema.seedOperacional.useMutation({
    onSuccess: (data) => {
      const seed = data as SeedResult;
      setSeedInfo(seed);
      setResult(seed.importacao);
      if (seed.importacao.fatalErrors.length > 0) {
        toast.error("Seed parcial: houve erro fatal na importacao dos CSVs.");
        return;
      }
      toast.success(
        `Seed OK — marcas +${seed.marcasCriadas}, gestores +${seed.gestoresCriados}, vínculos +${seed.vinculosCriados}, sazonalidade ${seed.sazonalidade.inserted}`
      );
    },
    onError: (error) => toast.error(error.message),
  });

  const parsedOnly = useMemo(
    () =>
      onlyInput
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    [onlyInput]
  );

  const pending = importMutation.isPending || seedMutation.isPending;

  const runImport = async (dryRun: boolean) => {
    await importMutation.mutateAsync({
      dirPath: dirPath.trim() || DEFAULT_DIR,
      dryRun,
      only: parsedOnly.length > 0 ? parsedOnly : undefined,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Importacao de Cadastros</h1>
        <p className="text-muted-foreground">
          Carga da pasta de base (status, linhas, turnos, de-para, marcas, gestores…) direto nos cadastros.
        </p>
      </div>

      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-5 w-5 text-primary" />
            Seed operacional (recomendado)
          </CardTitle>
          <CardDescription>
            Importa todos os CSVs da pasta, cria marcas/gestores padrão, vincula gestor geral × marcas
            e gera sazonalidade uniforme (1/12) se ainda estiver vazia.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() =>
              seedMutation.mutate({
                dirPath: dirPath.trim() || DEFAULT_DIR,
                dryRun: false,
              })
            }
            disabled={pending}
          >
            {seedMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Popular dados mestres agora
          </Button>
          {seedInfo ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Último seed: marcas +{seedInfo.marcasCriadas} · gestores +{seedInfo.gestoresCriados} ·
              vínculos +{seedInfo.vinculosCriados} · sazonalidade {seedInfo.sazonalidade.inserted} linhas
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Pasta de origem
          </CardTitle>
          <CardDescription>
            No Docker o padrão é <code>dados-sistema</code> (incluído no deploy). Localmente pode apontar para{" "}
            <code>../dados sistema</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Caminho da pasta</Label>
              <Input value={dirPath} onChange={(e) => setDirPath(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Arquivos especificos (opcional)</Label>
              <Input
                placeholder="ex: recursos.csv,turnos.csv,marcas.csv"
                value={onlyInput}
                onChange={(e) => setOnlyInput(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => runImport(true)}
              disabled={pending}
            >
              {importMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Validar (dry-run)
            </Button>
            <Button
              onClick={() => runImport(false)}
              disabled={pending}
              className="bg-blue-700 hover:bg-blue-800"
            >
              {importMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Importar no Cadastros
            </Button>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Resumo da execucao
            </CardTitle>
            <CardDescription>
              {result.dryRun ? "Modo dry-run (sem gravacao)." : "Modo execucao (dados gravados)."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Inseridos: {result.totals.inserted}</Badge>
              <Badge variant="outline">Atualizados: {result.totals.updated}</Badge>
              <Badge variant="outline">Ignorados: {result.totals.skipped}</Badge>
              <Badge variant={result.totals.errors > 0 ? "destructive" : "secondary"}>
                Erros: {result.totals.errors}
              </Badge>
            </div>

            {result.fatalErrors.length > 0 && (
              <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                <div className="font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Erros fatais
                </div>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  {result.fatalErrors.map((item, idx) => (
                    <li key={`${item}-${idx}`}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Arquivo</TableHead>
                  <TableHead className="text-right">Inseridos</TableHead>
                  <TableHead className="text-right">Atualizados</TableHead>
                  <TableHead className="text-right">Ignorados</TableHead>
                  <TableHead className="text-right">Erros</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.files.map((file) => {
                  const ok = file.errors === 0;
                  return (
                    <TableRow key={file.fileName}>
                      <TableCell className="font-medium">{file.fileName}</TableCell>
                      <TableCell className="text-right">{file.inserted}</TableCell>
                      <TableCell className="text-right">{file.updated}</TableCell>
                      <TableCell className="text-right">{file.skipped}</TableCell>
                      <TableCell className="text-right">{file.errors}</TableCell>
                      <TableCell>
                        {ok ? (
                          <Badge className="bg-green-600 hover:bg-green-600">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            OK
                          </Badge>
                        ) : (
                          <Badge variant="destructive">Com erro</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
