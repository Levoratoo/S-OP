import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useMemo } from "react";

export type NivelAcesso = 1 | 2 | 3;

export interface AccessControlState {
  nivelAcesso: NivelAcesso;
  podeEditarCadastros: boolean;
  podeVerTodasMarcas: boolean;
  podeGerenciarUsuarios: boolean;
  marcasPermitidas: number[];
  /** Nomes das marcas permitidas (lower-case, sem acento) para filtrar itens sem marcaId. */
  marcasPermitidasNomes: string[];
  isLoading: boolean;
  isGestor: boolean;
  isGerenteComercial: boolean;
  isMaster: boolean;
}

function normalizeMarcaNome(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Hook para controle de acesso baseado no nível do usuário
 * 
 * Níveis:
 * - 1 (Gestor): Vê apenas suas marcas, não edita cadastros
 * - 2 (Gerente Comercial): Vê todas marcas, não edita cadastros
 * - 3 (Master/Admin): Acesso total
 */
export function useAccessControl(): AccessControlState {
  const { user, loading: authLoading } = useAuth();
  
  // Obter nível de acesso do usuário
  const nivelAcesso = ((user as any)?.nivelAcesso || 1) as NivelAcesso;
  
  // Buscar marcas permitidas para o usuário
  const { data: marcasPermitidas = [], isLoading: loadingMarcas } = trpc.usuarios.minhasMarcas.useQuery(
    undefined,
    { enabled: !!user }
  );

  const state = useMemo(() => {
    // Definir permissões baseadas no nível
    const isGestor = nivelAcesso === 1;
    const isGerenteComercial = nivelAcesso === 2;
    const isMaster = nivelAcesso === 3;

    return {
      nivelAcesso,
      podeEditarCadastros: isMaster,
      podeVerTodasMarcas: isGerenteComercial || isMaster,
      podeGerenciarUsuarios: isMaster,
      marcasPermitidas: marcasPermitidas.map((m: any) => m.id),
      marcasPermitidasNomes: marcasPermitidas.map((m: any) => normalizeMarcaNome(m.nome)),
      isLoading: authLoading || loadingMarcas,
      isGestor,
      isGerenteComercial,
      isMaster,
    };
  }, [nivelAcesso, marcasPermitidas, authLoading, loadingMarcas]);

  return state;
}

/**
 * Hook para verificar se o usuário pode acessar uma determinada marca
 */
export function useCanAccessMarca(marcaId: number | undefined): boolean {
  const { podeVerTodasMarcas, marcasPermitidas, isLoading } = useAccessControl();
  
  if (isLoading || !marcaId) return true;
  if (podeVerTodasMarcas) return true;
  
  return marcasPermitidas.includes(marcaId);
}

/**
 * Hook para filtrar dados por marcas permitidas
 */
export function useFilterByMarcas<T extends { marcaId?: number | null; marca?: string | null }>(
  data: T[] | undefined
): T[] {
  const { podeVerTodasMarcas, marcasPermitidas, marcasPermitidasNomes, isLoading } =
    useAccessControl();

  if (isLoading || !data) return data || [];
  if (podeVerTodasMarcas) return data;

  return data.filter(item => {
    if (item.marcaId != null && marcasPermitidas.includes(item.marcaId)) return true;
    if (item.marca) {
      return marcasPermitidasNomes.includes(normalizeMarcaNome(item.marca));
    }
    return false;
  });
}

export { normalizeMarcaNome };
