import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { 
  Users, 
  Shield, 
  Settings, 
  Search, 
  UserCheck, 
  UserX, 
  Edit, 
  Tag,
  Building2,
  RefreshCw,
  UserPlus,
  Trash2,
  Pencil
} from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export default function GerenciamentoUsuarios() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [marcasDialogOpen, setMarcasDialogOpen] = useState(false);
  const [selectedNivel, setSelectedNivel] = useState<string>("");
  const [selectedMarcas, setSelectedMarcas] = useState<number[]>([]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newUserData, setNewUserData] = useState({
    name: "",
    email: "",
    nivelAcesso: 1,
  });
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<any>(null);
  const [editDataDialogOpen, setEditDataDialogOpen] = useState(false);
  const [editUserData, setEditUserData] = useState({ name: "", email: "" });
  const [filterNivel, setFilterNivel] = useState<string>("all");

  // Queries
  const { data: usuarios = [], isLoading: loadingUsuarios, refetch: refetchUsuarios } = trpc.usuarios.list.useQuery();
  const { data: niveisAcesso = [], isLoading: loadingNiveis, refetch: refetchNiveis } = trpc.niveisAcesso.list.useQuery();
  const { data: marcas = [] } = trpc.marcas.list.useQuery();

  // Mutations
  const updateNivelMutation = trpc.usuarios.updateNivelAcesso.useMutation({
    onSuccess: () => {
      toast.success("Nível de acesso atualizado com sucesso!");
      refetchUsuarios();
      setEditDialogOpen(false);
    },
    onError: (error) => {
      toast.error("Erro ao atualizar nível de acesso: " + error.message);
    }
  });

  const updateAtivoMutation = trpc.usuarios.updateAtivo.useMutation({
    onSuccess: () => {
      toast.success("Status do usuário atualizado!");
      refetchUsuarios();
    },
    onError: (error) => {
      toast.error("Erro ao atualizar status: " + error.message);
    }
  });

  const setMarcasMutation = trpc.usuarios.setMarcas.useMutation({
    onSuccess: () => {
      toast.success("Marcas do usuário atualizadas!");
      setMarcasDialogOpen(false);
    },
    onError: (error) => {
      toast.error("Erro ao atualizar marcas: " + error.message);
    }
  });

  const initNiveisMutation = trpc.niveisAcesso.initPadrao.useMutation({
    onSuccess: () => {
      toast.success("Níveis de acesso inicializados!");
      refetchNiveis();
    },
    onError: (error) => {
      toast.error("Erro ao inicializar níveis: " + error.message);
    }
  });

  const createUserMutation = trpc.usuarios.create.useMutation({
    onSuccess: () => {
      toast.success("Usuário criado com sucesso!");
      refetchUsuarios();
      setCreateDialogOpen(false);
      setNewUserData({ name: "", email: "", nivelAcesso: 1 });
    },
    onError: (error: any) => {
      toast.error("Erro ao criar usuário: " + error.message);
    }
  });

  const deleteUserMutation = trpc.usuarios.delete.useMutation({
    onSuccess: () => {
      toast.success("Usuário excluído com sucesso!");
      refetchUsuarios();
      setDeleteDialogOpen(false);
      setUserToDelete(null);
    },
    onError: (error: any) => {
      toast.error("Erro ao excluir usuário: " + error.message);
    }
  });

  const updateDataMutation = trpc.usuarios.updateData.useMutation({
    onSuccess: () => {
      toast.success("Dados do usuário atualizados!");
      refetchUsuarios();
      setEditDataDialogOpen(false);
      setSelectedUser(null);
    },
    onError: (error: any) => {
      toast.error("Erro ao atualizar dados: " + error.message);
    }
  });

  // Filtrar usuários
  const usuariosFiltrados = usuarios.filter((u: any) => {
    // Filtro por texto (nome ou email)
    const matchesSearch = searchTerm === "" || 
      u.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Filtro por nível de acesso
    const matchesNivel = filterNivel === "all" || 
      String(u.nivelAcesso || 1) === filterNivel;
    
    return matchesSearch && matchesNivel;
  });

  // Handlers
  const handleEditUser = (user: any) => {
    setSelectedUser(user);
    setSelectedNivel(String(user.nivelAcesso || 1));
    setEditDialogOpen(true);
  };

  const { data: userMarcasData, refetch: refetchUserMarcas } = trpc.usuarios.getMarcas.useQuery(
    { userId: selectedUser?.id || 0 },
    { enabled: !!selectedUser && marcasDialogOpen }
  );

  const handleEditMarcas = (user: any) => {
    setSelectedUser(user);
    setSelectedMarcas([]);
    setMarcasDialogOpen(true);
  };

  // Atualizar marcas selecionadas quando dados chegarem
  useEffect(() => {
    if (userMarcasData && marcasDialogOpen) {
      setSelectedMarcas(userMarcasData.map((m: any) => m.marcaId));
    }
  }, [userMarcasData, marcasDialogOpen]);

  const handleSaveNivel = () => {
    if (!selectedUser) return;
    updateNivelMutation.mutate({
      userId: selectedUser.id,
      nivelAcesso: parseInt(selectedNivel),
    });
  };

  const handleSaveMarcas = () => {
    if (!selectedUser) return;
    setMarcasMutation.mutate({
      userId: selectedUser.id,
      marcaIds: selectedMarcas,
    });
  };

  const handleToggleAtivo = (user: any) => {
    updateAtivoMutation.mutate({
      userId: user.id,
      ativo: !user.ativo,
    });
  };

  const toggleMarca = (marcaId: number) => {
    setSelectedMarcas(prev => 
      prev.includes(marcaId) 
        ? prev.filter(id => id !== marcaId)
        : [...prev, marcaId]
    );
  };

  const handleCreateUser = () => {
    if (!newUserData.name.trim() || !newUserData.email.trim()) {
      toast.error("Nome e email são obrigatórios");
      return;
    }
    createUserMutation.mutate(newUserData);
  };

  const handleDeleteUser = (user: any) => {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteUser = () => {
    if (userToDelete) {
      deleteUserMutation.mutate({ userId: userToDelete.id });
    }
  };

  const handleEditData = (user: any) => {
    setSelectedUser(user);
    setEditUserData({ name: user.name || "", email: user.email || "" });
    setEditDataDialogOpen(true);
  };

  const handleSaveData = () => {
    if (!selectedUser) return;
    if (!editUserData.name.trim() || !editUserData.email.trim()) {
      toast.error("Nome e email são obrigatórios");
      return;
    }
    updateDataMutation.mutate({
      userId: selectedUser.id,
      name: editUserData.name,
      email: editUserData.email,
    });
  };

  const getNivelBadge = (nivel: number) => {
    switch (nivel) {
      case 1:
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Gestor</Badge>;
      case 2:
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Gerente Comercial</Badge>;
      case 3:
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Master/Admin</Badge>;
      default:
        return <Badge variant="outline">Nível {nivel}</Badge>;
    }
  };

  const getNivelDescricao = (nivel: number) => {
    switch (nivel) {
      case 1:
        return "Visualiza apenas dados das marcas que gerencia";
      case 2:
        return "Visualiza todas as marcas, mas não pode editar cadastros";
      case 3:
        return "Acesso total - pode editar cadastros e gerenciar usuários";
      default:
        return "";
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="h-6 w-6 text-indigo-600" />
            Gerenciamento de Usuários
          </h1>
          <p className="text-gray-500 mt-1">
            Gerencie os usuários do sistema e seus níveis de acesso
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            onClick={() => setCreateDialogOpen(true)}
            className="flex items-center gap-2"
          >
            <UserPlus className="h-4 w-4" />
            Novo Usuário
          </Button>
          <Button 
            variant="outline" 
            onClick={() => refetchUsuarios()}
            className="flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </Button>
        </div>
      </div>

      <Tabs defaultValue="usuarios" className="space-y-4">
        <TabsList>
          <TabsTrigger value="usuarios" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Usuários
          </TabsTrigger>
          <TabsTrigger value="niveis" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Níveis de Acesso
          </TabsTrigger>
        </TabsList>

        {/* Tab: Usuários */}
        <TabsContent value="usuarios" className="space-y-4">
          {/* Barra de busca e filtros */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Buscar por nome ou email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="w-full sm:w-48">
                  <Select value={filterNivel} onValueChange={setFilterNivel}>
                    <SelectTrigger>
                      <SelectValue placeholder="Filtrar por nível" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os níveis</SelectItem>
                      {niveisAcesso.map((nivel: any) => (
                        <SelectItem key={nivel.id} value={String(nivel.nivel)}>
                          {nivel.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Lista de usuários */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Usuários Cadastrados</CardTitle>
              <CardDescription>
                {usuariosFiltrados.length} usuário(s) encontrado(s)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingUsuarios ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : usuariosFiltrados.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  Nenhum usuário encontrado
                </div>
              ) : (
                <div className="space-y-3">
                  {usuariosFiltrados.map((user: any) => (
                    <div 
                      key={user.id}
                      className={`flex items-center justify-between p-4 rounded-lg border ${
                        user.ativo ? 'bg-white' : 'bg-gray-50 opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          user.ativo ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-200 text-gray-500'
                        }`}>
                          {user.name?.charAt(0)?.toUpperCase() || 'U'}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900 flex items-center gap-2">
                            {user.name || 'Sem nome'}
                            {!user.ativo && (
                              <Badge variant="destructive" className="text-xs">Inativo</Badge>
                            )}
                          </div>
                          <div className="text-sm text-gray-500">{user.email || 'Sem email'}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {getNivelBadge(user.nivelAcesso || 1)}
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditData(user)}
                            title="Editar dados do usuário"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditUser(user)}
                            title="Editar nível de acesso"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          {(user.nivelAcesso === 1) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditMarcas(user)}
                              title="Gerenciar marcas"
                            >
                              <Tag className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleAtivo(user)}
                            title={user.ativo ? "Desativar usuário" : "Ativar usuário"}
                          >
                            {user.ativo ? (
                              <UserX className="h-4 w-4 text-red-500" />
                            ) : (
                              <UserCheck className="h-4 w-4 text-green-500" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteUser(user)}
                            title="Excluir usuário"
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Níveis de Acesso */}
        <TabsContent value="niveis" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Níveis de Acesso</CardTitle>
                <CardDescription>
                  Configuração dos níveis de permissão do sistema
                </CardDescription>
              </div>
              {niveisAcesso.length === 0 && (
                <Button onClick={() => initNiveisMutation.mutate()}>
                  <Settings className="h-4 w-4 mr-2" />
                  Inicializar Níveis Padrão
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {loadingNiveis ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : niveisAcesso.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Shield className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>Nenhum nível de acesso configurado</p>
                  <p className="text-sm">Clique em "Inicializar Níveis Padrão" para criar os níveis</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {niveisAcesso.map((nivel: any) => (
                    <div 
                      key={nivel.id}
                      className="p-4 rounded-lg border bg-white"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                            nivel.nivel === 1 ? 'bg-blue-100 text-blue-600' :
                            nivel.nivel === 2 ? 'bg-amber-100 text-amber-600' :
                            'bg-green-100 text-green-600'
                          }`}>
                            {nivel.nivel}
                          </div>
                          <div>
                            <div className="font-medium">{nivel.nome}</div>
                            <div className="text-sm text-gray-500">{nivel.descricao}</div>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-4 mt-3 text-sm">
                        <div className="flex items-center gap-2">
                          <span className={nivel.podeEditarCadastros ? 'text-green-600' : 'text-gray-400'}>
                            {nivel.podeEditarCadastros ? '✓' : '✗'}
                          </span>
                          <span>Editar Cadastros</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={nivel.podeVerTodasMarcas ? 'text-green-600' : 'text-gray-400'}>
                            {nivel.podeVerTodasMarcas ? '✓' : '✗'}
                          </span>
                          <span>Ver Todas Marcas</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={nivel.podeGerenciarUsuarios ? 'text-green-600' : 'text-gray-400'}>
                            {nivel.podeGerenciarUsuarios ? '✓' : '✗'}
                          </span>
                          <span>Gerenciar Usuários</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Legenda */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Legenda dos Níveis</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-200 mt-0.5">Nível 1</Badge>
                <div>
                  <div className="font-medium text-blue-900">Gestor</div>
                  <div className="text-sm text-blue-700">
                    Visualiza apenas dados das marcas que gerencia. Ideal para gestores de contas específicas.
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-lg">
                <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-200 mt-0.5">Nível 2</Badge>
                <div>
                  <div className="font-medium text-amber-900">Gerente Comercial</div>
                  <div className="text-sm text-amber-700">
                    Visualiza todas as marcas e dados, mas não pode editar cadastros. Ideal para supervisão.
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg">
                <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200 mt-0.5">Nível 3</Badge>
                <div>
                  <div className="font-medium text-green-900">Master/Admin</div>
                  <div className="text-sm text-green-700">
                    Acesso total ao sistema. Pode editar cadastros, gerenciar usuários e configurar integrações.
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog: Editar Nível de Acesso */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Nível de Acesso</DialogTitle>
            <DialogDescription>
              Altere o nível de acesso do usuário {selectedUser?.name || selectedUser?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nível de Acesso</Label>
              <Select value={selectedNivel} onValueChange={setSelectedNivel}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o nível" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold">1</span>
                      Gestor
                    </div>
                  </SelectItem>
                  <SelectItem value="2">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-sm font-bold">2</span>
                      Gerente Comercial
                    </div>
                  </SelectItem>
                  <SelectItem value="3">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-sm font-bold">3</span>
                      Master/Admin
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {selectedNivel && (
              <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
                {getNivelDescricao(parseInt(selectedNivel))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveNivel} disabled={updateNivelMutation.isPending}>
              {updateNivelMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Gerenciar Marcas */}
      <Dialog open={marcasDialogOpen} onOpenChange={setMarcasDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Marcas do Usuário
            </DialogTitle>
            <DialogDescription>
              Selecione as marcas que {selectedUser?.name || selectedUser?.email} pode visualizar
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {marcas.length === 0 ? (
              <div className="text-center py-4 text-gray-500">
                Nenhuma marca cadastrada
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {marcas.map((marca: any) => (
                  <div 
                    key={marca.id}
                    className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedMarcas.includes(marca.id) 
                        ? 'bg-indigo-50 border-indigo-200' 
                        : 'bg-white hover:bg-gray-50'
                    }`}
                    onClick={() => toggleMarca(marca.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        selectedMarcas.includes(marca.id) 
                          ? 'bg-indigo-100 text-indigo-600' 
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        <Tag className="h-4 w-4" />
                      </div>
                      <span className="font-medium">{marca.nome}</span>
                    </div>
                    <Switch 
                      checked={selectedMarcas.includes(marca.id)}
                      onCheckedChange={() => toggleMarca(marca.id)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMarcasDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveMarcas} disabled={setMarcasMutation.isPending}>
              {setMarcasMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Criar Novo Usuário */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-indigo-600" />
              Novo Usuário
            </DialogTitle>
            <DialogDescription>
              Cadastre um novo usuário no sistema
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-name">Nome *</Label>
              <Input
                id="new-name"
                placeholder="Nome completo"
                value={newUserData.name}
                onChange={(e) => setNewUserData({ ...newUserData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-email">Email *</Label>
              <Input
                id="new-email"
                type="email"
                placeholder="email@exemplo.com"
                value={newUserData.email}
                onChange={(e) => setNewUserData({ ...newUserData, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-nivel">Nível de Acesso</Label>
              <Select
                value={String(newUserData.nivelAcesso)}
                onValueChange={(value) => setNewUserData({ ...newUserData, nivelAcesso: parseInt(value) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {niveisAcesso.map((nivel: any) => (
                    <SelectItem key={nivel.id} value={String(nivel.nivel)}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{nivel.nivel}</span>
                        <span>{nivel.nome}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {getNivelDescricao(newUserData.nivelAcesso)}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateUser} disabled={createUserMutation.isPending}>
              {createUserMutation.isPending ? "Criando..." : "Criar Usuário"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog: Confirmar Exclusão */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o usuário <strong>{userToDelete?.name}</strong>?
              <br />
              Esta ação não pode ser desfeita e todas as associações de marca serão removidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDeleteUser}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteUserMutation.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog: Editar Dados do Usuário */}
      <Dialog open={editDataDialogOpen} onOpenChange={setEditDataDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-indigo-600" />
              Editar Dados do Usuário
            </DialogTitle>
            <DialogDescription>
              Altere o nome e email do usuário
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nome *</Label>
              <Input
                id="edit-name"
                placeholder="Nome completo"
                value={editUserData.name}
                onChange={(e) => setEditUserData({ ...editUserData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email *</Label>
              <Input
                id="edit-email"
                type="email"
                placeholder="email@exemplo.com"
                value={editUserData.email}
                onChange={(e) => setEditUserData({ ...editUserData, email: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDataDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveData} disabled={updateDataMutation.isPending}>
              {updateDataMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
