import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { trpc } from "@/lib/trpc";
import { Loader2, Download, AlertCircle } from "lucide-react";
import { exportToCsv } from "@/lib/exportCsv";
import { toast } from "sonner";

export default function Clientes() {
  const { data: clientes, isLoading } = trpc.clientes.list.useQuery();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground">
            Somente leitura — atualizado automaticamente após cada sincronização de faturamento (ERP).
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

      <Alert className="border-muted bg-muted/30">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Sincronização automática</AlertTitle>
        <AlertDescription>
          Novos clientes do faturamento ERP entram no cadastro após a carga SQL ou a atualização incremental
          (sem aceite manual). Use Bases / Faturamento para forçar sync se necessário.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Clientes cadastrados</CardTitle>
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
                  <TableHead>Código</TableHead>
                  <TableHead>CNPJ/CPF</TableHead>
                  <TableHead>Cidade</TableHead>
                  <TableHead>UF</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!clientes?.length ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      Nenhum cliente — sincronize o faturamento do ERP
                    </TableCell>
                  </TableRow>
                ) : (
                  clientes.map(cliente => (
                    <TableRow key={cliente.id}>
                      <TableCell>{cliente.razaoSocial}</TableCell>
                      <TableCell className="font-mono text-sm">{cliente.codigo || "-"}</TableCell>
                      <TableCell className="font-mono text-sm">{cliente.cnpjCpf || "-"}</TableCell>
                      <TableCell>{cliente.cidade || "-"}</TableCell>
                      <TableCell>{cliente.estado || "-"}</TableCell>
                      <TableCell>{cliente.status}</TableCell>
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
