import { describe, it, expect } from "vitest";
import * as db from "./db";

const itWithDatabase = process.env.DATABASE_URL ? it : it.skip;

describe("Níveis de Acesso", () => {
  it("deve listar níveis de acesso", async () => {
    const niveis = await db.getAllNiveisAcesso();
    expect(Array.isArray(niveis)).toBe(true);
    expect(niveis.length).toBeGreaterThanOrEqual(0);
  });

  it("deve ter estrutura correta para níveis de acesso", async () => {
    const niveis = await db.getAllNiveisAcesso();
    if (niveis.length > 0) {
      const nivel = niveis[0];
      expect(nivel).toHaveProperty("id");
      expect(nivel).toHaveProperty("nivel");
      expect(nivel).toHaveProperty("nome");
      expect(nivel).toHaveProperty("podeEditarCadastros");
      expect(nivel).toHaveProperty("podeVerTodasMarcas");
      expect(nivel).toHaveProperty("podeGerenciarUsuarios");
    }
  });

  it("níveis devem estar ordenados por número", async () => {
    const niveis = await db.getAllNiveisAcesso();
    if (niveis.length > 1) {
      for (let i = 1; i < niveis.length; i++) {
        expect(niveis[i].nivel).toBeGreaterThanOrEqual(niveis[i - 1].nivel);
      }
    }
  });
});

describe("Gerenciamento de Usuários", () => {
  // Teste de criação de usuário
  itWithDatabase("deve criar um novo usuário com dados válidos", async () => {
    const novoUsuario = {
      name: "Teste Usuario",
      email: `teste_${Date.now()}@exemplo.com`,
      nivelAcesso: 1,
    };
    
    const result = await db.createUser(novoUsuario);
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
  });

  itWithDatabase("deve atualizar dados do usuário", async () => {
    // Criar usuário para teste
    const email = `update_test_${Date.now()}@exemplo.com`;
    await db.createUser({ name: "Usuario Original", email, nivelAcesso: 1 });
    
    // Buscar o usuário criado
    const usuarios = await db.getAllUsers();
    const usuario = usuarios.find((u: any) => u.email === email);
    expect(usuario).toBeDefined();
    
    // Atualizar dados
    const result = await db.updateUserData(usuario!.id, { name: "Usuario Atualizado" });
    expect(result.success).toBe(true);
    
    // Verificar atualização
    const usuarioAtualizado = await db.getUserById(usuario!.id);
    expect(usuarioAtualizado?.name).toBe("Usuario Atualizado");
  });

  itWithDatabase("deve excluir usuário", async () => {
    // Criar usuário para teste
    const email = `delete_test_${Date.now()}@exemplo.com`;
    await db.createUser({ name: "Usuario Para Excluir", email, nivelAcesso: 1 });
    
    // Buscar o usuário criado
    const usuarios = await db.getAllUsers();
    const usuario = usuarios.find((u: any) => u.email === email);
    expect(usuario).toBeDefined();
    
    // Excluir usuário
    const result = await db.deleteUser(usuario!.id);
    expect(result.success).toBe(true);
    
    // Verificar exclusão
    const usuarioExcluido = await db.getUserById(usuario!.id);
    expect(usuarioExcluido).toBeNull();
  });

  it("deve listar usuários", async () => {
    const usuarios = await db.getAllUsers();
    expect(Array.isArray(usuarios)).toBe(true);
    expect(usuarios.length).toBeGreaterThanOrEqual(0);
  });

  it("deve ter estrutura correta para usuários", async () => {
    const usuarios = await db.getAllUsers();
    if (usuarios.length > 0) {
      const usuario = usuarios[0];
      expect(usuario).toHaveProperty("id");
      expect(usuario).toHaveProperty("name");
      expect(usuario).toHaveProperty("email");
      expect(usuario).toHaveProperty("nivelAcesso");
      expect(usuario).toHaveProperty("ativo");
    }
  });

  it("deve buscar usuário por ID", async () => {
    const usuarios = await db.getAllUsers();
    if (usuarios.length > 0) {
      const usuario = await db.getUserById(usuarios[0].id);
      expect(usuario).not.toBeNull();
      expect(usuario?.id).toBe(usuarios[0].id);
    }
  });

  it("deve retornar null para ID inexistente", async () => {
    const usuario = await db.getUserById(999999);
    expect(usuario).toBeNull();
  });
});

describe("Usuário-Marca", () => {
  it("deve listar marcas do usuário", async () => {
    const usuarios = await db.getAllUsers();
    if (usuarios.length > 0) {
      const marcas = await db.getUsuarioMarcas(usuarios[0].id);
      expect(Array.isArray(marcas)).toBe(true);
    }
  });

  it("getMarcasPermitidas deve retornar todas marcas para nível 2 ou superior", async () => {
    const usuarios = await db.getAllUsers();
    if (usuarios.length > 0) {
      // Nível 2 (Gerente Comercial) deve ver todas as marcas
      const marcasNivel2 = await db.getMarcasPermitidas(usuarios[0].id, 2);
      const todasMarcas = await db.listMarcas();
      
      // Deve retornar todas as marcas ativas
      expect(marcasNivel2.length).toBe(todasMarcas.filter((m: any) => m.ativo).length);
    }
  });

  it("getMarcasPermitidas deve retornar apenas marcas vinculadas para nível 1", async () => {
    const usuarios = await db.getAllUsers();
    if (usuarios.length > 0) {
      // Nível 1 (Gestor) deve ver apenas suas marcas
      const marcasNivel1 = await db.getMarcasPermitidas(usuarios[0].id, 1);
      const marcasVinculadas = await db.getUsuarioMarcas(usuarios[0].id);
      
      // Deve retornar apenas as marcas vinculadas
      expect(marcasNivel1.length).toBe(marcasVinculadas.length);
    }
  });
});

describe("Permissões por Nível", () => {
  it("Nível 1 (Gestor) não deve poder editar cadastros", async () => {
    const niveis = await db.getAllNiveisAcesso();
    const gestor = niveis.find((n: any) => n.nivel === 1);
    if (gestor) {
      expect(gestor.podeEditarCadastros).toBe(false);
      expect(gestor.podeVerTodasMarcas).toBe(false);
      expect(gestor.podeGerenciarUsuarios).toBe(false);
    }
  });

  it("Nível 2 (Gerente Comercial) deve ver todas marcas mas não editar", async () => {
    const niveis = await db.getAllNiveisAcesso();
    const gerente = niveis.find((n: any) => n.nivel === 2);
    if (gerente) {
      expect(gerente.podeEditarCadastros).toBe(false);
      expect(gerente.podeVerTodasMarcas).toBe(true);
      expect(gerente.podeGerenciarUsuarios).toBe(false);
    }
  });

  it("Nível 3 (Master/Admin) deve ter acesso total", async () => {
    const niveis = await db.getAllNiveisAcesso();
    const master = niveis.find((n: any) => n.nivel === 3);
    if (master) {
      expect(master.podeEditarCadastros).toBe(true);
      expect(master.podeVerTodasMarcas).toBe(true);
      expect(master.podeGerenciarUsuarios).toBe(true);
    }
  });
});
