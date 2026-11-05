import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { trpc } from "@/lib/trpc";
import { Loader2, Download, AlertCircle } from "lucide-react";
import { exportToCsv } from "@/lib/exportCsv";
import { toast } from "sonner";

export default function Clientes() {
  const [acceptingChave, setAcceptingChave] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const { data: clientes, isLoading } = trpc.clientes.list.useQuery();
  const { data: pendingClientes = [] } =
    trpc.cadastrosSistema.pendingClientesFromFaturamento.useQuery();

  const acceptPendingClienteMutation = trpc.cadastrosSistema.acceptPendingCliente.useMutation({
    onSuccess: () => {
      utils.cadastrosSistema.pendingClientesFromFaturamento.invalidate();
      utils.clientes.list.invalidate();
      toast.success("Cliente aceito e cadastrado!");
    },
    onError: error => toast.error(error.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground">
            Cadastro somente leitura — origem Faturamento/ERP (sem inclusão manual).
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            if (clientes && clientes.length > 0) {
              exportToCsv(clientes, "clientes", [
                { key: "razaoSocial", title: "Razão Social" },
                { key: "nomeFantasia", title: "Nome Fantasia" },
                { key: "cnpjCpf", title: "CNPJ/CPF" },
                { key: "cidade", title: "Cidade" },
                { key: "estado", title: "Estado" },
                { key: "status", title: "Status" },
              ]);
            } else {
              toast.error("Não há dados para exportar");
            }
          }}
        >
          <Download className="h-4 w-4 mr-2" />
          Exportar CSV
        </Button>
      </div>

      {pendingClientes.length > 0 && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-950">
          <AlertCircle className="h-4 w-4 text-amber-700" />
          <AlertTitle className="flex items-center gap-2">
            Clientes pendentes do Faturamento
            <Badge variant="secondary" className="bg-amber-200 text-amber-900">
              {pendingClientes.length}
            </Badge>
          </AlertTitle>
          <AlertDescription className="mt-2">
            <div className="rounded-md border border-amber-200 bg-white/70 max-h-48 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Chave</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>CNPJ</TableHead>
                    <TableHead className="w-[110px]">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingClientes.slice(0, 15).map(cliente => (
                    <TableRow key={cliente.chave}>
                      <TableCell className="font-mono text-xs">{cliente.chave}</TableCell>
                      <TableCell className="font-mono text-sm">{cliente.codCliente || "-"}</TableCell>
                      <TableCell className="font-mono text-sm">{cliente.cnpj || "-"}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={acceptPendingClienteMutation.isPending}
                          onClick={async () => {
                            setAcceptingChave(cliente.chave);
                            try {
                              await acceptPendingClienteMutation.mutateAsync({ chave: cliente.chave });
                            } finally {
                              setAcceptingChave(null);
                            }
                          }}
                        >
                          {acceptingChave === cliente.chave ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "Aceitar"
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Lista de Clientes</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Razão Social</TableHead>
                  <TableHead>Nome Fantasia</TableHead>
                  <TableHead>CNPJ/CPF</TableHead>
                  <TableHead>Cidade/UF</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientes?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Nenhum cliente — aguarde sincronização do Faturamento/ERP
                    </TableCell>
                  </TableRow>
                ) : (
                  clientes?.map(cliente => (
                    <TableRow key={cliente.id}>
                      <TableCell className="font-medium">{cliente.razaoSocial}</TableCell>
                      <TableCell>{cliente.nomeFantasia || "-"}</TableCell>
                      <TableCell className="font-mono text-sm">{cliente.cnpjCpf || "-"}</TableCell>
                      <TableCell>
                        {cliente.cidade ? `${cliente.cidade}/${cliente.estado}` : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={cliente.status === "ATIVO" ? "default" : "secondary"}>
                          {cliente.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
