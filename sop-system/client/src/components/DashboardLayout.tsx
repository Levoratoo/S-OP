import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { 
  LayoutDashboard, 
  LogOut, 
  PanelLeft, 
  Package, 
  Users, 
  Factory, 
  TrendingUp,
  Settings,
  ChevronRight,
  Wrench,
  Calendar,
  Route,
  UserCog,
  ShoppingCart,
  FileSpreadsheet,
  BarChart3,
  Target,
  Gauge,
  TableProperties,
  Cloud,
  Shield,
  Briefcase,
  Layers,
  CheckCircle,
  Building,
  Archive,
  Ruler,
  Shirt,
  Cog,
  Clock,
  Calculator,
  CircleHelp,
} from "lucide-react";
import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { GlobalSearch } from "./GlobalSearch";
import { HelpTourContext } from "@/help/HelpTourContext";
import { SopHelpButton, SopTour } from "@/help/SopTour";
import type { TourStep } from "@/help/sop-tour-content";

type SubMenuItem = {
  label: string;
  path: string;
  icon?: React.ElementType;
  tourId?: string;
};

type SubSection = {
  label: string;
  icon?: React.ElementType;
  items: SubMenuItem[];
};

type MenuItem = {
  icon: React.ElementType;
  label: string;
  path?: string;
  tourId?: string;
  children?: SubMenuItem[];
  sections?: SubSection[];
};

const menuItems: MenuItem[] = [
  {
    icon: LayoutDashboard,
    label: "Dashboard",
    path: "/",
    tourId: "nav-dashboard",
  },
  {
    icon: TrendingUp,
    label: "Previsao de Demanda",
    tourId: "nav-demanda",
    children: [
      { label: "Dashboard Demanda", path: "/demanda/dashboard", icon: BarChart3, tourId: "nav-demanda-dashboard" },
      { label: "Acuracidade", path: "/demanda/acuracidade", icon: Target, tourId: "nav-demanda-acuracidade" },
      { label: "Previsoes", path: "/demanda/previsoes", icon: BarChart3, tourId: "nav-demanda-previsoes" },
      { label: "Colaboracao Comercial", path: "/demanda/colaboracoes", icon: Users, tourId: "nav-demanda-colaboracoes" },
      { label: "Consensos", path: "/demanda/consensos", icon: CheckCircle, tourId: "nav-demanda-consensos" },
      { label: "Orcamentos", path: "/demanda/orcamentos", icon: TableProperties, tourId: "nav-demanda-orcamentos" },
    ],
  },
  {
    icon: Factory,
    label: "Analise de Capacidade",
    tourId: "nav-capacidade",
    children: [
      { label: "Dashboard Capacidade", path: "/capacidade/dashboard", icon: Gauge, tourId: "nav-capacidade-dashboard" },
      { label: "Calculo de Capacidade", path: "/capacidade/calculo", icon: Calculator, tourId: "nav-capacidade-calculo" },
      { label: "Capacidade x Demanda", path: "/capacidade/vs-demanda", icon: TrendingUp, tourId: "nav-capacidade-vs-demanda" },
    ],
  },
  {
    icon: Target,
    label: "Gestao de Producao",
    tourId: "nav-producao",
    children: [
      { label: "Metas de Producao", path: "/producao/metas", icon: Target, tourId: "nav-producao-metas" },
    ],
  },
  {
    icon: ShoppingCart,
    label: "Gestao de Vendas",
    tourId: "nav-vendas",
    children: [
      { label: "Dashboard Vendas", path: "/vendas/dashboard", icon: BarChart3, tourId: "nav-vendas-dashboard" },
      { label: "Historico de Vendas", path: "/vendas/historico", icon: FileSpreadsheet, tourId: "nav-vendas-historico" },
      { label: "Importar Faturamento", path: "/vendas/importar", icon: FileSpreadsheet, tourId: "nav-vendas-importar" },
      { label: "Carteira de Pedidos", path: "/vendas/carteira", icon: ShoppingCart, tourId: "nav-vendas-carteira" },
      { label: "Forecast", path: "/vendas/forecast", icon: TrendingUp, tourId: "nav-vendas-forecast" },
    ],
  },
  {
    icon: Settings,
    label: "Cadastros",
    tourId: "nav-cadastros",
    sections: [
      {
        label: "Comercial",
        icon: Briefcase,
        items: [
          { label: "Gestor x Marca", path: "/cadastros/gestor-marca", icon: UserCog, tourId: "nav-cadastros-gestor-marca" },
          { label: "Sazonalidade Marca", path: "/cadastros/sazonalidade-marca", icon: Calendar, tourId: "nav-cadastros-sazonalidade" },
          { label: "Clientes", path: "/cadastros/clientes", icon: Users, tourId: "nav-cadastros-clientes" },
        ],
      },
      {
        label: "Produto",
        icon: Package,
        items: [
          { label: "Produtos", path: "/cadastros/produtos", icon: Package, tourId: "nav-cadastros-produtos" },
          { label: "De-Para", path: "/cadastros/depara", icon: Route, tourId: "nav-cadastros-depara" },
          { label: "Status", path: "/cadastros/status", icon: CheckCircle, tourId: "nav-cadastros-status" },
          { label: "Tipo Negocio", path: "/cadastros/tipo-negocio", icon: Building, tourId: "nav-cadastros-tipo-negocio" },
          { label: "Tipo Estoque", path: "/cadastros/tipo-estoque", icon: Archive, tourId: "nav-cadastros-tipo-estoque" },
          { label: "Linhas", path: "/cadastros/linhas", icon: Layers, tourId: "nav-cadastros-linhas" },
          { label: "Modelos", path: "/cadastros/modelos", icon: Shirt, tourId: "nav-cadastros-modelos" },
          { label: "Tamanhos", path: "/cadastros/tamanhos", icon: Ruler, tourId: "nav-cadastros-tamanhos" },
        ],
      },
      {
        label: "Operacoes",
        icon: Cog,
        items: [
          { label: "Dias Uteis", path: "/cadastros/dias-uteis", icon: Calendar, tourId: "nav-cadastros-dias-uteis" },
          { label: "Turnos", path: "/cadastros/turnos", icon: Clock, tourId: "nav-cadastros-turnos" },
          { label: "Recursos", path: "/cadastros/recursos", icon: Wrench, tourId: "nav-cadastros-recursos" },
          { label: "Fluxo", path: "/cadastros/fluxos", icon: Route, tourId: "nav-cadastros-fluxos" },
        ],
      },
      {
        label: "Geral",
        icon: UserCog,
        items: [
          { label: "Membros", path: "/cadastros/membros", icon: UserCog, tourId: "nav-cadastros-membros" },
          { label: "Importacao Base", path: "/cadastros/importacao-base", icon: FileSpreadsheet, tourId: "nav-cadastros-importacao" },
        ],
      },
    ],
  },
  {
    icon: FileSpreadsheet,
    label: "Previsao Python",
    path: "/previsao-python",
    tourId: "nav-previsao-python",
  },
  {
    icon: TableProperties,
    label: "Previsão Demanda Estatística",
    path: "/previsao-python/ciclo-13",
    tourId: "nav-previsao-ciclo13",
  },
  {
    icon: Cloud,
    label: "Integracoes",
    tourId: "nav-integracoes",
    children: [
      { label: "SharePoint", path: "/integracao/sharepoint", icon: Cloud, tourId: "nav-integracao-sharepoint" },
    ],
  },
  {
    icon: Shield,
    label: "Administracao",
    tourId: "nav-admin",
    children: [{ label: "Usuarios", path: "/admin/usuarios", icon: Users, tourId: "nav-admin-usuarios" }],
  },
  {
    icon: CircleHelp,
    label: "Ajuda",
    path: "/ajuda",
    tourId: "nav-ajuda",
  },
];
const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  // Sem tela de login: entra direto (local-login / bypass no Docker)
  useEffect(() => {
    if (loading || user) return;
    const loginUrl = getLoginUrl();
    if (!loginUrl || loginUrl === "/" || loginUrl.startsWith("/")) {
      window.location.replace("/api/auth/local-login");
      return;
    }
    window.location.replace(loginUrl);
  }, [loading, user]);

  if (loading || !user) {
    return <DashboardLayoutSkeleton />;
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar, setOpenMobile } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const [openMenus, setOpenMenus] = useState<string[]>([]);
  const [openSections, setOpenSections] = useState<string[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);
  const startTourRef = useRef<((steps: TourStep[]) => void) | null>(null);

  const ensureMenuOpen = useCallback((menuLabel: string, sectionLabel?: string) => {
    if (isMobile) {
      setOpenMobile(true);
    }
    setOpenMenus(prev => (prev.includes(menuLabel) ? prev : [...prev, menuLabel]));
    if (sectionLabel) {
      setOpenSections(prev =>
        prev.includes(sectionLabel) ? prev : [...prev, sectionLabel]
      );
    }
  }, [isMobile, setOpenMobile]);

  const helpApi = useMemo(
    () => ({
      startTour: (steps: TourStep[]) => startTourRef.current?.(steps),
      openHelpModal: () => setHelpOpen(true),
      ensureMenuOpen,
    }),
    [ensureMenuOpen]
  );

  const toggleSection = (sectionLabel: string) => {
    setOpenSections(prev => 
      prev.includes(sectionLabel) 
        ? prev.filter(s => s !== sectionLabel)
        : [...prev, sectionLabel]
    );
  };

  const getActiveMenuItem = () => {
    for (const item of menuItems) {
      if (item.path === location) return item;
      if (item.children) {
        const child = item.children.find(c => c.path === location);
        if (child) return { ...child, parent: item.label };
      }
      if (item.sections) {
        for (const section of item.sections) {
          const sectionItem = section.items.find(i => i.path === location);
          if (sectionItem) return { ...sectionItem, parent: item.label, section: section.label };
        }
      }
    }
    return null;
  };

  const activeMenuItem = getActiveMenuItem();

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  const toggleMenu = (label: string) => {
    setOpenMenus(prev => 
      prev.includes(label) 
        ? prev.filter(m => m !== label)
        : [...prev, label]
    );
  };

  return (
    <HelpTourContext.Provider value={helpApi}>
      <div className="relative" ref={sidebarRef} data-tour="nav-sidebar">
        <Sidebar
          collapsible="icon"
          className="border-r-0"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-16 justify-center border-b border-sidebar-border">
            <div
              className="flex items-center gap-3 px-2 transition-all w-full"
              data-tour="nav-brand"
            >
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed ? (
                <div className="flex items-center gap-2 min-w-0">
                  <img 
                    src="/printbag-logo.png" 
                    alt="Printbag" 
                    className="h-8 w-auto object-contain"
                  />
                  <span className="font-bold tracking-tight truncate text-primary">
                    S&OP
                  </span>
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          {/* Barra de Pesquisa Global */}
          {!isCollapsed && (
            <div className="px-3 py-2" data-tour="nav-search">
              <GlobalSearch />
            </div>
          )}

          <SidebarContent className="gap-0 py-2">
            <SidebarMenu className="px-2">
              {menuItems.map(item => {
                const hasChildren = item.children && item.children.length > 0;
                const hasSections = item.sections && item.sections.length > 0;
                const isOpen = openMenus.includes(item.label);
                const isActive = item.path === location || 
                  item.children?.some(c => c.path === location) ||
                  item.sections?.some(s => s.items.some(i => i.path === location));

                if (hasSections) {
                  return (
                    <Collapsible
                      key={item.label}
                      open={isOpen}
                      onOpenChange={() => toggleMenu(item.label)}
                    >
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton
                            tooltip={item.label}
                            data-tour={item.tourId}
                            className={`h-10 transition-all font-normal ${isActive ? "bg-accent" : ""}`}
                          >
                            <item.icon
                              className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                            />
                            <span className="flex-1">{item.label}</span>
                            <ChevronRight 
                              className={`h-4 w-4 transition-transform ${isOpen ? "rotate-90" : ""}`} 
                            />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="pl-2 space-y-0.5">
                            {item.sections?.map(section => {
                              const SectionIcon = section.icon;
                              const isSectionOpen = openSections.includes(section.label);
                              const isSectionActive = section.items.some(i => i.path === location);
                              return (
                                <Collapsible
                                  key={section.label}
                                  open={isSectionOpen}
                                  onOpenChange={() => toggleSection(section.label)}
                                >
                                  <CollapsibleTrigger asChild>
                                    <button 
                                      className={`flex items-center gap-2 w-full px-2 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-md hover:bg-accent/50 transition-colors ${
                                        isSectionActive ? "text-primary" : "text-muted-foreground"
                                      }`}
                                    >
                                      {SectionIcon && <SectionIcon className="h-3.5 w-3.5" />}
                                      <span className="flex-1 text-left">{section.label}</span>
                                      <ChevronRight 
                                        className={`h-3.5 w-3.5 transition-transform ${isSectionOpen ? "rotate-90" : ""}`} 
                                      />
                                    </button>
                                  </CollapsibleTrigger>
                                  <CollapsibleContent>
                                    <SidebarMenuSub className="ml-0 pl-0 border-l-0">
                                      {section.items.map(sectionItem => {
                                        const isItemActive = location === sectionItem.path;
                                        const ItemIcon = sectionItem.icon;
                                        return (
                                          <SidebarMenuSubItem key={sectionItem.path}>
                                            <SidebarMenuSubButton
                                              onClick={() => setLocation(sectionItem.path)}
                                              isActive={isItemActive}
                                              data-tour={sectionItem.tourId}
                                              className="h-8 pl-6"
                                            >
                                              {ItemIcon && <ItemIcon className="h-3.5 w-3.5 mr-2" />}
                                              <span>{sectionItem.label}</span>
                                            </SidebarMenuSubButton>
                                          </SidebarMenuSubItem>
                                        );
                                      })}
                                    </SidebarMenuSub>
                                  </CollapsibleContent>
                                </Collapsible>
                              );
                            })}
                          </div>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  );
                }

                if (hasChildren) {
                  return (
                    <Collapsible
                      key={item.label}
                      open={isOpen}
                      onOpenChange={() => toggleMenu(item.label)}
                    >
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton
                            tooltip={item.label}
                            data-tour={item.tourId}
                            className={`h-10 transition-all font-normal ${isActive ? "bg-accent" : ""}`}
                          >
                            <item.icon
                              className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                            />
                            <span className="flex-1">{item.label}</span>
                            <ChevronRight 
                              className={`h-4 w-4 transition-transform ${isOpen ? "rotate-90" : ""}`} 
                            />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            {item.children?.map(child => {
                              const isChildActive = location === child.path;
                              const ChildIcon = child.icon;
                              return (
                                <SidebarMenuSubItem key={child.path}>
                                  <SidebarMenuSubButton
                                    onClick={() => setLocation(child.path)}
                                    isActive={isChildActive}
                                    data-tour={child.tourId}
                                    className="h-9"
                                  >
                                    {ChildIcon && <ChildIcon className="h-3.5 w-3.5 mr-2" />}
                                    <span>{child.label}</span>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              );
                            })}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  );
                }

                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={location === item.path}
                      onClick={() => item.path && setLocation(item.path)}
                      tooltip={item.label}
                      data-tour={item.tourId}
                      className="h-10 transition-all font-normal"
                    >
                      <item.icon
                        className={`h-4 w-4 ${location === item.path ? "text-primary" : ""}`}
                      />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-3 border-t border-sidebar-border space-y-2">
            {!isCollapsed && (
              <SopHelpButton onClick={() => setHelpOpen(true)} />
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border shrink-0">
                    <AvatarFallback className="text-xs font-medium bg-primary/10 text-primary">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none">
                      {user?.name || "-"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">
                      {user?.email || "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={() => setHelpOpen(true)}
                  className="cursor-pointer"
                >
                  <CircleHelp className="mr-2 h-4 w-4" />
                  <span>Ajuda / Tours</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sair</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1">
                  <span className="tracking-tight text-foreground font-medium">
                    {activeMenuItem?.label ?? "Menu"}
                  </span>
                </div>
              </div>
            </div>
            <SopHelpButton onClick={() => setHelpOpen(true)} />
          </div>
        )}
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </SidebarInset>

      <SopTour
        ready={Boolean(user)}
        userId={String((user as { id?: string | number } | null)?.id ?? user?.email ?? "anon")}
        helpOpen={helpOpen}
        onHelpOpenChange={setHelpOpen}
        ensureMenuOpen={ensureMenuOpen}
        onStartTourRef={startTourRef}
      />
    </HelpTourContext.Provider>
  );
}

