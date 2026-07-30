$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$binDir = Join-Path $projectRoot ".local\mariadb-11.8.6\mariadb-11.8.6-winx64\bin"

Write-Output "[setup] Ensuring local MariaDB is running..."
& (Join-Path $PSScriptRoot "start-local-db.ps1")

$env:DATABASE_URL = "mysql://root:root@127.0.0.1:3307/sop_system"
$mariadbCli = Join-Path $binDir "mariadb.exe"

$usersTableExists = & $mariadbCli `
  -h 127.0.0.1 `
  -P 3307 `
  -u root `
  -proot `
  -N `
  -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='sop_system' AND table_name='users';"

if ($usersTableExists -eq "0") {
  Write-Output "[setup] Applying schema with Drizzle..."
  Push-Location $projectRoot
  try {
    corepack pnpm exec drizzle-kit push --force
    if ($LASTEXITCODE -ne 0) {
      throw "Drizzle push failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
} else {
  Write-Output "[setup] Schema already exists. Skipping Drizzle push."
}

$seedSql = @'
USE sop_system;

INSERT INTO niveis_acesso (nivel, nome, descricao, podeEditarCadastros, podeVerTodasMarcas, podeGerenciarUsuarios)
VALUES
(1, 'Gestor', 'Visualiza apenas dados das marcas que gerencia', 0, 0, 0),
(2, 'Gerente Comercial', 'Visualiza todas as marcas, sem edição de cadastros', 0, 1, 0),
(3, 'Master/Admin', 'Acesso total ao sistema', 1, 1, 1)
ON DUPLICATE KEY UPDATE
  nome = VALUES(nome),
  descricao = VALUES(descricao),
  podeEditarCadastros = VALUES(podeEditarCadastros),
  podeVerTodasMarcas = VALUES(podeVerTodasMarcas),
  podeGerenciarUsuarios = VALUES(podeGerenciarUsuarios);

INSERT INTO users (openId, name, email, loginMethod, role, nivelAcesso, ativo, lastSignedIn)
VALUES ('local-dev-user', 'Pedro Local', 'pedro.local@example.com', 'local-dev', 'admin', 3, 1, NOW())
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  email = VALUES(email),
  loginMethod = VALUES(loginMethod),
  role = VALUES(role),
  nivelAcesso = VALUES(nivelAcesso),
  ativo = VALUES(ativo),
  lastSignedIn = VALUES(lastSignedIn);

INSERT INTO marcas (nome, grupoMarca, ramoAtuacao, ativo)
SELECT 'Printbag', 'Grupo Local', 'Embalagens', 1
WHERE NOT EXISTS (SELECT 1 FROM marcas WHERE nome = 'Printbag');

INSERT INTO clientes (codigo, razaoSocial, nomeFantasia, cidade, estado, status)
SELECT 'CLI001', 'Cliente Exemplo LTDA', 'Cliente Exemplo', 'Sao Paulo', 'SP', 'ATIVO'
WHERE NOT EXISTS (SELECT 1 FROM clientes WHERE codigo = 'CLI001');

INSERT INTO produtos (codItem, codigo, nome, descricao, marca, linha, modelo, tamanho, tipoEstoque, status)
SELECT '99.99.000001', '99.99.000001', 'Produto Exemplo', 'Produto Exemplo Local', 'Printbag', 'Classic', 'Sacola', 'M', 'MTS', 'ATIVO'
WHERE NOT EXISTS (SELECT 1 FROM produtos WHERE codItem = '99.99.000001');

INSERT INTO faturamento (dataEmissao, nfNumero, codCliente, cidade, uf, marca, codMaterial, descricaoItem, tipoNegocio, tipoEstoque, linhaProduto, qtd, valorTotal, tipoFaturamento)
SELECT CURDATE(), 'NF-LOCAL-001', 'CLI001', 'Sao Paulo', 'SP', 'Printbag', '99.99.000001', 'Produto Exemplo Local', 'PRG', 'MTS', 'Classic', 100, 2500.00, 'SAIDA'
WHERE NOT EXISTS (SELECT 1 FROM faturamento WHERE nfNumero = 'NF-LOCAL-001');
'@

Write-Output "[setup] Seeding local data..."
& $mariadbCli `
  -h 127.0.0.1 `
  -P 3307 `
  -u root `
  -proot `
  -e $seedSql | Out-Null

Write-Output "[setup] Local environment is ready."
