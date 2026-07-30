-- Migração manual para novas estruturas de Turnos, Recursos e Fluxos

-- 1. Atualizar tabela de turnos
ALTER TABLE turnos DROP COLUMN IF EXISTS codigo;
ALTER TABLE turnos DROP COLUMN IF EXISTS descricao;
ALTER TABLE turnos ADD COLUMN IF NOT EXISTS turnoHora VARCHAR(50) NOT NULL DEFAULT 's/ turno';
ALTER TABLE turnos ADD COLUMN IF NOT EXISTS horasRefeicao VARCHAR(10) DEFAULT '01:00';
ALTER TABLE turnos ADD COLUMN IF NOT EXISTS diasTrabalhados VARCHAR(50) NOT NULL DEFAULT 'segunda - sexta';
ALTER TABLE turnos ADD COLUMN IF NOT EXISTS horaExtra BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Atualizar tabela de recursos
ALTER TABLE recursos ADD COLUMN IF NOT EXISTS tipoExecucao ENUM('Interno', 'Externo') NOT NULL DEFAULT 'Interno';
ALTER TABLE recursos ADD COLUMN IF NOT EXISTS tipoAcabamento VARCHAR(100);
ALTER TABLE recursos ADD COLUMN IF NOT EXISTS linhaProducao ENUM('Offset', 'Flexo', 'Terceiro') DEFAULT 'Offset';
ALTER TABLE recursos ADD COLUMN IF NOT EXISTS linhaProduto VARCHAR(100);
ALTER TABLE recursos ADD COLUMN IF NOT EXISTS grupoTrabalho VARCHAR(100);
ALTER TABLE recursos DROP COLUMN IF EXISTS linhaId;

-- 3. Criar tabela de fluxos
CREATE TABLE IF NOT EXISTS fluxos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(100) NOT NULL UNIQUE,
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 4. Criar tabela de relacionamento fluxo-recursos
CREATE TABLE IF NOT EXISTS fluxo_recursos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fluxoId INT NOT NULL,
  recursoId INT NOT NULL,
  ordem INT DEFAULT 0,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (fluxoId) REFERENCES fluxos(id) ON DELETE CASCADE,
  FOREIGN KEY (recursoId) REFERENCES recursos(id) ON DELETE CASCADE
);

-- 5. Limpar dados antigos de turnos para inserir novos
DELETE FROM turnos;

-- 6. Inserir turnos conforme tabela de referência
INSERT INTO turnos (turnoHora, horasTrabalho, horasRefeicao, diasTrabalhados, horaExtra, ativo) VALUES
('s/ turno', '00:00', '00:00', 'segunda - sexta', FALSE, TRUE),
('Comercial', '00:00', '01:00', 'segunda - sexta', TRUE, TRUE),
('1/8', '08:00', '01:00', 'segunda - sábado', TRUE, TRUE),
('2/8', '08:00', '01:00', 'segunda - sábado', TRUE, TRUE),
('3/8', '08:00', '01:00', 'segunda - sábado', FALSE, TRUE),
('1/10', '10:00', '01:00', 'segunda - sábado', TRUE, TRUE),
('2/10', '10:00', '01:00', 'segunda - sábado', FALSE, TRUE),
('12/36', '12:00', '01:00', 'Domingo - Domingo', FALSE, TRUE);
