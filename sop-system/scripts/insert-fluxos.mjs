import mysql from 'mysql2/promise';

// Conexão com o banco
const connection = await mysql.createConnection(process.env.DATABASE_URL);

// Primeiro, buscar os IDs dos recursos
const [recursos] = await connection.execute('SELECT id, nome FROM recursos ORDER BY nome');
console.log('Recursos encontrados:', recursos.length);

// Criar mapa de nome para ID
const recursoMap = {};
recursos.forEach(r => {
  recursoMap[r.nome] = r.id;
});

console.log('Mapa de recursos:', recursoMap);

// Lista de fluxos a criar
const fluxos = [
  'Fluxo 01', 'Fluxo 02', 'Fluxo 03', 'Fluxo 04', 'Fluxo 05', 'Fluxo 06', 'Fluxo 07', 'Fluxo 08', 'Fluxo 09', 'Fluxo 10',
  'Fluxo 11', 'Fluxo 12', 'Fluxo 13', 'Fluxo 14', 'Fluxo 15', 'Fluxo 16', 'Fluxo 17', 'Fluxo 18', 'Fluxo 19', 'Fluxo 20',
  'Fluxo 21', 'Fluxo 22', 'Fluxo 23', 'Fluxo 24', 'Fluxo 25', 'Fluxo 26', 'Fluxo 27', 'Fluxo 28', 'Fluxo 30', 'Fluxo 31',
  'Fluxo 32', 'Fluxo 33', 'Fluxo 34', 'Fluxo 35', 'Fluxo 36', 'Fluxo 37', 'Fluxo 38', 'Fluxo 40', 'Fluxo 42', 'Fluxo 43',
  'Fluxo 44', 'Fluxo 45', 'Fluxo 46', 'Fluxo 47', 'Fluxo 48', 'Fluxo 49', 'Fluxo 50', 'Fluxo 51', 'Fluxo 52', 'Fluxo 53',
  'Fluxo 54', 'Fluxo 55', 'Fluxo 56', 'Fluxo 57', 'Fluxo 58', 'Fluxo 59', 'Fluxo 60', 'Fluxo 61', 'Fluxo 62', 'Fluxo 63',
  'Fluxo 64', 'Fluxo 1000'
];

// Inserir fluxos
for (const fluxo of fluxos) {
  try {
    await connection.execute(
      'INSERT INTO fluxos (nome, ativo, createdAt, updatedAt) VALUES (?, 1, NOW(), NOW())',
      [fluxo]
    );
    console.log(`Fluxo ${fluxo} inserido`);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      console.log(`Fluxo ${fluxo} já existe`);
    } else {
      console.error(`Erro ao inserir ${fluxo}:`, e.message);
    }
  }
}

// Buscar IDs dos fluxos
const [fluxosDb] = await connection.execute('SELECT id, nome FROM fluxos ORDER BY nome');
const fluxoMap = {};
fluxosDb.forEach(f => {
  fluxoMap[f.nome] = f.id;
});

console.log('Fluxos inseridos:', Object.keys(fluxoMap).length);

// Matriz de associação fluxo -> recursos (baseado na imagem)
// Colunas: Desbobinadeira, Imp CD, Laminadora, Gofragem, Hot Stamping LK, Hot Stamping DYW, CV SBL, CV Pro, Coladeira, Guilhotina Polar, Guilhotina Guarani, Newport 01, Newport 02, Amber, FB 01, FB 02, FB 03, FB 04, FB 05, A330, Newlong, J10, J13, NP45, Guardanapo 01, Guardanapo 02, Resmadeira, Terceirizado
const fluxoRecursos = {
  'Fluxo 01': ['Desbobinadeira', 'Imp CD', 'Guilhotina Polar', 'Guilhotina Guarani', 'Newport 01', 'Newport 02'],
  'Fluxo 02': ['Desbobinadeira', 'Guilhotina Polar', 'Guilhotina Guarani', 'Newport 01', 'Newport 02', 'Amber'],
  'Fluxo 03': ['Desbobinadeira', 'Imp CD', 'Gofragem', 'Guilhotina Polar', 'Guilhotina Guarani', 'Newport 01', 'Newport 02'],
  'Fluxo 04': ['Desbobinadeira', 'CV SBL', 'CV Pro', 'Guilhotina Polar', 'Guilhotina Guarani', 'Newport 01', 'Newport 02', 'Amber'],
  'Fluxo 05': ['Desbobinadeira', 'Imp CD', 'CV SBL', 'CV Pro', 'Guilhotina Polar', 'Guilhotina Guarani', 'Newport 01', 'Newport 02'],
  'Fluxo 06': ['Desbobinadeira', 'Imp CD', 'Gofragem', 'Hot Stamping LK', 'Hot Stamping DYW', 'Guilhotina Polar', 'Guilhotina Guarani', 'Newport 01', 'Newport 02'],
  'Fluxo 07': ['Desbobinadeira', 'Imp CD', 'Hot Stamping LK', 'Hot Stamping DYW', 'CV SBL', 'CV Pro', 'Guilhotina Polar', 'Guilhotina Guarani', 'Newport 01', 'Newport 02'],
  'Fluxo 08': ['Desbobinadeira', 'Imp CD', 'Hot Stamping LK', 'Hot Stamping DYW', 'Guilhotina Polar', 'Guilhotina Guarani', 'Newport 01', 'Newport 02'],
  'Fluxo 09': ['Newport 01', 'Newport 02'],
  'Fluxo 10': ['Desbobinadeira', 'Imp CD', 'Guilhotina Polar', 'Guilhotina Guarani', 'Newport 01'],
  'Fluxo 1000': ['Terceirizado'],
  'Fluxo 11': ['Desbobinadeira', 'Imp CD', 'Hot Stamping LK', 'Hot Stamping DYW', 'CV SBL', 'CV Pro', 'Guilhotina Polar', 'Guilhotina Guarani', 'Newport 01'],
  'Fluxo 12': ['Desbobinadeira', 'Imp CD', 'Gofragem', 'Guilhotina Polar', 'Guilhotina Guarani', 'Newport 01'],
  'Fluxo 13': ['Desbobinadeira', 'Imp CD', 'Laminadora', 'Guilhotina Polar', 'Guilhotina Guarani', 'Newport 01'],
  'Fluxo 14': ['Desbobinadeira', 'Imp CD', 'Laminadora', 'Gofragem', 'Hot Stamping LK', 'Hot Stamping DYW', 'Guilhotina Polar', 'Guilhotina Guarani', 'Newport 01'],
  'Fluxo 15': ['Desbobinadeira', 'Imp CD', 'Laminadora', 'Gofragem', 'Guilhotina Polar', 'Guilhotina Guarani', 'Newport 01'],
  'Fluxo 16': ['Desbobinadeira', 'Imp CD', 'Laminadora', 'Hot Stamping LK', 'Hot Stamping DYW', 'Guilhotina Polar', 'Guilhotina Guarani', 'Newport 01'],
  'Fluxo 17': ['Desbobinadeira', 'Imp CD', 'Gofragem', 'Hot Stamping LK', 'Hot Stamping DYW', 'Guilhotina Polar', 'Guilhotina Guarani', 'Newport 01'],
  'Fluxo 18': ['Desbobinadeira', 'Imp CD', 'Guilhotina Polar', 'Guilhotina Guarani'],
  'Fluxo 19': ['Guilhotina Polar', 'Guilhotina Guarani'],
  'Fluxo 20': ['Desbobinadeira', 'Guilhotina Polar', 'Guilhotina Guarani', 'Amber'],
  'Fluxo 21': ['Desbobinadeira', 'Imp CD', 'Laminadora', 'Guilhotina Polar', 'Guilhotina Guarani'],
  'Fluxo 22': ['Desbobinadeira', 'Imp CD', 'Gofragem', 'Guilhotina Polar', 'Guilhotina Guarani'],
  'Fluxo 23': ['Desbobinadeira', 'Imp CD', 'Hot Stamping LK', 'Hot Stamping DYW', 'Guilhotina Polar', 'Guilhotina Guarani', 'Newport 01'],
  'Fluxo 24': ['Desbobinadeira', 'Imp CD', 'Laminadora', 'Gofragem', 'Hot Stamping LK', 'Hot Stamping DYW', 'Guilhotina Polar', 'Guilhotina Guarani', 'Newport 01'],
  'Fluxo 25': ['Desbobinadeira', 'Imp CD', 'Laminadora', 'Hot Stamping LK', 'Hot Stamping DYW', 'Guilhotina Polar', 'Guilhotina Guarani', 'Newport 01'],
  'Fluxo 26': ['Desbobinadeira', 'Imp CD'],
  'Fluxo 27': ['Coladeira', 'Guilhotina Polar', 'Guilhotina Guarani'],
  'Fluxo 28': ['Imp CD', 'Coladeira', 'Guilhotina Polar', 'Guilhotina Guarani'],
  'Fluxo 30': ['FB 01', 'FB 02'],
  'Fluxo 31': ['FB 01', 'FB 03'],
  'Fluxo 32': ['FB 01', 'FB 04'],
  'Fluxo 33': ['FB 01', 'FB 05'],
  'Fluxo 34': ['FB 01', 'A330'],
  'Fluxo 35': ['FB 01', 'Newlong'],
  'Fluxo 36': ['FB 01', 'J10'],
  'Fluxo 37': ['FB 01', 'J13'],
  'Fluxo 38': ['NP45', 'Resmadeira'],
  'Fluxo 40': ['FB 01', 'Terceirizado'],
  'Fluxo 42': ['J13'],
  'Fluxo 43': ['FB 01', 'Newlong'],
  'Fluxo 44': ['FB 01'],
  'Fluxo 45': ['Desbobinadeira', 'Hot Stamping LK', 'Hot Stamping DYW', 'CV SBL', 'CV Pro', 'Guilhotina Polar', 'Guilhotina Guarani'],
  'Fluxo 46': ['Desbobinadeira', 'Imp CD', 'Laminadora', 'Gofragem', 'Guilhotina Polar', 'Guilhotina Guarani'],
  'Fluxo 47': ['Amber'],
  'Fluxo 48': ['Guardanapo 01'],
  'Fluxo 49': ['Guardanapo 01'],
  'Fluxo 50': ['Guardanapo 01'],
  'Fluxo 51': ['Terceirizado'],
  'Fluxo 52': ['FB 01', 'Guardanapo 01', 'Guardanapo 02'],
  'Fluxo 53': ['Desbobinadeira', 'CV SBL', 'CV Pro'],
  'Fluxo 54': ['Desbobinadeira', 'FB 01', 'Guardanapo 01'],
  'Fluxo 55': ['Desbobinadeira'],
  'Fluxo 56': ['Desbobinadeira', 'Gofragem', 'Hot Stamping LK', 'Hot Stamping DYW', 'CV SBL', 'Guilhotina Polar', 'Guilhotina Guarani'],
  'Fluxo 57': ['Desbobinadeira', 'Imp CD', 'Gofragem', 'Hot Stamping LK', 'Hot Stamping DYW', 'Guilhotina Polar', 'Guilhotina Guarani', 'Newport 01'],
  'Fluxo 58': ['Desbobinadeira', 'Guilhotina Polar', 'Guilhotina Guarani', 'Newport 01'],
  'Fluxo 59': ['Desbobinadeira', 'Gofragem', 'Hot Stamping LK', 'Hot Stamping DYW', 'Guilhotina Polar', 'Guilhotina Guarani', 'Newport 01'],
  'Fluxo 60': ['Desbobinadeira', 'Imp CD', 'Guilhotina Polar', 'Guilhotina Guarani', 'Resmadeira'],
  'Fluxo 61': ['Desbobinadeira', 'Imp CD', 'Hot Stamping LK', 'Hot Stamping DYW', 'Resmadeira'],
  'Fluxo 62': ['Amber'],
  'Fluxo 63': ['J13'],
  'Fluxo 64': ['FB 01'],
};

// Inserir associações fluxo-recurso
for (const [fluxoNome, recursosNomes] of Object.entries(fluxoRecursos)) {
  const fluxoId = fluxoMap[fluxoNome];
  if (!fluxoId) {
    console.log(`Fluxo ${fluxoNome} não encontrado`);
    continue;
  }
  
  let ordem = 1;
  for (const recursoNome of recursosNomes) {
    const recursoId = recursoMap[recursoNome];
    if (!recursoId) {
      console.log(`Recurso ${recursoNome} não encontrado para ${fluxoNome}`);
      continue;
    }
    
    try {
      await connection.execute(
        'INSERT INTO fluxo_recursos (fluxoId, recursoId, ordem, createdAt) VALUES (?, ?, ?, NOW())',
        [fluxoId, recursoId, ordem]
      );
      ordem++;
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') {
        console.log(`Associação ${fluxoNome} -> ${recursoNome} já existe`);
      } else {
        console.error(`Erro ao associar ${fluxoNome} -> ${recursoNome}:`, e.message);
      }
    }
  }
  console.log(`${fluxoNome}: ${ordem - 1} recursos associados`);
}

console.log('Concluído!');
await connection.end();
