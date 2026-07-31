import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { 
  Cloud, 
  Settings, 
  RefreshCw, 
  History, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Play,
  Loader2,
  FileSpreadsheet,
  Clock,
  ExternalLink
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function SharePointConfig() {
  const [config, setConfig] = useState({
    tenantId: "",
    clientId: "",
    clientSecret: "",
    siteUrl: "",
    folderPath: "",
    arquivoProdutos: "produtos.xlsx",
    arquivoFaturamento: "faturamento.xlsx",
    arquivoClientes: "clientes.xlsx",
    intervaloHoras: 6,
    ativo: false,
  });
  
  const [testando, setTestando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  
  const configQuery = trpc.sharepoint.getConfig.useQuery();
  const logsQuery = trpc.sharepoint.getLogs.useQuery({ limit: 50 });

  const credenciaisProntas = Boolean(
    config.tenantId.trim() &&
      config.clientId.trim() &&
      config.clientSecret.trim() &&
      config.siteUrl.trim()
  );
  
  const saveConfigMutation = trpc.sharepoint.saveConfig.useMutation({
    onSuccess: () => {
      toast.success("Configuração salva com sucesso!");
      configQuery.refetch();
    },
    onError: (error) => {
      toast.error(`Erro ao salvar: ${error.message}`);
    },
  });
  
  const testarConexaoMutation = trpc.sharepoint.testarConexao.useMutation({
    onSuccess: (result) => {
      if (result.sucesso) {
        toast.success(result.mensagem);
      } else {
        toast.error(result.mensagem);
      }
      setTestando(false);
    },
    onError: (error) => {
      toast.error(`Erro: ${error.message}`);
      setTestando(false);
    },
  });
  
  const sincronizarMutation = trpc.sharepoint.sincronizar.useMutation({
    onSuccess: (result) => {
      if (result.sucesso) {
        toast.success(result.mensagem);
      } else {
        toast.error(result.mensagem);
      }
      setSincronizando(false);
      logsQuery.refetch();
    },
    onError: (error) => {
      toast.error(`Erro: ${error.message}`);
      setSincronizando(false);
    },
  });
  
  useEffect(() => {
    if (configQuery.data) {
      setConfig({
        tenantId: configQuery.data.tenantId || "",
        clientId: configQuery.data.clientId || "",
        clientSecret: configQuery.data.clientSecret || "",
        siteUrl: configQuery.data.siteUrl || "",
        folderPath: configQuery.data.folderPath || "",
        arquivoProdutos: configQuery.data.arquivoProdutos || "produtos.xlsx",
        arquivoFaturamento: configQuery.data.arquivoFaturamento || "faturamento.xlsx",
        arquivoClientes: configQuery.data.arquivoClientes || "clientes.xlsx",
        intervaloHoras: configQuery.data.intervaloHoras || 6,
        ativo: configQuery.data.ativo || false,
      });
    }
  }, [configQuery.data]);
  
  const handleSave = () => {
    saveConfigMutation.mutate(config);
  };
  
  const handleTestar = () => {
    if (!credenciaisProntas) {
      toast.error("Preencha Tenant ID, Client ID, Client Secret e Site URL antes de testar.");
      return;
    }
    setTestando(true);
    testarConexaoMutation.mutate();
  };
  
  const handleSincronizar = (tipo: "produtos" | "faturamento" | "clientes" | "todos") => {
    if (!credenciaisProntas) {
      toast.error("Configure e salve as credenciais reais do SharePoint antes de sincronizar.");
      return;
    }
    setSincronizando(true);
    sincronizarMutation.mutate({ tipo });
  };
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "sucesso":
        return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" /> Sucesso</Badge>;
      case "erro":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" /> Erro</Badge>;
      case "parcial":
        return <Badge className="bg-yellow-500"><AlertCircle className="w-3 h-3 mr-1" /> Parcial</Badge>;
      case "iniciado":
        return <Badge className="bg-blue-500"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Em andamento</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };
  
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Cloud className="w-6 h-6 text-blue-500" />
            Integração SharePoint
          </h1>
          <p className="text-muted-foreground">
            Configure a sincronização automática de dados do SharePoint
          </p>
        </div>
        <div className="flex items-center gap-2">
          {configQuery.data?.ultimaSincronizacao && (
            <span className="text-sm text-muted-foreground">
              Última sincronização: {format(new Date(configQuery.data.ultimaSincronizacao), "dd/MM/yyyy HH:mm", { locale: ptBR })}
            </span>
          )}
        </div>
      </div>
      
      {!credenciaisProntas ? (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="w-5 h-5 text-amber-600" />
              Credenciais ainda não configuradas
            </CardTitle>
            <CardDescription>
              Não teste nem sincronize sem Tenant ID, Client ID, Client Secret e Site URL reais do Azure AD / SharePoint.
              Até lá, use a Importação de Cadastros e Importar Faturamento no sistema.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <Tabs defaultValue="config" className="space-y-4">
        <TabsList>
          <TabsTrigger value="config" className="flex items-center gap-2">
            <Settings className="w-4 h-4" /> Configuração
          </TabsTrigger>
          <TabsTrigger value="sync" className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Sincronização
          </TabsTrigger>
          <TabsTrigger value="logs" className="flex items-center gap-2">
            <History className="w-4 h-4" /> Histórico
          </TabsTrigger>
        </TabsList>
        
        {/* Aba Configuração */}
        <TabsContent value="config" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Credenciais Azure AD</CardTitle>
              <CardDescription>
                Configure as credenciais do App Registration no Azure AD para conectar ao SharePoint.
                <a 
                  href="https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline ml-1 inline-flex items-center"
                >
                  Acessar Azure Portal <ExternalLink className="w-3 h-3 ml-1" />
                </a>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="tenantId">Tenant ID (Directory ID)</Label>
                  <Input
                    id="tenantId"
                    value={config.tenantId}
                    onChange={(e) => setConfig({ ...config, tenantId: e.target.value })}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clientId">Client ID (Application ID)</Label>
                  <Input
                    id="clientId"
                    value={config.clientId}
                    onChange={(e) => setConfig({ ...config, clientId: e.target.value })}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="clientSecret">Client Secret</Label>
                <Input
                  id="clientSecret"
                  type="password"
                  value={config.clientSecret}
                  onChange={(e) => setConfig({ ...config, clientSecret: e.target.value })}
                  placeholder="••••••••••••••••••••••••••••••••"
                />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Configuração do SharePoint</CardTitle>
              <CardDescription>
                Defina o site e a pasta onde os arquivos Excel estão armazenados.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="siteUrl">URL do Site SharePoint</Label>
                <Input
                  id="siteUrl"
                  value={config.siteUrl}
                  onChange={(e) => setConfig({ ...config, siteUrl: e.target.value })}
                  placeholder="https://suaempresa.sharepoint.com/sites/SeuSite"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="folderPath">Caminho da Pasta</Label>
                <Input
                  id="folderPath"
                  value={config.folderPath}
                  onChange={(e) => setConfig({ ...config, folderPath: e.target.value })}
                  placeholder="Documentos/DadosSOP"
                />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Nomes dos Arquivos</CardTitle>
              <CardDescription>
                Defina os nomes dos arquivos Excel que serão importados.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="arquivoProdutos">Arquivo de Produtos</Label>
                  <Input
                    id="arquivoProdutos"
                    value={config.arquivoProdutos}
                    onChange={(e) => setConfig({ ...config, arquivoProdutos: e.target.value })}
                    placeholder="produtos.xlsx"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="arquivoFaturamento">Arquivo de Faturamento</Label>
                  <Input
                    id="arquivoFaturamento"
                    value={config.arquivoFaturamento}
                    onChange={(e) => setConfig({ ...config, arquivoFaturamento: e.target.value })}
                    placeholder="faturamento.xlsx"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="arquivoClientes">Arquivo de Clientes</Label>
                  <Input
                    id="arquivoClientes"
                    value={config.arquivoClientes}
                    onChange={(e) => setConfig({ ...config, arquivoClientes: e.target.value })}
                    placeholder="clientes.xlsx"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Agendamento</CardTitle>
              <CardDescription>
                Configure o intervalo de sincronização automática.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <Label htmlFor="intervaloHoras">Intervalo de Sincronização (horas)</Label>
                  <Input
                    id="intervaloHoras"
                    type="number"
                    min={1}
                    max={24}
                    value={config.intervaloHoras}
                    onChange={(e) => setConfig({ ...config, intervaloHoras: parseInt(e.target.value) || 6 })}
                    className="w-32"
                  />
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={config.ativo}
                      onCheckedChange={(checked) => setConfig({ ...config, ativo: checked })}
                    />
                    <Label>Sincronização Automática Ativa</Label>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <div className="flex justify-between">
            <Button variant="outline" onClick={handleTestar} disabled={testando || !credenciaisProntas}>
              {testando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
              Testar Conexão
            </Button>
            <Button onClick={handleSave} disabled={saveConfigMutation.isPending}>
              {saveConfigMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Salvar Configuração
            </Button>
          </div>
        </TabsContent>
        
        {/* Aba Sincronização */}
        <TabsContent value="sync" className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-green-500" />
                  Produtos
                </CardTitle>
                <CardDescription>
                  Arquivo: {config.arquivoProdutos}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  className="w-full" 
                  onClick={() => handleSincronizar("produtos")}
                  disabled={sincronizando || !credenciaisProntas}
                >
                  {sincronizando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                  Sincronizar Produtos
                </Button>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-blue-500" />
                  Faturamento
                </CardTitle>
                <CardDescription>
                  Arquivo: {config.arquivoFaturamento}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  className="w-full" 
                  onClick={() => handleSincronizar("faturamento")}
                  disabled={sincronizando || !credenciaisProntas}
                >
                  {sincronizando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                  Sincronizar Faturamento
                </Button>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-purple-500" />
                  Clientes
                </CardTitle>
                <CardDescription>
                  Arquivo: {config.arquivoClientes}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  className="w-full" 
                  onClick={() => handleSincronizar("clientes")}
                  disabled={sincronizando || !credenciaisProntas}
                >
                  {sincronizando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                  Sincronizar Clientes
                </Button>
              </CardContent>
            </Card>
            
            <Card className="border-2 border-primary">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <RefreshCw className="w-5 h-5 text-primary" />
                  Sincronização Completa
                </CardTitle>
                <CardDescription>
                  Sincroniza todos os arquivos de uma vez
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  className="w-full" 
                  variant="default"
                  onClick={() => handleSincronizar("todos")}
                  disabled={sincronizando || !credenciaisProntas}
                >
                  {sincronizando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                  Sincronizar Tudo
                </Button>
              </CardContent>
            </Card>
          </div>
          
          {config.ativo && (
            <Card className="bg-green-50 dark:bg-green-950 border-green-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                  <Clock className="w-5 h-5" />
                  <span>
                    Sincronização automática ativa - Próxima execução a cada {config.intervaloHoras} hora(s)
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        
        {/* Aba Histórico */}
        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Histórico de Sincronizações</span>
                <Button variant="outline" size="sm" onClick={() => logsQuery.refetch()}>
                  <RefreshCw className="w-4 h-4 mr-2" /> Atualizar
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {logsQuery.isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              ) : logsQuery.data && logsQuery.data.length > 0 ? (
                <div className="space-y-2">
                  {logsQuery.data.map((log) => (
                    <div 
                      key={log.id} 
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-4">
                        {getStatusBadge(log.status)}
                        <div>
                          <p className="font-medium capitalize">{log.tipo}</p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(log.createdAt), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                          </p>
                        </div>
                      </div>
                      <div className="text-right text-sm">
                        <p className="text-muted-foreground">
                          {log.registrosProcessados} processados | 
                          {log.registrosInseridos} inseridos | 
                          {log.registrosAtualizados} atualizados
                        </p>
                        {(log.registrosErro ?? 0) > 0 && (
                          <p className="text-red-500">{log.registrosErro} erros</p>
                        )}
                        {log.duracaoSegundos && (
                          <p className="text-muted-foreground">{log.duracaoSegundos}s</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhuma sincronização realizada ainda.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
