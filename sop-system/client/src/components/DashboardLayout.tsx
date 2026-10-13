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

const ROUTE_CHUNK_PREFETCH: Record<string, () => Promise<unknown>> = {
  "/previsao-python": () => import("@/pages/integracao/PrevisaoPython"),
  "/previsao-python/ciclo-13": () =>
    import("@/pages/integracao/PrevisaoPythonCiclo13"),
  "/demanda/colaboracoes": () => import("@/pages/demanda/Colaboracoes"),
  "/demanda/acuracidade": () => import("@/pages/demanda/Acuracidade"),
  "/vendas/importar": () => import("@/pages/vendas/ImportarFaturamento"),
  "/vendas/carteira": () => import("@/pages/vendas/CarteiraPedidos"),
  "/cadastros/produtos": () => import("@/pages/cadastros/Produtos"),
  "/cadastros/skus-projetar": () => import("@/pages/cadastros/SkusProjetar"),
  "/cadastros/clientes": () => import("@/pages/cadastros/Clientes"),
  "/cadastros/gestor-marca": () => import("@/pages/cadastros/GestorMarca"),
  "/cadastros/depara": () => import("@/pages/cadastros/DeParaCodigos"),
  "/cadastros/importacao-base": () =>
    import("@/pages/cadastros/ImportacaoDadosSistema"),
  "/admin/usuarios": () => import("@/pages/admin/GerenciamentoUsuarios"),
  "/ajuda": () => import("@/pages/Ajuda"),
};

function prefetchRouteChunk(path?: string) {
  if (!path) return;
  const loader = ROUTE_CHUNK_PREFETCH[path];
  if (loader) void loader();
}
import {
  LayoutDashboard,
  LogOut,
  PanelLeft,
  Package,
  Users,
  TrendingUp,
  Settings,
  ChevronRight,
  Route,
  UserCog,
  ShoppingCart,
  FileSpreadsheet,
  Target,
  TableProperties,
  Shield,
  Briefcase,
  Layers,
  CheckCircle,
  Building,
  Archive,
  Ruler,
  Shirt,
  CircleHelp,
  Play,
  Sparkles,
} from "lucide-react";
import {
  CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
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

/**
 * Menu = Passo a Passo Word (Previsão de Demanda).
 * Itens fora do fluxo vão em Arquivados (rotas continuam acessíveis).
 */
const menuItems: MenuItem[] = [
  {
    icon: TrendingUp,
    label: "Previsao de Demanda",
    tourId: "nav-demanda",
    children: [
      {
        label: "Gerar Previsao",
        path: "/previsao-python",
        icon: Play,
        tourId: "nav-previsao-python",
      },
      {
        label: "Bases / Faturamento",
        path: "/vendas/importar",
        icon: FileSpreadsheet,
        tourId: "nav-vendas-importar",
      },
      {
        label: "Colaboracao Comercial",
        path: "/demanda/colaboracoes",
        icon: Users,
        tourId: "nav-demanda-colaboracoes",
      },
      {
        label: "Carteira / PV",
        path: "/vendas/carteira",
        icon: ShoppingCart,
        tourId: "nav-vendas-carteira",
      },
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
          {
            label: "Gestor x Marca",
            path: "/cadastros/gestor-marca",
            icon: UserCog,
            tourId: "nav-cadastros-gestor-marca",
          },
        ],
      },
      {
        label: "Produto",
        icon: Package,
        items: [
          {
            label: "Produtos",
            path: "/cadastros/produtos",
            icon: Package,
            tourId: "nav-cadastros-produtos",
          },
          {
            label: "Skus Projetar",
            path: "/cadastros/skus-projetar",
            icon: Target,
            tourId: "nav-cadastros-skus-projetar",
          },
          {
            label: "De-Para",
            path: "/cadastros/depara",
            icon: Route,
            tourId: "nav-cadastros-depara",
          },
        ],
      },
    ],
  },
  {
    icon: Archive,
    label: "Arquivados",
    tourId: "nav-arquivados",
    children: [
      {
        label: "Dashboard",
        path: "/dashboard-legado",
        icon: LayoutDashboard,
        tourId: "nav-dashboard",
      },
      {
        label: "Relatorio Estatistico",
        path: "/previsao-python/ciclo-13",
        icon: TableProperties,
        tourId: "nav-previsao-ciclo13",
      },
      {
        label: "Acuracidade",
        path: "/demanda/acuracidade",
        icon: Target,
        tourId: "nav-demanda-acuracidade",
      },
      {
        label: "Clientes",
        path: "/cadastros/clientes",
        icon: Users,
        tourId: "nav-cadastros-clientes",
      },
      {
        label: "Status",
        path: "/cadastros/status",
        icon: CheckCircle,
        tourId: "nav-cadastros-status",
      },
      {
        label: "Tipo Negocio",
        path: "/cadastros/tipo-negocio",
        icon: Building,
        tourId: "nav-cadastros-tipo-negocio",
      },
      {
        label: "Tipo Estoque",
        path: "/cadastros/tipo-estoque",
        icon: Archive,
        tourId: "nav-cadastros-tipo-estoque",
      },
      {
        label: "Linhas",
        path: "/cadastros/linhas",
        icon: Layers,
        tourId: "nav-cadastros-linhas",
      },
      {
        label: "Modelos",
        path: "/cadastros/modelos",
        icon: Shirt,
        tourId: "nav-cadastros-modelos",
      },
      {
        label: "Tamanhos",
        path: "/cadastros/tamanhos",
        icon: Ruler,
        tourId: "nav-cadastros-tamanhos",
      },
      {
        label: "Membros",
        path: "/cadastros/membros",
        icon: UserCog,
        tourId: "nav-cadastros-membros",
      },
      {
        label: "Importacao Base",
        path: "/cadastros/importacao-base",
        icon: FileSpreadsheet,
        tourId: "nav-cadastros-importacao",
      },
    ],
  },
  {
    icon: Shield,
    label: "Administracao",
    tourId: "nav-admin",
    children: [
      {
        label: "Usuarios",
        path: "/admin/usuarios",
        icon: Users,
        tourId: "nav-admin-usuarios",
      },
    ],
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

  const ensureMenuOpen = useCallback(
    (menuLabel: string, sectionLabel?: string) => {
      if (isMobile) {
        setOpenMobile(true);
      }
      setOpenMenus(prev =>
        prev.includes(menuLabel) ? prev : [...prev, menuLabel]
      );
      if (sectionLabel) {
        setOpenSections(prev =>
          prev.includes(sectionLabel) ? prev : [...prev, sectionLabel]
        );
      }
    },
    [isMobile, setOpenMobile]
  );

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
          if (sectionItem)
            return {
              ...sectionItem,
              parent: item.label,
              section: section.label,
            };
        }
      }
    }
    return null;
  };

  const activeMenuItem = getActiveMenuItem();

  useEffect(() => {
    const parent =
      activeMenuItem && "parent" in activeMenuItem
        ? activeMenuItem.parent
        : undefined;
    const section =
      activeMenuItem && "section" in activeMenuItem
        ? activeMenuItem.section
        : undefined;
    if (parent) {
      setOpenMenus(prev => (prev.includes(parent) ? prev : [...prev, parent]));
    }
    if (section) {
      setOpenSections(prev =>
        prev.includes(section) ? prev : [...prev, section]
      );
    }
  }, [location]);

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
      prev.includes(label) ? prev.filter(m => m !== label) : [...prev, label]
    );
  };

  return (
    <HelpTourContext.Provider value={helpApi}>
      <div className="relative" ref={sidebarRef} data-tour="nav-sidebar">
        <Sidebar
          collapsible="icon"
          className="border-r-0 shadow-[10px_0_35px_-24px_rgba(3,18,38,0.8)]"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-20 justify-center border-b border-sidebar-border/70">
            <div
              className="flex items-center gap-3 px-2 transition-all w-full"
              data-tour="nav-brand"
            >
              <button
                onClick={toggleSidebar}
                className="h-9 w-9 flex items-center justify-center hover:bg-sidebar-accent rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-sidebar-foreground/65" />
              </button>
              {!isCollapsed ? (
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm"
                    aria-label="Printbag"
                  >
                    <span className="absolute inset-x-0 bottom-0 h-1.5 bg-emerald-400" />
                    <span className="text-sm font-black tracking-[-0.08em] text-[#0d4f8b]">
                      PB
                    </span>
                  </div>
                  <div className="min-w-0">
                    <span className="block truncate text-sm font-bold tracking-tight text-white">
                      Printbag S&OP
                    </span>
                    <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/45">
                      Planejamento integrado
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0 py-4">
            {!isCollapsed && (
              <div className="px-4 pb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-sidebar-foreground/35">
                Espaço de trabalho
              </div>
            )}
            <SidebarMenu className="px-3">
              {menuItems.map(item => {
                const hasChildren = item.children && item.children.length > 0;
                const hasSections = item.sections && item.sections.length > 0;
                const isOpen = openMenus.includes(item.label);
                const isActive =
                  item.path === location ||
                  item.children?.some(c => c.path === location) ||
                  item.sections?.some(s =>
                    s.items.some(i => i.path === location)
                  );

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
                            className={`h-11 rounded-xl px-3 transition-all font-medium ${
                              isActive
                                ? "bg-sidebar-accent text-white shadow-inner"
                                : "text-sidebar-foreground/72 hover:text-white"
                            }`}
                          >
                            <item.icon
                              className={`h-4 w-4 ${isActive ? "text-sidebar-primary" : ""}`}
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
                              const isSectionOpen = openSections.includes(
                                section.label
                              );
                              const isSectionActive = section.items.some(
                                i => i.path === location
                              );
                              return (
                                <Collapsible
                                  key={section.label}
                                  open={isSectionOpen}
                                  onOpenChange={() =>
                                    toggleSection(section.label)
                                  }
                                >
                                  <CollapsibleTrigger asChild>
                                    <button
                                      className={`flex items-center gap-2 w-full px-3 py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg hover:bg-sidebar-accent/70 transition-colors ${
                                        isSectionActive
                                          ? "text-sidebar-primary"
                                          : "text-sidebar-foreground/45"
                                      }`}
                                    >
                                      {SectionIcon && (
                                        <SectionIcon className="h-3.5 w-3.5" />
                                      )}
                                      <span className="flex-1 text-left">
                                        {section.label}
                                      </span>
                                      <ChevronRight
                                        className={`h-3.5 w-3.5 transition-transform ${isSectionOpen ? "rotate-90" : ""}`}
                                      />
                                    </button>
                                  </CollapsibleTrigger>
                                  <CollapsibleContent>
                                    <SidebarMenuSub className="ml-0 pl-0 border-l-0">
                                      {section.items.map(sectionItem => {
                                        const isItemActive =
                                          location === sectionItem.path;
                                        const ItemIcon = sectionItem.icon;
                                        return (
                                          <SidebarMenuSubItem
                                            key={sectionItem.path}
                                          >
                                            <SidebarMenuSubButton
                                              onMouseEnter={() =>
                                                prefetchRouteChunk(sectionItem.path)
                                              }
                                              onClick={() =>
                                                setLocation(sectionItem.path)
                                              }
                                              isActive={isItemActive}
                                              data-tour={sectionItem.tourId}
                                              className="h-9 rounded-lg pl-6 text-sidebar-foreground/65 data-[active=true]:bg-sidebar-primary/15 data-[active=true]:text-sidebar-primary"
                                            >
                                              {ItemIcon && (
                                                <ItemIcon className="h-3.5 w-3.5 mr-2" />
                                              )}
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
                            className={`h-11 rounded-xl px-3 transition-all font-medium ${
                              isActive
                                ? "bg-sidebar-accent text-white shadow-inner"
                                : "text-sidebar-foreground/72 hover:text-white"
                            }`}
                          >
                            <item.icon
                              className={`h-4 w-4 ${isActive ? "text-sidebar-primary" : ""}`}
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
                                    onMouseEnter={() =>
                                      prefetchRouteChunk(child.path)
                                    }
                                    onClick={() => setLocation(child.path)}
                                    isActive={isChildActive}
                                    data-tour={child.tourId}
                                    className="h-9 rounded-lg text-sidebar-foreground/65 data-[active=true]:bg-sidebar-primary/15 data-[active=true]:text-sidebar-primary"
                                  >
                                    {ChildIcon && (
                                      <ChildIcon className="h-3.5 w-3.5 mr-2" />
                                    )}
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
                      onMouseEnter={() => prefetchRouteChunk(item.path)}
                      onClick={() => item.path && setLocation(item.path)}
                      tooltip={item.label}
                      data-tour={item.tourId}
                      className="h-11 rounded-xl px-3 font-medium text-sidebar-foreground/72 transition-all hover:text-white data-[active=true]:bg-sidebar-accent data-[active=true]:text-white"
                    >
                      <item.icon
                        className={`h-4 w-4 ${location === item.path ? "text-sidebar-primary" : ""}`}
                      />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-3 border-t border-sidebar-border/70 space-y-2">
            {!isCollapsed && (
              <SopHelpButton onClick={() => setHelpOpen(true)} />
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-xl p-2 hover:bg-sidebar-accent transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
                  <Avatar className="h-9 w-9 border border-sidebar-border shrink-0">
                    <AvatarFallback className="text-xs font-bold bg-sidebar-primary text-sidebar-primary-foreground">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-semibold text-white truncate leading-none">
                      {user?.name || "-"}
                    </p>
                    <p className="text-xs text-sidebar-foreground/45 truncate mt-1.5">
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

      <SidebarInset className="min-w-0 bg-transparent">
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
        {!isMobile && (
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border/60 bg-background/75 px-6 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/8 text-primary">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  S&OP Printbag
                </p>
                <p className="text-sm font-semibold leading-tight">
                  {activeMenuItem?.label ?? "Visão geral"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-emerald-200/70 bg-emerald-50/80 px-3 py-1.5 text-xs font-semibold text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.12)]" />
              Sistema operacional
            </div>
          </header>
        )}
        <main className="relative flex-1 p-4 md:p-7 lg:p-9">
          <div className="mx-auto w-full max-w-[1600px]">{children}</div>
        </main>
      </SidebarInset>

      <SopTour
        ready={Boolean(user)}
        userId={String(
          (user as { id?: string | number } | null)?.id ?? user?.email ?? "anon"
        )}
        helpOpen={helpOpen}
        onHelpOpenChange={setHelpOpen}
        ensureMenuOpen={ensureMenuOpen}
        onStartTourRef={startTourRef}
      />
    </HelpTourContext.Provider>
  );
}
