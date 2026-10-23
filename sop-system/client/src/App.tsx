import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense, useEffect } from "react";
import { Route, Switch, useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";

const NotFound = lazy(() => import("./pages/NotFound"));
const Home = lazy(() => import("./pages/Home"));
const Acuracidade = lazy(() => import("./pages/demanda/Acuracidade"));
const Colaboracoes = lazy(() => import("./pages/demanda/Colaboracoes"));
const Familias = lazy(() => import("./pages/cadastros/Familias"));
const Produtos = lazy(() => import("./pages/cadastros/Produtos"));
const SkusProjetar = lazy(() => import("./pages/cadastros/SkusProjetar"));
const Clientes = lazy(() => import("./pages/cadastros/Clientes"));
const Status = lazy(() => import("./pages/cadastros/Status"));
const TipoNegocio = lazy(() => import("./pages/cadastros/TipoNegocio"));
const TipoEstoque = lazy(() => import("./pages/cadastros/TipoEstoque"));
const Linhas = lazy(() => import("./pages/cadastros/Linhas"));
const Modelos = lazy(() => import("./pages/cadastros/Modelos"));
const Tamanhos = lazy(() => import("./pages/cadastros/Tamanhos"));
const Membros = lazy(() => import("./pages/cadastros/Membros"));
const ImportarFaturamento = lazy(() => import("./pages/vendas/ImportarFaturamento"));
const CarteiraPedidos = lazy(() => import("./pages/vendas/CarteiraPedidos"));
const GestorMarca = lazy(() => import("./pages/cadastros/GestorMarca"));
const DeParaCodigos = lazy(() => import("./pages/cadastros/DeParaCodigos"));
const ImportacaoDadosSistema = lazy(
  () => import("./pages/cadastros/ImportacaoDadosSistema")
);
const SazonalidadeMarca = lazy(() => import("./pages/cadastros/SazonalidadeMarca"));
const PrevisaoPython = lazy(() => import("./pages/integracao/PrevisaoPython"));
const PrevisaoPythonCiclo13 = lazy(
  () => import("./pages/integracao/PrevisaoPythonCiclo13")
);
const PrevisaoPythonViewer = lazy(
  () => import("./pages/previsao/PrevisaoPythonViewer")
);
const GerenciamentoUsuarios = lazy(
  () => import("./pages/admin/GerenciamentoUsuarios")
);
const Ajuda = lazy(() => import("./pages/Ajuda"));

function RedirectTo({ href }: { href: string }) {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation(href);
  }, [href, setLocation]);

  return null;
}

function LegacyPrevisaoPythonRedirect() {
  return <RedirectTo href="/previsao-python" />;
}

function PageFallback() {
  return (
    <div className="flex min-h-[45vh] flex-col items-center justify-center gap-2 px-4 text-center">
      <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
      <p className="text-sm font-medium text-foreground">Carregando tela…</p>
      <p className="text-xs text-muted-foreground">Aguarde um instante.</p>
    </div>
  );
}

function Router() {
  return (
    <DashboardLayout>
      <Suspense fallback={<PageFallback />}>
        <Switch>
          <Route path="/" component={() => <RedirectTo href="/previsao-python" />} />
          <Route path="/dashboard-legado" component={Home} />
          <Route path="/ajuda" component={Ajuda} />

          <Route path="/vendas/importar" component={ImportarFaturamento} />
          <Route path="/vendas/carteira" component={CarteiraPedidos} />
          <Route
            path="/previsao-python/jobs/:id/visualizacao-ciclo-13"
            component={PrevisaoPythonViewer}
          />
          <Route
            path="/previsao-python/jobs/:id/visualizacao"
            component={PrevisaoPythonViewer}
          />
          <Route path="/previsao-python/ciclo-13" component={PrevisaoPythonCiclo13} />
          <Route path="/previsao-python" component={PrevisaoPython} />
          <Route path="/integracao/previsao-python" component={LegacyPrevisaoPythonRedirect} />
          <Route path="/demanda/colaboracoes" component={Colaboracoes} />
          <Route path="/demanda/acuracidade" component={Acuracidade} />

          <Route path="/cadastros/familias" component={Familias} />
          <Route path="/cadastros/produtos" component={Produtos} />
          <Route path="/cadastros/skus-projetar" component={SkusProjetar} />
          <Route path="/cadastros/clientes" component={Clientes} />
          <Route path="/cadastros/status" component={Status} />
          <Route path="/cadastros/tipo-negocio" component={TipoNegocio} />
          <Route path="/cadastros/tipo-estoque" component={TipoEstoque} />
          <Route path="/cadastros/linhas" component={Linhas} />
          <Route path="/cadastros/modelos" component={Modelos} />
          <Route path="/cadastros/tamanhos" component={Tamanhos} />
          <Route path="/cadastros/membros" component={Membros} />
          <Route path="/cadastros/gestor-marca" component={GestorMarca} />
          <Route path="/cadastros/depara" component={DeParaCodigos} />
          <Route path="/cadastros/importacao-base" component={ImportacaoDadosSistema} />
          <Route path="/cadastros/sazonalidade-marca" component={SazonalidadeMarca} />

          <Route path="/admin/usuarios" component={GerenciamentoUsuarios} />

          <Route path="/demanda/dashboard">{() => <RedirectTo href="/" />}</Route>
          <Route path="/demanda/previsoes">{() => <RedirectTo href="/demanda/colaboracoes" />}</Route>
          <Route path="/demanda/consensos">{() => <RedirectTo href="/demanda/colaboracoes" />}</Route>
          <Route path="/demanda/orcamentos">{() => <RedirectTo href="/" />}</Route>
          <Route path="/capacidade/dashboard">{() => <RedirectTo href="/" />}</Route>
          <Route path="/capacidade/calculo">{() => <RedirectTo href="/" />}</Route>
          <Route path="/capacidade/vs-demanda">{() => <RedirectTo href="/" />}</Route>
          <Route path="/producao/metas">{() => <RedirectTo href="/" />}</Route>
          <Route path="/vendas/dashboard">{() => <RedirectTo href="/" />}</Route>
          <Route path="/vendas/historico">{() => <RedirectTo href="/vendas/importar" />}</Route>
          <Route path="/vendas/forecast">{() => <RedirectTo href="/previsao-python" />}</Route>
          <Route path="/cadastros/recursos">{() => <RedirectTo href="/" />}</Route>
          <Route path="/cadastros/dias-uteis">{() => <RedirectTo href="/" />}</Route>
          <Route path="/cadastros/turnos">{() => <RedirectTo href="/" />}</Route>
          <Route path="/cadastros/fluxos">{() => <RedirectTo href="/" />}</Route>
          <Route path="/cadastros/roteiros">{() => <RedirectTo href="/" />}</Route>
          <Route path="/cadastros/paradas">{() => <RedirectTo href="/" />}</Route>
          <Route path="/cadastros/tabelas-auxiliares">{() => <RedirectTo href="/" />}</Route>
          <Route path="/integracao/sharepoint">{() => <RedirectTo href="/" />}</Route>
          <Route path="/admin/marcas">{() => <RedirectTo href="/cadastros/gestor-marca" />}</Route>

          <Route path="/404" component={NotFound} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </DashboardLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
