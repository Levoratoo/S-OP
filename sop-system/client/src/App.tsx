import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { useEffect } from "react";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";

// Pages
import Home from "./pages/Home";
import DashboardDemanda from "./pages/demanda/DashboardDemanda";
import Acuracidade from "./pages/demanda/Acuracidade";
import Previsoes from "./pages/demanda/Previsoes";
import Colaboracoes from "./pages/demanda/Colaboracoes";
import Consensos from "./pages/demanda/Consensos";
import Orcamentos from "./pages/demanda/Orcamentos";
import DashboardCapacidade from "./pages/capacidade/DashboardCapacidade";
import CalculoCapacidade from "./pages/capacidade/CalculoCapacidade";
import CapacidadeVsDemanda from "./pages/capacidade/CapacidadeVsDemanda";
import DashboardVendas from "./pages/vendas/DashboardVendas";
import HistoricoVendas from "./pages/vendas/HistoricoVendas";
import CarteiraPedidos from "./pages/vendas/CarteiraPedidos";
import Forecast from "./pages/vendas/Forecast";
import Familias from "./pages/cadastros/Familias";
import Produtos from "./pages/cadastros/Produtos";
import Clientes from "./pages/cadastros/Clientes";
import Recursos from "./pages/cadastros/Recursos";
import DiasUteis from "./pages/cadastros/DiasUteis";
import Roteiros from "./pages/cadastros/Roteiros";
import Status from "./pages/cadastros/Status";
import TipoNegocio from "./pages/cadastros/TipoNegocio";
import TipoEstoque from "./pages/cadastros/TipoEstoque";
import Linhas from "./pages/cadastros/Linhas";
import Modelos from "./pages/cadastros/Modelos";
import Tamanhos from "./pages/cadastros/Tamanhos";
import Membros from "./pages/cadastros/Membros";
import Paradas from "./pages/cadastros/Paradas";
import ImportarFaturamento from "./pages/vendas/ImportarFaturamento";
import TabelasAuxiliares from "./pages/cadastros/TabelasAuxiliares";
import GestorMarca from "./pages/cadastros/GestorMarca";
import DeParaCodigos from "./pages/cadastros/DeParaCodigos";
import Turnos from "./pages/cadastros/Turnos";
import Fluxos from "./pages/cadastros/Fluxos";
import ImportacaoDadosSistema from "./pages/cadastros/ImportacaoDadosSistema";
import SazonalidadeMarca from "./pages/cadastros/SazonalidadeMarca";
import SharePointConfig from "./pages/integracao/SharePointConfig";
import PrevisaoPython from "./pages/integracao/PrevisaoPython";
import PrevisaoPythonCiclo13 from "./pages/integracao/PrevisaoPythonCiclo13";
import PrevisaoPythonViewer from "./pages/previsao/PrevisaoPythonViewer";
import GerenciamentoUsuarios from "./pages/admin/GerenciamentoUsuarios";
import GerenciamentoMarcas from "./pages/admin/GerenciamentoMarcas";
import MetasProducao from "./pages/producao/MetasProducao";
import Ajuda from "./pages/Ajuda";

function LegacyPrevisaoPythonRedirect() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation("/previsao-python");
  }, [setLocation]);

  return null;
}

function Router() {
  return (
    <DashboardLayout>
      <Switch>
        {/* Dashboard Principal */}
        <Route path="/" component={Home} />
        <Route path="/ajuda" component={Ajuda} />

        {/* Previsao de Demanda */}
        <Route path="/demanda/dashboard" component={DashboardDemanda} />
        <Route path="/demanda/acuracidade" component={Acuracidade} />
        <Route path="/demanda/previsoes" component={Previsoes} />
        <Route path="/demanda/colaboracoes" component={Colaboracoes} />
        <Route path="/demanda/consensos" component={Consensos} />
        <Route path="/demanda/orcamentos" component={Orcamentos} />

        {/* Analise de Capacidade */}
        <Route path="/capacidade/dashboard" component={DashboardCapacidade} />
        <Route path="/capacidade/calculo" component={CalculoCapacidade} />
        <Route path="/capacidade/vs-demanda" component={CapacidadeVsDemanda} />

        {/* Gestao de Producao */}
        <Route path="/producao/metas" component={MetasProducao} />

        {/* Gestao de Vendas */}
        <Route path="/vendas/dashboard" component={DashboardVendas} />
        <Route path="/vendas/historico" component={HistoricoVendas} />
        <Route path="/vendas/carteira" component={CarteiraPedidos} />
        <Route path="/vendas/forecast" component={Forecast} />
        <Route path="/vendas/importar" component={ImportarFaturamento} />

        {/* Cadastros */}
        <Route path="/cadastros/familias" component={Familias} />
        <Route path="/cadastros/produtos" component={Produtos} />
        <Route path="/cadastros/clientes" component={Clientes} />
        <Route path="/cadastros/recursos" component={Recursos} />
        <Route path="/cadastros/dias-uteis" component={DiasUteis} />
        <Route path="/cadastros/roteiros" component={Roteiros} />
        <Route path="/cadastros/status" component={Status} />
        <Route path="/cadastros/tipo-negocio" component={TipoNegocio} />
        <Route path="/cadastros/tipo-estoque" component={TipoEstoque} />
        <Route path="/cadastros/linhas" component={Linhas} />
        <Route path="/cadastros/modelos" component={Modelos} />
        <Route path="/cadastros/tamanhos" component={Tamanhos} />
        <Route path="/cadastros/membros" component={Membros} />
        <Route path="/cadastros/paradas" component={Paradas} />
        <Route path="/cadastros/tabelas-auxiliares" component={TabelasAuxiliares} />
        <Route path="/cadastros/gestor-marca" component={GestorMarca} />
        <Route path="/cadastros/depara" component={DeParaCodigos} />
        <Route path="/cadastros/turnos" component={Turnos} />
        <Route path="/cadastros/fluxos" component={Fluxos} />
        <Route path="/cadastros/importacao-base" component={ImportacaoDadosSistema} />
        <Route path="/cadastros/sazonalidade-marca" component={SazonalidadeMarca} />

        {/* Integracoes */}
        <Route path="/integracao/sharepoint" component={SharePointConfig} />
        <Route path="/previsao-python/jobs/:id/visualizacao-ciclo-13" component={PrevisaoPythonViewer} />
        <Route path="/previsao-python/jobs/:id/visualizacao" component={PrevisaoPythonViewer} />
        <Route path="/previsao-python/ciclo-13" component={PrevisaoPythonCiclo13} />
        <Route path="/previsao-python" component={PrevisaoPython} />
        <Route path="/integracao/previsao-python" component={LegacyPrevisaoPythonRedirect} />

        {/* Administracao */}
        <Route path="/admin/usuarios" component={GerenciamentoUsuarios} />
        <Route path="/admin/marcas" component={GerenciamentoMarcas} />

        {/* 404 */}
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
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
