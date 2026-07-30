import { useAccessControl } from "@/hooks/useAccessControl";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ShieldX, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredLevel?: 1 | 2 | 3;
  requireEditPermission?: boolean;
  requireManageUsers?: boolean;
}

/**
 * Componente para proteger rotas baseado no nível de acesso do usuário
 * 
 * @param requiredLevel - Nível mínimo necessário (1, 2 ou 3)
 * @param requireEditPermission - Se true, requer permissão de editar cadastros (nível 3)
 * @param requireManageUsers - Se true, requer permissão de gerenciar usuários (nível 3)
 */
export function ProtectedRoute({
  children,
  requiredLevel = 1,
  requireEditPermission = false,
  requireManageUsers = false,
}: ProtectedRouteProps) {
  const [, setLocation] = useLocation();
  const { 
    nivelAcesso, 
    podeEditarCadastros, 
    podeGerenciarUsuarios, 
    isLoading 
  } = useAccessControl();

  // Enquanto carrega, não mostrar nada
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Verificar nível de acesso
  if (nivelAcesso < requiredLevel) {
    return <AccessDenied reason="nivel" onBack={() => setLocation("/")} />;
  }

  // Verificar permissão de edição
  if (requireEditPermission && !podeEditarCadastros) {
    return <AccessDenied reason="edit" onBack={() => setLocation("/")} />;
  }

  // Verificar permissão de gerenciar usuários
  if (requireManageUsers && !podeGerenciarUsuarios) {
    return <AccessDenied reason="users" onBack={() => setLocation("/")} />;
  }

  return <>{children}</>;
}

interface AccessDeniedProps {
  reason: "nivel" | "edit" | "users";
  onBack: () => void;
}

function AccessDenied({ reason, onBack }: AccessDeniedProps) {
  const messages = {
    nivel: {
      title: "Acesso Restrito",
      description: "Seu nível de acesso não permite visualizar esta página.",
    },
    edit: {
      title: "Sem Permissão de Edição",
      description: "Apenas usuários com nível Master/Admin podem editar cadastros.",
    },
    users: {
      title: "Sem Permissão de Gerenciamento",
      description: "Apenas usuários com nível Master/Admin podem gerenciar usuários.",
    },
  };

  const { title, description } = messages[reason];

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-6">
      <div className="max-w-md w-full space-y-6">
        <Alert variant="destructive" className="border-red-200 bg-red-50">
          <ShieldX className="h-5 w-5 text-red-600" />
          <AlertTitle className="text-red-800">{title}</AlertTitle>
          <AlertDescription className="text-red-700">
            {description}
          </AlertDescription>
        </Alert>

        <div className="text-center space-y-4">
          <p className="text-muted-foreground text-sm">
            Entre em contato com o administrador do sistema se você acredita que deveria ter acesso a esta funcionalidade.
          </p>
          <Button variant="outline" onClick={onBack} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Voltar ao Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * HOC para proteger páginas de cadastro (requer nível 3)
 */
export function withEditProtection<P extends object>(
  WrappedComponent: React.ComponentType<P>
) {
  return function ProtectedComponent(props: P) {
    return (
      <ProtectedRoute requireEditPermission>
        <WrappedComponent {...props} />
      </ProtectedRoute>
    );
  };
}
