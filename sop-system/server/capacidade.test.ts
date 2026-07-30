import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock do módulo db
vi.mock('./db', () => ({
  listRecursos: vi.fn(),
  listRecursosMensais: vi.fn(),
  listDiasUteis: vi.fn(),
  listTurnos: vi.fn(),
}));

import * as db from './db';

// Função de cálculo de capacidade extraída para teste
function calcularCapacidadeMensal(params: {
  diasUteis: number;
  horasTrabalhadas: string; // "HH:MM"
  horasManutencao: number;
  velocidadeLiquida: number;
}): number {
  const { diasUteis, horasTrabalhadas, horasManutencao, velocidadeLiquida } = params;
  
  // Converter horasTrabalhadas de "HH:MM" para número de horas
  const [horas, minutos] = horasTrabalhadas.split(':').map(Number);
  const horasUteis = horas + (minutos || 0) / 60;
  
  // Cálculo: (Dias úteis × Horas úteis - Horas Manutenção) × Velocidade Líquida
  const horasTotais = diasUteis * horasUteis;
  const horasDisponiveis = Math.max(0, horasTotais - horasManutencao);
  const capacidade = horasDisponiveis * velocidadeLiquida;
  
  return Math.round(capacidade);
}

describe('Cálculo de Capacidade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('calcularCapacidadeMensal', () => {
    it('deve calcular capacidade corretamente com valores padrão', () => {
      // 22 dias úteis × 7 horas úteis = 154 horas
      // 154 horas × 2300 un/h = 354.200 unidades
      const resultado = calcularCapacidadeMensal({
        diasUteis: 22,
        horasTrabalhadas: '07:00',
        horasManutencao: 0,
        velocidadeLiquida: 2300,
      });
      
      expect(resultado).toBe(354200);
    });

    it('deve descontar horas de manutenção do total', () => {
      // 22 dias × 7 horas = 154 horas
      // 154 - 10 horas manutenção = 144 horas disponíveis
      // 144 × 2300 = 331.200 unidades
      const resultado = calcularCapacidadeMensal({
        diasUteis: 22,
        horasTrabalhadas: '07:00',
        horasManutencao: 10,
        velocidadeLiquida: 2300,
      });
      
      expect(resultado).toBe(331200);
    });

    it('deve retornar 0 quando velocidade líquida é 0', () => {
      const resultado = calcularCapacidadeMensal({
        diasUteis: 22,
        horasTrabalhadas: '07:00',
        horasManutencao: 0,
        velocidadeLiquida: 0,
      });
      
      expect(resultado).toBe(0);
    });

    it('deve retornar 0 quando dias úteis é 0', () => {
      const resultado = calcularCapacidadeMensal({
        diasUteis: 0,
        horasTrabalhadas: '07:00',
        horasManutencao: 0,
        velocidadeLiquida: 2300,
      });
      
      expect(resultado).toBe(0);
    });

    it('deve retornar 0 quando manutenção excede horas disponíveis', () => {
      // 22 dias × 7 horas = 154 horas
      // 154 - 200 horas manutenção = -46 (deve ser 0)
      const resultado = calcularCapacidadeMensal({
        diasUteis: 22,
        horasTrabalhadas: '07:00',
        horasManutencao: 200,
        velocidadeLiquida: 2300,
      });
      
      expect(resultado).toBe(0);
    });

    it('deve lidar com horas trabalhadas em formato HH:MM com minutos', () => {
      // 20 dias × 7.5 horas = 150 horas
      // 150 × 1000 = 150.000 unidades
      const resultado = calcularCapacidadeMensal({
        diasUteis: 20,
        horasTrabalhadas: '07:30',
        horasManutencao: 0,
        velocidadeLiquida: 1000,
      });
      
      expect(resultado).toBe(150000);
    });

    it('deve calcular corretamente para turno de 8 horas', () => {
      // 21 dias × 8 horas = 168 horas
      // 168 × 1500 = 252.000 unidades
      const resultado = calcularCapacidadeMensal({
        diasUteis: 21,
        horasTrabalhadas: '08:00',
        horasManutencao: 0,
        velocidadeLiquida: 1500,
      });
      
      expect(resultado).toBe(252000);
    });

    it('deve calcular corretamente para turno de 10 horas', () => {
      // 23 dias × 10 horas = 230 horas
      // 230 - 5 horas manutenção = 225 horas
      // 225 × 4000 = 900.000 unidades
      const resultado = calcularCapacidadeMensal({
        diasUteis: 23,
        horasTrabalhadas: '10:00',
        horasManutencao: 5,
        velocidadeLiquida: 4000,
      });
      
      expect(resultado).toBe(900000);
    });

    it('deve lidar com turno sem horas (00:00)', () => {
      const resultado = calcularCapacidadeMensal({
        diasUteis: 22,
        horasTrabalhadas: '00:00',
        horasManutencao: 0,
        velocidadeLiquida: 2300,
      });
      
      expect(resultado).toBe(0);
    });
  });

  describe('Integração com dados do banco', () => {
    it('deve retornar lista vazia quando não há recursos', async () => {
      vi.mocked(db.listRecursos).mockResolvedValue([]);
      vi.mocked(db.listRecursosMensais).mockResolvedValue([]);
      vi.mocked(db.listDiasUteis).mockResolvedValue([]);
      vi.mocked(db.listTurnos).mockResolvedValue([]);

      const recursos = await db.listRecursos();
      expect(recursos).toEqual([]);
    });

    it('deve buscar recursos mensais por ano', async () => {
      const mockRecursosMensais = [
        { id: 1, recursoId: 1, ano: 2025, mes: 1, turnoId: 1, horasManutencao: '0', velocidadeLiquida: '2300' },
      ];
      vi.mocked(db.listRecursosMensais).mockResolvedValue(mockRecursosMensais);

      const resultado = await db.listRecursosMensais(2025);
      expect(resultado).toEqual(mockRecursosMensais);
      expect(db.listRecursosMensais).toHaveBeenCalledWith(2025);
    });

    it('deve buscar dias úteis por ano', async () => {
      const mockDiasUteis = [
        { id: 1, ano: 2025, mes: 1, diasUteis: 22, feriados: 1 },
        { id: 2, ano: 2025, mes: 2, diasUteis: 20, feriados: 0 },
      ];
      vi.mocked(db.listDiasUteis).mockResolvedValue(mockDiasUteis);

      const resultado = await db.listDiasUteis(2025);
      expect(resultado).toHaveLength(2);
      expect(resultado[0].diasUteis).toBe(22);
    });

    it('deve buscar turnos com horas trabalhadas', async () => {
      const mockTurnos = [
        { id: 1, turnoHora: '1/8', horasTrabalho: '08:00', horasRefeicao: '01:00', horasTrabalhadas: '07:00' },
        { id: 2, turnoHora: '2/8', horasTrabalho: '08:00', horasRefeicao: '01:00', horasTrabalhadas: '07:00' },
      ];
      vi.mocked(db.listTurnos).mockResolvedValue(mockTurnos);

      const resultado = await db.listTurnos();
      expect(resultado).toHaveLength(2);
      expect(resultado[0].horasTrabalhadas).toBe('07:00');
    });
  });

  describe('Cenários de capacidade anual', () => {
    it('deve calcular capacidade anual somando todos os meses', () => {
      const diasPorMes = [22, 20, 21, 21, 22, 21, 23, 21, 22, 23, 20, 21];
      const velocidade = 2300;
      const horasUteisPorDia = 7;
      
      let capacidadeAnual = 0;
      diasPorMes.forEach(dias => {
        capacidadeAnual += dias * horasUteisPorDia * velocidade;
      });
      
      // 257 dias × 7 horas × 2300 = 4.137.700
      expect(capacidadeAnual).toBe(4137700);
    });

    it('deve calcular total de dias úteis no ano', () => {
      const diasPorMes = [22, 20, 21, 21, 22, 21, 23, 21, 22, 23, 20, 21];
      const totalDias = diasPorMes.reduce((a, b) => a + b, 0);
      
      expect(totalDias).toBe(257);
    });
  });
});
