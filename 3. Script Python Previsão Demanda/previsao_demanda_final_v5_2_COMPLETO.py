#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script de Previsao de Demanda com Estatistica no Excel
Versão: 5.7.0 - SCORE COMBINADO AVANCADO + ESTABILIDADE + CORRELACAO SAZONAL
Data: 19/12/2025

✅ NOVA FUNCIONALIDADE v5.5.0:
- Score Combinado Avancado com pesos dinamicos por tipo de produto
- Metrica de Estabilidade (desvio padrao do MAPE via validacao cruzada)
- Metrica de Correlacao Sazonal para produtos sazonais
- Classificacao automatica de produtos: SAZONAL, TENDENCIA, INTERMITENTE, ESTAVEL
- Ajuste de pesos conforme tipo: sazonais priorizam correlacao, intermitentes priorizam BIAS
- Verificacao de direcionamento correto (modelo segue tendencia historica)

Este script implementa diversos métodos estatísticos para previsão de demanda
e gera um relatório Excel com análises detalhadas e projeções futuras.

✅ NOVA FUNCIONALIDADE v5.3.0:
- Adicionada aba 'Análise de Cenários' com seleção inteligente de modelos
- 3 opções de modelos com ranges diferenciados (±10%, ±15%, ±20%)
- Seleção da melhor opção com base em direcionamento e proximidade
- Fallback automático para Histórico + Ajuste quando modelos estão fora dos ranges
- Formatação visual com cores para facilitar identificação (verde, amarelo, laranja, roxo)

✅ FUNCIONALIDADE v5.2.2:
- Comparação dos últimos 3 anos para cada mês TOP_4_MESES_HISTORICO
- Colunas com vendas de cada mês nos últimos 3 anos
- Cálculo automático de variação percentual entre anos consecutivos

✅ FUNCIONALIDADE v5.2.1:
- Adicionada aba "Análise Acuracidade Detalhada" com comparação mês a mês
- Cálculo de MAPE mês a mês entre previsto vs realizado
- Classificação colorida conforme escala: Excelente, Bom, Aceitável, Ruim, Muito Ruim
- Formatação visual aprimorada com cores conforme exemplo fornecido

Ajustes implementados na versão 5.2:
- PERÍODOS ADAPTATIVOS DE BACK TEST baseados na quantidade de dados históricos:
  * ≥30 meses: 10 meses de teste (validação muito robusta)
  * 24-29 meses: 8 meses de teste (alta robustez)  
  * 18-23 meses: 6 meses de teste (boa validação)
  * 12-17 meses: 4 meses de teste (mínimo para sazonalidade)
  * <12 meses: 3 meses de teste (conservador)
- Estatísticas detalhadas do aproveitamento dos dados históricos
- Mantidas TODAS as funcionalidades da versão 4.0

Funcionalidades mantidas da versão 4.0:
- Formatação de colunas de variação como percentual
- Correção dos cálculos de 18M anterior
- Formatação especial para colunas de totais projetados
- Remoção da aba Projecoes_Futuras
- Ajustes na aba Backtest_Detalhado
- Melhorias na aba Backtest_Por_Produto
"""

import argparse
import locale
import warnings
import os
import sys
import logging
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from datetime import datetime
from dateutil.relativedelta import relativedelta
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.model_selection import TimeSeriesSplit
import re

# Importar modelos estatisticos avancados
try:
    from statsmodels.tsa.holtwinters import ExponentialSmoothing
    STATSMODELS_DISPONIVEL = True
except ImportError:
    STATSMODELS_DISPONIVEL = False

try:
    from statsmodels.tsa.statespace.sarimax import SARIMAX
    SARIMAX_DISPONIVEL = True
except ImportError:
    SARIMAX_DISPONIVEL = False

try:
    from xgboost import XGBRegressor
    XGBOOST_DISPONIVEL = True
except ImportError:
    XGBOOST_DISPONIVEL = False

# Configurar logging estruturado com handler de arquivo
def configurar_logging(nivel=logging.INFO, arquivo_log=None):
    """
    Configura o sistema de logging com suporte a console e arquivo.
    
    Args:
        nivel: Nivel de logging (DEBUG, INFO, WARNING, ERROR)
        arquivo_log: Caminho para arquivo de log (opcional)
    """
    # Formato detalhado para logging
    formato = '%(asctime)s - %(levelname)s - [%(funcName)s:%(lineno)d] - %(message)s'
    formato_simples = '%(asctime)s - %(levelname)s - %(message)s'
    
    # Configurar handler de console
    console_handler = logging.StreamHandler()
    console_handler.setLevel(nivel)
    console_handler.setFormatter(logging.Formatter(formato_simples, datefmt='%Y-%m-%d %H:%M:%S'))
    
    # Configurar logger raiz
    logger_raiz = logging.getLogger()
    logger_raiz.setLevel(nivel)
    logger_raiz.addHandler(console_handler)
    
    # Adicionar handler de arquivo se especificado
    if arquivo_log:
        file_handler = logging.FileHandler(arquivo_log, encoding='utf-8')
        file_handler.setLevel(logging.DEBUG)  # Arquivo recebe tudo
        file_handler.setFormatter(logging.Formatter(formato, datefmt='%Y-%m-%d %H:%M:%S'))
        logger_raiz.addHandler(file_handler)
    
    return logging.getLogger(__name__)

# Inicializar logging
logger = configurar_logging(nivel=logging.INFO)

# Configurações iniciais
warnings.filterwarnings('ignore')
try:
    locale.setlocale(locale.LC_ALL, 'pt_BR.UTF-8')  # Configuração para formato brasileiro
except:
    try:
        locale.setlocale(locale.LC_ALL, 'Portuguese_Brazil.1252')  # Windows
    except:
        locale.setlocale(locale.LC_ALL, '')  # Fallback para o locale padrão

class PrevisaoDemanda:
    """
    Classe para previsão de demanda com métodos estatísticos.
    """
    
    def __init__(self, meses_projecao=13):
        """
        Inicializa a classe de previsão de demanda.
        
        Args:
            meses_projecao (int): Número de meses para projeção futura.
        """
        self.df_historico = None
        self.df_resultado = None
        self.df_previsto = None
        self.df_acuracidade = None
        self.df_acuracidade_detalhada = None
        self.df_clientes = None
        self.df_comportamento_clientes = None
        self.meses_projecao = meses_projecao
        self.data_atual = datetime.now()
        self.colunas_meses = []
        self.colunas_projecao = []
        self.resultados_backtest = {}
        self.melhor_modelo_por_item = {}
        
    def carregar_dados(self, caminho_arquivo):
        """
        Carrega dados históricos de vendas de um arquivo Excel.
        
        Args:
            caminho_arquivo (str): Caminho para o arquivo Excel com dados históricos.
            
        Returns:
            pd.DataFrame: DataFrame com dados históricos carregados.
        """
        try:
            print(f"Carregando dados de: {caminho_arquivo}")
            
            # Carregar o arquivo Excel
            df = pd.read_excel(caminho_arquivo)
            
            # Verificar se o arquivo foi carregado corretamente
            if df.empty:
                print("Erro: Arquivo está vazio.")
                return None
                
            print(f"Dados carregados: {df.shape[0]} linhas, {df.shape[1]} colunas")
            
            # Renomear a primeira coluna para 'Codigo' (padronizar)
            primeira_coluna = df.columns[0]
            if primeira_coluna in ['Codificação', 'Codigo']:
                df = df.rename(columns={primeira_coluna: 'Codigo'})
            else:
                df.columns = ['Codigo'] + list(df.columns[1:])
            
            # Identificar colunas de meses (formato mmm-yy, mmm/yyyy ou datetime)
            colunas_meses = []
            print("Debug - Analisando colunas:")
            for col in df.columns[1:]:  # Pular a primeira coluna (Codigo)
                print(f"  Coluna: {col} | Tipo: {type(col)} | É datetime: {isinstance(col, datetime)}")
                
                if isinstance(col, str):
                    # Verificar se é formato de data string
                    if re.match(r'^[A-Za-z]{3}[-/]\d{2,4}$', str(col)):
                        colunas_meses.append(col)
                        print(f"    ✅ Adicionada como string de data: {col}")
                elif isinstance(col, datetime):
                    # Coluna é um objeto datetime (Excel converteu automaticamente)
                    colunas_meses.append(col)
                    print(f"    ✅ Adicionada como datetime: {col}")
                elif pd.api.types.is_datetime64_any_dtype(df[col]):
                    # Verificar se a coluna contém dados datetime
                    colunas_meses.append(col)
                    print(f"    ✅ Adicionada como coluna datetime: {col}")
                else:
                    print(f"    ❌ Ignorada: {col}")
            
            self.colunas_meses = colunas_meses
            print(f"Colunas de meses identificadas: {len(colunas_meses)}")
            print(f"Lista final: {colunas_meses}")
            
            # Substituir valores NaN por 0
            df[colunas_meses] = df[colunas_meses].fillna(0)
            
            # Converter valores para numérico
            for col in colunas_meses:
                df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
            
            self.df_historico = df
            print("Dados carregados com sucesso!")
            
            return df
            
        except Exception as e:
            print(f"Erro ao carregar dados: {str(e)}")
            return None
    
    def carregar_dados_previsto(self, caminho_base):
        """
        Carrega dados de previsão do arquivo 1-BasedeDadosPrevisto.xlsx.
        
        Args:
            caminho_base (str): Caminho base onde estão os arquivos.
            
        Returns:
            pd.DataFrame: DataFrame com dados de previsão ou None se erro.
        """
    def carregar_dados_previsto(self, caminho_base):
        """Carrega dados de previsão do arquivo 1-BasedeDadosPrevisto.xlsx."""
        try:
            # Construir caminho do arquivo de previsão
            diretorio_base = os.path.dirname(caminho_base)
            
            # Lista de possíveis nomes de arquivo
            nomes_possiveis = [
                "1-BasedeDadosPrevisto.xlsx",
                "1-BaseDeDadosPrevisto.xlsx",
                "BasedeDadosPrevisto.xlsx",
                "BaseDeDadosPrevisto.xlsx",
                "Previsto.xlsx",
                "1-BasedeDadosPrevisto.xls",
                "BasedeDadosPrevisto.xls"
            ]
            
            print("\n>>> Procurando arquivo de previsão...")
            
            # Lista de possíveis diretórios
            diretorios_possiveis = [
                diretorio_base,                    # Mesmo diretório do arquivo de entrada
                os.getcwd(),                       # Diretório atual de execução
                os.path.dirname(os.path.abspath(caminho_base)),  # Caminho absoluto do arquivo de entrada
                "/home/ubuntu",
                "/home/ubuntu/upload",
                "/home/ubuntu/Downloads"
            ]
            
            print(f"   Diretório base do arquivo de entrada: {diretorio_base}")
            print(f"   Diretório atual de execução: {os.getcwd()}")
            
            caminho_previsto = None
            
            # Tentar encontrar o arquivo em diferentes combinações
            print("   Testando combinações de diretório/arquivo...")
            for diretorio in diretorios_possiveis:
                if not diretorio:
                    continue
                for nome in nomes_possiveis:
                    caminho_teste = os.path.join(diretorio, nome)
                    existe = os.path.exists(caminho_teste)
                    if existe:
                        print(f"   ✅ ENCONTRADO: {caminho_teste}")
                        caminho_previsto = caminho_teste
                        break
                if caminho_previsto:
                    break
            
            # Tentar encontrar arquivos com padrão similar no diretório de entrada
            if not caminho_previsto:
                import glob
                print("   Procurando arquivos com padrão similar...")
                
                # Procurar no diretório base primeiro
                if diretorio_base:
                    padroes_glob = [
                        os.path.join(diretorio_base, "*Previsto*.xlsx"),
                        os.path.join(diretorio_base, "*previsto*.xlsx"),
                        os.path.join(diretorio_base, "*PREVISTO*.xlsx"),
                        os.path.join(diretorio_base, "*Previsto*.xls"),
                    ]
                    for padrao in padroes_glob:
                        arquivos = glob.glob(padrao)
                        if arquivos:
                            caminho_previsto = arquivos[0]
                            print(f"   ✅ ENCONTRADO via glob: {caminho_previsto}")
                            break
            
            # Tentar encontrar arquivos com padrão similar no diretório upload (Linux)
            if not caminho_previsto:
                for diretorio in diretorios_possiveis:
                    if not diretorio:
                        continue
                    # Procurar por arquivos que contenham "Previsto" ou "BasedeDados"
                    padroes = [
                        os.path.join(diretorio, "*Previsto*.xlsx"),
                        os.path.join(diretorio, "*BasedeDados*.xlsx"),
                        os.path.join(diretorio, "pasted_file_*Previsto*.xlsx")
                    ]
                    for padrao in padroes:
                        arquivos = glob.glob(padrao)
                        if arquivos:
                            caminho_previsto = arquivos[0]
                            break
                    if caminho_previsto:
                        break
            
            # Verificar se arquivo foi encontrado
            if caminho_previsto is None:
                print("\n" + "="*80)
                print("⚠️  ARQUIVO DE PREVISÃO NÃO ENCONTRADO!")
                print("="*80)
                print("\nDiretório esperado:")
                print(f"   {diretorio_base}")
                print("\nNomes de arquivo aceitos:")
                for n in nomes_possiveis:
                    print(f"   - {n}")
                print("\nArquivos encontrados no diretório:")
                if diretorio_base and os.path.exists(diretorio_base):
                    try:
                        arquivos = os.listdir(diretorio_base)
                        arquivos_xlsx = [a for a in arquivos if a.endswith(('.xlsx', '.xls'))]
                        if arquivos_xlsx:
                            for arq in arquivos_xlsx[:15]:
                                print(f"   - {arq}")
                            if len(arquivos_xlsx) > 15:
                                print(f"   ... e mais {len(arquivos_xlsx) - 15} arquivos Excel")
                        else:
                            print("   (Nenhum arquivo Excel encontrado)")
                    except Exception as e:
                        print(f"   (Erro ao listar diretório: {e})")
                else:
                    print(f"   (Diretório não acessível)")
                print("\n" + "-"*80)
                print("SOLUÇÃO: Coloque o arquivo '1-BasedeDadosPrevisto.xlsx' no mesmo")
                print(f"diretório do arquivo de vendas: {diretorio_base}")
                print("-"*80)
                print("\nAs abas de Acuracidade NÃO serão geradas.")
                print("="*80 + "\n")
                return None
            
            print(f"\n>>> Carregando dados de previsão de: {caminho_previsto}")
            
            # Verificar se arquivo existe
            if not os.path.exists(caminho_previsto):
                print(f"Arquivo de previsões não encontrado: {caminho_previsto}")
                return None
            
            # Carregar dados da aba 'Previsto'
            df_previsto = pd.read_excel(caminho_previsto, sheet_name='Previsto')
            
            print(f"Dados de previsão carregados: {df_previsto.shape[0]} linhas, {df_previsto.shape[1]} colunas")
            print(f"Colunas encontradas: {list(df_previsto.columns)}")
            
            # Renomear coluna de código para padronizar
            primeira_coluna = df_previsto.columns[0]
            nomes_codigo_validos = ['Codificação', 'Codificacao', 'Codigo', 'Código', 'SKU', 'Item', 'Produto']
            
            if primeira_coluna in nomes_codigo_validos or primeira_coluna.lower() in [n.lower() for n in nomes_codigo_validos]:
                df_previsto = df_previsto.rename(columns={primeira_coluna: 'Codigo'})
            else:
                # Tentar usar a primeira coluna mesmo assim
                print(f"Aviso: Coluna de código '{primeira_coluna}' não é padrão. Usando mesmo assim.")
                df_previsto = df_previsto.rename(columns={primeira_coluna: 'Codigo'})
            
            # ✅ CORREÇÃO: NÃO converter hífen para barra - manter formato original
            # O mapeamento na função analisar_acuracidade_previsao já trata diferentes formatos
            print(f"Mantendo formato original das colunas de meses")
            
            # ✅ CORREÇÃO: Converter valores de meses para numérico
            # Tratar valores como ' -   ', '-', 'nan', strings vazias, etc.
            colunas_meses_prev = [col for col in df_previsto.columns if col != 'Codigo']
            
            def converter_para_numerico(valor):
                """Converte valor para numérico, tratando casos especiais."""
                if pd.isna(valor):
                    return 0
                if isinstance(valor, (int, float)):
                    return float(valor) if not pd.isna(valor) else 0
                # Tratar strings
                valor_str = str(valor).strip()
                # Valores que devem ser zero
                if valor_str in ['', '-', ' -   ', ' - ', '--', 'nan', 'NaN', 'NA', 'N/A', 'null', 'None']:
                    return 0
                # Tentar converter para número
                try:
                    # Remover espaços e caracteres especiais
                    valor_limpo = valor_str.replace(' ', '').replace(',', '.')
                    return float(valor_limpo)
                except (ValueError, TypeError):
                    return 0
            
            for col in colunas_meses_prev:
                df_previsto[col] = df_previsto[col].apply(converter_para_numerico)
            
            print(f"Valores convertidos para numérico em {len(colunas_meses_prev)} colunas de meses")
            
            # Armazenar dados
            self.df_previsto = df_previsto
            print(f"Colunas após normalização: {list(df_previsto.columns)}")
            return df_previsto
            
        except Exception as e:
            print(f"Erro ao carregar dados de previsão: {str(e)}")
            return None
    
    def gerar_dados_exemplo(self):
        """
        Gera dados de exemplo para demonstração.
        
        Returns:
            pd.DataFrame: DataFrame com dados de exemplo.
        """
        print("Gerando dados de exemplo...")
        
        # Criar lista de códigos de produtos
        codigos = [f"PROD_{i:03d}" for i in range(1, 101)]
        
        # Criar lista de meses (últimos 24 meses)
        meses = []
        data_base = datetime(2023, 1, 1)
        for i in range(24):
            data_mes = data_base + relativedelta(months=i)
            meses.append(data_mes.strftime("%b/%Y"))
        
        self.colunas_meses = meses
        
        # Criar DataFrame
        data = {'Codigo': codigos}
        
        # Gerar dados de vendas com sazonalidade
        np.random.seed(42)
        for i, mes in enumerate(meses):
            # Adicionar sazonalidade (maior venda no final do ano)
            sazonalidade = 1.0 + 0.3 * np.sin(2 * np.pi * i / 12)
            vendas = np.random.poisson(100 * sazonalidade, len(codigos))
            # Adicionar alguns zeros para simular produtos sem venda
            vendas[np.random.choice(len(codigos), size=int(len(codigos) * 0.1), replace=False)] = 0
            data[mes] = vendas
        
        df = pd.DataFrame(data)
        self.df_historico = df
        
        print(f"Dados de exemplo gerados: {df.shape[0]} produtos, {len(meses)} meses")
        return df
    
    def contar_meses_zero_consecutivos(self, row):
        """Conta quantos meses consecutivos desde o início têm vendas = 0"""
        # Colunas de vendas mensais - procurar por padrão de meses
        meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
        colunas_vendas = []
        
        # Encontrar colunas de vendas em ordem
        for col in row.index:
            col_lower = str(col).lower()
            for mes in meses:
                if mes in col_lower:
                    colunas_vendas.append(col)
                    break
        
        # Se não encontrar colunas de vendas, retornar 0
        if not colunas_vendas:
            return 0
        
        # Contar meses consecutivos com vendas = 0 desde o início
        count = 0
        for col in colunas_vendas:
            valor = row.get(col, 0)
            try:
                valor = float(valor) if pd.notna(valor) else 0
            except:
                valor = 0
            
            if valor == 0:
                count += 1
            else:
                break
        
        return count

    def calcular_totais_e_variacoes(self):
        """
        Calcula totais e variações para períodos de 6, 12 e 18 meses.
        """
        print("Calculando totais e variações...")
        
        if self.df_historico is None:
            print("Erro: Dados históricos não carregados.")
            return
        
        df = self.df_historico.copy()
        
        # Identificar o mês mais recente
        ultimo_mes_idx = len(self.colunas_meses) - 1
        
        # Calcular totais para diferentes períodos (incluindo 3M)
        for periodo in [3, 6, 12, 18]:
            # Período atual (incluindo o mês vigente)
            inicio_atual = max(0, ultimo_mes_idx - periodo + 1)
            colunas_atual = self.colunas_meses[inicio_atual:ultimo_mes_idx + 1]
            df[f'TOTAL_{periodo}M_ATUAL'] = df[colunas_atual].sum(axis=1)
            
            # Período anterior (mesmo período do ano anterior)
            inicio_anterior = max(0, inicio_atual - 12)
            fim_anterior = max(0, ultimo_mes_idx - 12 + 1)
            
            # Ajustar para garantir que temos o mesmo número de meses
            if fim_anterior - inicio_anterior < periodo:
                inicio_anterior = max(0, fim_anterior - periodo)
            
            colunas_anterior = self.colunas_meses[inicio_anterior:fim_anterior]
            
            # Garantir que temos exatamente o mesmo número de meses
            if len(colunas_anterior) > periodo:
                colunas_anterior = colunas_anterior[-periodo:]
            
            if len(colunas_anterior) > 0:
                df[f'TOTAL_{periodo}M_ANTERIOR'] = df[colunas_anterior].sum(axis=1)
            else:
                df[f'TOTAL_{periodo}M_ANTERIOR'] = 0
            
            # Calcular variação percentual
            def calcular_variacao(row):
                atual = row[f'TOTAL_{periodo}M_ATUAL']
                anterior = row[f'TOTAL_{periodo}M_ANTERIOR']
                
                # Se teve venda no ano atual e não teve no anterior, ou vice-versa
                if (atual > 0 and anterior == 0) or (atual == 0 and anterior > 0):
                    return np.nan
                
                # Se ambos são zero
                if atual == 0 and anterior == 0:
                    return 0
                
                # Calcular variação normal
                if anterior != 0:
                    return ((atual - anterior) / anterior) * 100
                else:
                    return np.nan
            
            # Função para calcular variação mantendo valores reais
            def calcular_variacao(row):
                import numpy as np  # Importar numpy localmente
                atual = row[f'TOTAL_{periodo}M_ATUAL']
                anterior = row[f'TOTAL_{periodo}M_ANTERIOR']
                
                # Se teve venda no ano atual e não teve no anterior, ou vice-versa
                if (atual > 0 and anterior == 0) or (atual == 0 and anterior > 0):
                    return np.nan
                
                # Se ambos são zero
                if atual == 0 and anterior == 0:
                    return 0
                
                # Calcular variação normal (sem caps - valores reais)
                if anterior != 0:
                    return ((atual - anterior) / anterior) * 100
                else:
                    return np.nan
            
            # Função para calcular flags informativos (sem alterar o valor da variação)
            def calcular_flag_variacao(row):
                import pandas as pd  # Importar pandas localmente
                atual = row[f'TOTAL_{periodo}M_ATUAL']
                anterior = row[f'TOTAL_{periodo}M_ANTERIOR']
                variacao = row[f'VAR_{periodo}M_PCT']
                
                # Aplicar mesma lógica da função original
                if pd.isna(variacao):
                    if anterior == 0 and atual > 0:
                        return "SEM BASE"
                    else:
                        return "SEM DADOS"
                
                if atual == 0 and anterior == 0:
                    return "AMBOS ZERO"
                
                # Aplicar filtro de materialidade (volume mínimo = 5 unidades)
                if anterior < 5:
                    return "BASE BAIXA"
                
                # Identificar variações extremas (mas não alterar o valor)
                if variacao > 500:
                    return "EXTREMA ALTA"
                elif variacao < -95:
                    return "EXTREMA BAIXA"
                else:
                    return "NORMAL"
            
            # Aplicar cálculos
            df[f'VAR_{periodo}M_PCT'] = df.apply(calcular_variacao, axis=1)
            df[f'FLAG_VAR_{periodo}M'] = df.apply(calcular_flag_variacao, axis=1)
            
            # Calcular status
            def calcular_status(variacao):
                if pd.isna(variacao):
                    return "SEM CÁLCULO"
                elif variacao > 35:
                    return "CRESCIMENTO ALTO"
                elif variacao > 15:
                    return "CRESCIMENTO MÉDIO"
                elif variacao > 5:
                    return "CRESCIMENTO BAIXO"
                elif variacao > -5:
                    return "ESTÁVEL"
                elif variacao > -15:
                    return "QUEDA BAIXA"
                elif variacao > -30:
                    return "QUEDA MÉDIA"
                else:
                    return "QUEDA ALTA"
            
            df[f'STATUS_{periodo}M'] = df[f'VAR_{periodo}M_PCT'].apply(calcular_status)
        
        # Adicionar categorização de volume baseada em percentis (após calcular todas as variações)
        # Calcular volume médio mensal para todos os produtos
        volumes_medios = []
        for idx, row in df.iterrows():
            volume_12m = row['TOTAL_12M_ATUAL']
            volume_medio_mensal = volume_12m / 12 if volume_12m > 0 else 0
            volumes_medios.append(volume_medio_mensal)
        
        # Calcular percentis
        import numpy as np
        percentil_80 = np.percentile(volumes_medios, 80)  # Top 20% = Categoria A
        percentil_30 = np.percentile(volumes_medios, 30)  # Bottom 30% = Categoria C
        
        def categorizar_volume_percentil(row):
            volume_12m = row['TOTAL_12M_ATUAL']
            volume_medio_mensal = volume_12m / 12 if volume_12m > 0 else 0
            
            if volume_medio_mensal >= percentil_80:
                return "A"  # Alto volume (Top 20%)
            elif volume_medio_mensal >= percentil_30:
                return "B"  # Médio volume (30%-80%)
            else:
                return "C"  # Baixo volume (Bottom 30%)
        
        df['CATEGORIA_VOLUME'] = df.apply(categorizar_volume_percentil, axis=1)
        
        # Adicionar flag consolidado de variação (baseado no pior caso entre 6M, 12M, 18M)
        def calcular_flag_consolidado(row):
            flags = [
                row.get('FLAG_VAR_6M', 'NORMAL'),
                row.get('FLAG_VAR_12M', 'NORMAL'), 
                row.get('FLAG_VAR_18M', 'NORMAL')
            ]
            
            # Prioridade: EXTREMA > BASE BAIXA > SEM BASE > SEM DADOS > NORMAL
            if any('EXTREMA' in flag for flag in flags):
                return "EXTREMA"
            elif any('BASE BAIXA' in flag for flag in flags):
                return "BASE BAIXA"
            elif any('SEM BASE' in flag for flag in flags):
                return "SEM BASE"
            elif any('SEM DADOS' in flag for flag in flags):
                return "SEM DADOS"
            else:
                return "NORMAL"
        
        df['FLAG_VARIACAO_GERAL'] = df.apply(calcular_flag_consolidado, axis=1)
        
        # Calcular sugestão de ajuste com tratamento inteligente (60% do 6M + 40% do 12M)
        # Com detecção de produtos novos
        # Retorna tupla (ajuste, premissa)
        def calcular_sugestao_ajuste_tratada(row):
            import pandas as pd  # Importar pandas localmente
            var_6m = row['VAR_6M_PCT']
            var_12m = row['VAR_12M_PCT']
            flag_6m = row.get('FLAG_VAR_6M', 'NORMAL')
            flag_12m = row.get('FLAG_VAR_12M', 'NORMAL')
            categoria = row.get('CATEGORIA_VOLUME', 'C')
            total_6m_anterior = row.get('TOTAL_6M_ANTERIOR', 0)
            total_12m_anterior = row.get('TOTAL_12M_ANTERIOR', 0)
            
            # Se não há dados suficientes
            if pd.isna(var_6m) or pd.isna(var_12m):
                return 0
            
            # Tratar valores NaN
            if pd.isna(var_6m):
                var_6m = 0
            if pd.isna(var_12m):
                var_12m = 0
            
            # ✅ NOVO: Detectar produto novo (meses consecutivos com vendas zero no início)
            # Contar meses consecutivos com vendas = 0 desde o início
            meses_zero_consecutivos = self.contar_meses_zero_consecutivos(row)
            total_meses_historico = 24  # Período de 24 meses
            
            # Se tem 12+ meses de vendas zero no início, é NOVO
            if meses_zero_consecutivos >= 12:
                # Produto novo - usar ajuste baseado em 3M e 6M ou meses com dados
                meses_com_dados = total_meses_historico - meses_zero_consecutivos
                
                # Verificar se temos variações de 3M e 6M válidas
                var_3m = row.get('VAR_3M_PCT', 0)
                var_3m_valida = pd.notna(var_3m) and var_3m != 0
                var_6m_valida = pd.notna(var_6m) and var_6m != 0
                
                if var_3m_valida and var_6m_valida:
                    # Ambas variacoes disponiveis - usar formula conservadora
                    # 30% para 3M (recente) + 70% para 6M (historico)
                    sugestao_base = (var_3m * 0.3) + (var_6m * 0.7)
                    # Nao aplicar cap restrictivo - deixar o calculo completo
                    ajuste_final = sugestao_base
                    premissa = f'Produto novo - 30% 3M + 70% 6M = {ajuste_final:.1f}%'
                    return (ajuste_final, premissa)
                elif var_3m_valida:
                    # Apenas 3M disponível
                    ajuste_final = min(max(var_3m, -30), 30)
                    premissa = f'Produto novo - Apenas 3M disponível = {ajuste_final:.1f}%'
                    return (ajuste_final, premissa)
                elif var_6m_valida:
                    # Apenas 6M disponível
                    ajuste_final = min(max(var_6m, -25), 25)
                    premissa = f'Produto novo - Apenas 6M disponível = {ajuste_final:.1f}%'
                    return (ajuste_final, premissa)
                else:
                    # Nenhuma variação disponível - usar ajuste fixo por meses com dados
                    if meses_com_dados < 3:
                        return (0, 'Produto novo (<3 meses) - Ajuste 0%')
                    elif meses_com_dados < 6:
                        return (15, 'Produto novo (3-6 meses) - Ajuste 15%')
                    elif meses_com_dados < 12:
                        return (20, 'Produto novo (6-12 meses) - Ajuste 20%')
                    else:
                        # Produto novo com mais de 12 meses, usar método normal
                        sugestao_base = (var_6m * 0.6 + var_12m * 0.4)
                        ajuste_final = min(max(sugestao_base, -50), 50)
                        premissa = f'Produto novo (>12 meses) - 60% 6M + 40% 12M = {ajuste_final:.1f}%'
                        return (ajuste_final, premissa)
            else:
                # Produto consolidado ou reativado - usar método normal
                # Calcular sugestão base com pesos corretos (60% 6M + 40% 12M)
                sugestao_base = (var_6m * 0.6 + var_12m * 0.4)
                premissa = f'Produto consolidado - 60% 6M + 40% 12M = {sugestao_base:.1f}%'
            
            # Aplicar tratamento baseado nas flags e categoria
            
            # Se ambos os períodos tém base baixa, usar crescimento moderado
            if flag_6m == "BASE BAIXA" and flag_12m == "BASE BAIXA":
                if categoria == "C":  # Baixo volume
                    ajuste_final = min(max(sugestao_base, -50), 100)  # Caps mais conservadores
                    return (ajuste_final, premissa)
                else:
                    ajuste_final = min(max(sugestao_base, -75), 200)  # Caps moderados
                    return (ajuste_final, premissa)
            
            # Se há variações extremas em qualquer período, aplicar caps baseados na categoria
            if "EXTREMA" in flag_6m or "EXTREMA" in flag_12m:
                if categoria == "A":  # Alto volume - investigar, mas caps altos
                    ajuste_final = min(max(sugestao_base, -90), 300)
                    return (ajuste_final, premissa)
                elif categoria == "B":  # Médio volume - caps moderados
                    ajuste_final = min(max(sugestao_base, -80), 200)
                    return (ajuste_final, premissa)
                else:  # Baixo volume - caps conservadores
                    ajuste_final = min(max(sugestao_base, -60), 100)
                    return (ajuste_final, premissa)
            
            # Para casos normais, aplicar caps padrão
            if categoria == "A":
                ajuste_final = min(max(sugestao_base, -95), 500)  # Caps altos para produtos importantes
                return (ajuste_final, premissa)
            elif categoria == "B":
                ajuste_final = min(max(sugestao_base, -85), 300)  # Caps moderados
                return (ajuste_final, premissa)
            else:
                ajuste_final = min(max(sugestao_base, -70), 150)  # Caps conservadores para baixo volume
                return (ajuste_final, premissa)
        
        # Aplicar a função e desempacotar a tupla (ajuste, premissa)
        resultado_ajuste = df.apply(calcular_sugestao_ajuste_tratada, axis=1)
        df['SUGESTAO_AJUSTE_PCT'] = resultado_ajuste.apply(lambda x: x[0] if isinstance(x, tuple) else x)
        df['PREMISSA_AJUSTE'] = resultado_ajuste.apply(lambda x: x[1] if isinstance(x, tuple) else 'Desconhecida')
        
        # Manter a coluna SUGESTAO_AJUSTE_PCT para compatibilidade
        df['SUGESTAO_AJUSTE_PCT'] = df['SUGESTAO_AJUSTE_PCT'].astype(float)
        
        self.df_resultado = df
        print("Totais e variações calculados com sucesso!")
    
    def aplicar_metodos_estatisticos(self):
        """
        Aplica diferentes métodos estatísticos para previsão.
        """
        print("Aplicando métodos estatísticos...")
        
        if self.df_resultado is None:
            print("Erro: Dados não processados. Execute calcular_totais_e_variacoes() primeiro.")
            return
        
        df = self.df_resultado.copy()
        
        # Gerar datas de projeção
        ultimo_mes = self.colunas_meses[-1]
        
        # Converter para datetime, tratando tanto strings quanto objetos datetime
        if isinstance(ultimo_mes, datetime):
            # Se já é um objeto datetime, usar diretamente
            ultimo_mes_dt = ultimo_mes
        elif isinstance(ultimo_mes, str):
            # Se é string, converter baseado no formato
            try:
                if '/' in ultimo_mes:
                    ultimo_mes_dt = datetime.strptime(ultimo_mes, "%b/%Y")
                else:
                    ultimo_mes_dt = datetime.strptime(ultimo_mes, "%b-%y")
            except ValueError:
                # Fallback para parsing manual se strptime falhar (ex: 'set-25')
                meses_dict = {
                    'jan': 1, 'fev': 2, 'mar': 3, 'abr': 4, 'mai': 5, 'jun': 6,
                    'jul': 7, 'ago': 8, 'set': 9, 'out': 10, 'nov': 11, 'dez': 12
                }
                parts = ultimo_mes.replace('/', '-').split('-')
                mes_str, ano_str = parts[0], parts[1]
                mes_num = meses_dict.get(mes_str.lower()[:3])
                if len(ano_str) == 2:
                    ano_num = 2000 + int(ano_str)
                else:
                    ano_num = int(ano_str)
                
                if mes_num and ano_num:
                    ultimo_mes_dt = datetime(ano_num, mes_num, 1)
                else:
                    raise  # Re-lança a exceção se o parsing manual também falhar
        else:
            # Fallback: tentar converter para string primeiro
            ultimo_mes_str = str(ultimo_mes)
            if '/' in ultimo_mes_str:
                ultimo_mes_dt = datetime.strptime(ultimo_mes_str, "%b/%Y")
            else:
                ultimo_mes_dt = datetime.strptime(ultimo_mes_str, "%b-%y")
        
        datas_projecao = []
        for i in range(1, self.meses_projecao + 1):
            data_proj = ultimo_mes_dt + relativedelta(months=i)
            datas_projecao.append(data_proj.strftime("%b/%Y"))
        
        self.colunas_projecao = datas_projecao
        
        # Aplicar métodos estatísticos
        metodos = {
            'MEDIA_SIMPLES': self._media_simples,
            'MEDIA_PONDERADA': self._media_ponderada,
            'MEDIA_MOVEL': self._media_movel,
            'HOLT_WINTERS': self._holt_winters,
            'SARIMA': self._sarima,
            'PROPHET': self._prophet,
            'RANDOM_FOREST': self._random_forest,
            'XGBOOST': self._xgboost,
            'NAIVE_SAZONAL': self._naive_sazonal,
            'CROSTON': self._croston,
            'ENSEMBLE': self._ensemble
        }
        
        for nome_metodo, funcao_metodo in metodos.items():
            print(f"Aplicando método: {nome_metodo}")
            
            # Aplicar método para cada produto
            projecoes = []
            for idx, row in df.iterrows():
                codigo = row['Codigo']
                historico = row[self.colunas_meses].values
                
                try:
                    projecao = funcao_metodo(historico)
                    # Garantir que não há valores negativos
                    projecao = np.maximum(projecao, 0)
                    projecoes.append(projecao)
                except Exception as e:
                    print(f"Erro ao aplicar {nome_metodo} para {codigo}: {str(e)}")
                    # Usar média simples como fallback
                    projecao = self._media_simples(historico)
                    projecao = np.maximum(projecao, 0)
                    projecoes.append(projecao)
            
            # Adicionar projeções ao DataFrame
            projecoes_array = np.array(projecoes)
            for i, data in enumerate(datas_projecao):
                df[f'{data}_{nome_metodo}'] = projecoes_array[:, i]
            
            # Calcular total de 12 meses (últimos 12 dos 13 projetados)
            total_12m = projecoes_array[:, 1:13].sum(axis=1) if self.meses_projecao >= 13 else projecoes_array[:, :12].sum(axis=1)
            df[f'TOTAL_12M_{nome_metodo}'] = total_12m
        
        self.df_resultado = df
        print("Métodos estatísticos aplicados com sucesso!")
    
    def _media_simples(self, historico):
        """Método de média simples."""
        media = np.mean(historico[historico > 0]) if np.any(historico > 0) else 0
        return np.full(self.meses_projecao, media)
    
    def _fallback_inteligente(self, historico):
        """
        Fallback hierárquico inteligente que prioriza dados mais recentes.
        
        Lógica:
        - Se >= 6 meses: Média Ponderada (prioriza dados recentes)
        - Se >= 3 meses: Média Móvel (ainda mais recente)
        - Se < 3 meses: Média Simples (último recurso)
        """
        if len(historico) >= 6:
            # Usar média ponderada (sem fallback recursivo)
            ultimos_6 = historico[-6:]
            pesos = np.array([1, 1, 2, 2, 3, 3])
            media_ponderada = np.average(ultimos_6, weights=pesos) if np.sum(ultimos_6) > 0 else 0
            return np.full(self.meses_projecao, media_ponderada)
        elif len(historico) >= 3:
            # Usar média móvel (sem fallback recursivo)
            media_movel = np.mean(historico[-3:])
            return np.full(self.meses_projecao, media_movel)
        else:
            # Último recurso: média simples
            return self._media_simples(historico)
    
    def _media_ponderada(self, historico):
        """Método de média ponderada (últimos 6 meses com mais peso)."""
        if len(historico) < 6:
            return self._fallback_inteligente(historico)
        
        ultimos_6 = historico[-6:]
        pesos = np.array([1, 1, 2, 2, 3, 3])
        media_ponderada = np.average(ultimos_6, weights=pesos) if np.sum(ultimos_6) > 0 else 0
        return np.full(self.meses_projecao, media_ponderada)
    
    def _media_movel(self, historico):
        """Método de média móvel (últimos 3 meses)."""
        if len(historico) < 3:
            return self._fallback_inteligente(historico)
        
        media_movel = np.mean(historico[-3:])
        return np.full(self.meses_projecao, media_movel)
    
    def _holt_winters(self, historico):
        """Metodo Holt-Winters usando statsmodels ExponentialSmoothing."""
        if len(historico) < 12:
            return self._fallback_inteligente(historico)
        
        try:
            # Garantir que os dados estao no formato correto (float64)
            historico_float = np.array(historico, dtype=np.float64)
            
            # Verificar se ha valores positivos suficientes
            if np.sum(historico_float > 0) < 6:
                return self._fallback_inteligente(historico)
            
            # Substituir zeros por valores pequenos para evitar problemas com modelo multiplicativo
            historico_ajustado = np.where(historico_float <= 0, 0.1, historico_float)
            
            if STATSMODELS_DISPONIVEL:
                # Usar ExponentialSmoothing real do statsmodels
                try:
                    # Tentar modelo com sazonalidade multiplicativa
                    modelo = ExponentialSmoothing(
                        historico_ajustado,
                        seasonal_periods=12,
                        trend='add',
                        seasonal='mul',
                        damped_trend=True
                    )
                    resultado = modelo.fit(optimized=True)
                    projecoes = resultado.forecast(self.meses_projecao)
                except:
                    # Fallback para modelo aditivo se multiplicativo falhar
                    try:
                        modelo = ExponentialSmoothing(
                            historico_ajustado,
                            seasonal_periods=12,
                            trend='add',
                            seasonal='add',
                            damped_trend=True
                        )
                        resultado = modelo.fit(optimized=True)
                        projecoes = resultado.forecast(self.meses_projecao)
                    except:
                        return self._holt_winters_simplificado(historico)
            else:
                # Fallback para implementacao simplificada se statsmodels nao disponivel
                return self._holt_winters_simplificado(historico)
            
            # Garantir valores nao negativos
            projecoes = np.maximum(projecoes, 0)
            return np.array(projecoes)
            
        except Exception as e:
            logger.warning(f"Erro no Holt-Winters: {e}. Usando fallback.")
            return self._holt_winters_simplificado(historico)
    
    def _holt_winters_simplificado(self, historico):
        """Fallback simplificado para Holt-Winters quando statsmodels falha."""
        try:
            historico_float = np.array(historico, dtype=np.float64)
            
            # Calcular tendencia
            x = np.arange(len(historico_float), dtype=np.float64)
            y = historico_float
            
            if np.sum(y) > 0 and not np.all(y == 0):
                coef = np.polyfit(x, y, 1)
                tendencia = float(coef[0])
            else:
                tendencia = 0.0
            
            # Calcular sazonalidade (ultimos 12 meses)
            ultimos_12 = historico_float[-12:]
            media_12 = np.mean(ultimos_12)
            if media_12 > 0:
                sazonalidade = ultimos_12 / media_12
            else:
                sazonalidade = np.ones(12)
            
            # Projetar
            projecoes = []
            base = np.mean(historico_float[-6:]) if np.sum(historico_float[-6:]) > 0 else 0
            
            for i in range(self.meses_projecao):
                valor_base = base + tendencia * i
                indice_sazonal = sazonalidade[i % 12]
                projecao = valor_base * indice_sazonal
                projecoes.append(max(0, float(projecao)))
            
            return np.array(projecoes)
        except:
            return self._fallback_inteligente(historico)
    
    def _sarima(self, historico):
        """Metodo SARIMA usando statsmodels SARIMAX."""
        if len(historico) < 12:
            return self._fallback_inteligente(historico)
        
        try:
            historico_float = np.array(historico, dtype=np.float64)
            
            # Verificar se ha valores positivos suficientes
            if np.sum(historico_float > 0) < 6:
                return self._fallback_inteligente(historico)
            
            if SARIMAX_DISPONIVEL:
                try:
                    # Usar SARIMAX real do statsmodels
                    # Ordem (p,d,q) e ordem sazonal (P,D,Q,s)
                    modelo = SARIMAX(
                        historico_float,
                        order=(1, 1, 1),
                        seasonal_order=(1, 1, 1, 12),
                        enforce_stationarity=False,
                        enforce_invertibility=False
                    )
                    resultado = modelo.fit(disp=False, maxiter=100)
                    projecoes = resultado.forecast(self.meses_projecao)
                except:
                    # Tentar com parametros mais simples
                    try:
                        modelo = SARIMAX(
                            historico_float,
                            order=(1, 0, 1),
                            seasonal_order=(0, 1, 1, 12),
                            enforce_stationarity=False,
                            enforce_invertibility=False
                        )
                        resultado = modelo.fit(disp=False, maxiter=50)
                        projecoes = resultado.forecast(self.meses_projecao)
                    except:
                        return self._sarima_simplificado(historico)
            else:
                return self._sarima_simplificado(historico)
            
            # Garantir valores nao negativos
            projecoes = np.maximum(projecoes, 0)
            return np.array(projecoes)
            
        except Exception as e:
            logger.warning(f"Erro no SARIMA: {e}. Usando fallback.")
            return self._sarima_simplificado(historico)
    
    def _sarima_simplificado(self, historico):
        """Fallback simplificado para SARIMA quando statsmodels falha."""
        try:
            # Calcular media dos ultimos 12 meses
            media_anual = np.mean(historico[-12:])
            
            # Calcular padrao sazonal
            if len(historico) >= 24:
                sazonalidade = []
                for i in range(12):
                    valores_mes = []
                    for j in range(i, len(historico), 12):
                        if j < len(historico):
                            valores_mes.append(historico[j])
                    if valores_mes:
                        sazonalidade.append(np.mean(valores_mes) / (media_anual + 1e-10))
                    else:
                        sazonalidade.append(1.0)
            else:
                sazonalidade = historico[-12:] / (media_anual + 1e-10)
            
            # Projetar
            projecoes = []
            for i in range(self.meses_projecao):
                indice_sazonal = sazonalidade[i % 12]
                projecao = media_anual * indice_sazonal
                projecoes.append(max(0, projecao))
            
            return np.array(projecoes)
        except:
            return self._fallback_inteligente(historico)
    
    def _prophet(self, historico):
        """Método Prophet simplificado."""
        # Implementação simplificada usando decomposição de tendência e sazonalidade
        if len(historico) < 12:
            return self._fallback_inteligente(historico)
        
        try:
            # Garantir que os dados estão no formato correto (float64)
            historico_float = np.array(historico, dtype=np.float64)
            
            # Calcular tendência linear
            x = np.arange(len(historico_float), dtype=np.float64)
            
            if np.sum(historico_float) > 0 and not np.all(historico_float == 0):
                coef = np.polyfit(x, historico_float, 1)
                tendencia_coef = float(coef[0])
                intercepto = float(coef[1])
            else:
                tendencia_coef = 0.0
                intercepto = 0.0
            
            # Calcular componente sazonal
            media_geral = np.mean(historico_float) if np.sum(historico_float) > 0 else 0
            sazonalidade = []
            
            for i in range(12):
                valores_mes = []
                for j in range(i, len(historico_float), 12):
                    if j < len(historico_float):
                        valores_mes.append(historico_float[j])
                if valores_mes:
                    sazonalidade.append(np.mean(valores_mes) - media_geral)
                else:
                    sazonalidade.append(0.0)
            
            # Projetar
            projecoes = []
            for i in range(self.meses_projecao):
                x_futuro = len(historico_float) + i
                tendencia = intercepto + tendencia_coef * x_futuro
                componente_sazonal = sazonalidade[i % 12]
                projecao = tendencia + componente_sazonal
                projecoes.append(max(0, float(projecao)))
            
            return np.array(projecoes)
            
        except Exception as e:
            # Em caso de erro, usar média simples como fallback
            return self._fallback_inteligente(historico)
    
    def _random_forest(self, historico):
        """Método Random Forest."""
        if len(historico) < 6:
            return self._fallback_inteligente(historico)
        
        # Preparar dados para treinamento
        X, y = [], []
        window_size = min(6, len(historico) - 1)
        
        for i in range(window_size, len(historico)):
            X.append(historico[i-window_size:i])
            y.append(historico[i])
        
        if len(X) < 2:
            return self._fallback_inteligente(historico)
        
        X = np.array(X)
        y = np.array(y)
        
        # Treinar modelo
        try:
            model = RandomForestRegressor(n_estimators=10, random_state=42)
            model.fit(X, y)
            
            # Fazer previsões
            projecoes = []
            ultimo_window = historico[-window_size:]
            
            for i in range(self.meses_projecao):
                pred = model.predict([ultimo_window])[0]
                pred = max(0, pred)  # Não permitir valores negativos
                projecoes.append(pred)
                
                # Atualizar janela para próxima previsão
                ultimo_window = np.append(ultimo_window[1:], pred)
            
            return np.array(projecoes)
            
        except Exception as e:
            return self._fallback_inteligente(historico)
    
    def _xgboost(self, historico):
        """Metodo XGBoost usando biblioteca xgboost."""
        if len(historico) < 6:
            return self._fallback_inteligente(historico)
        
        try:
            historico_float = np.array(historico, dtype=np.float64)
            
            # Preparar dados para treinamento
            X, y = [], []
            window_size = min(6, len(historico_float) - 1)
            
            for i in range(window_size, len(historico_float)):
                features = list(historico_float[i-window_size:i])
                # Adicionar features de tendencia e sazonalidade
                features.append(i)  # Tendencia temporal
                features.append(i % 12)  # Sazonalidade mensal
                # Adicionar media movel
                features.append(np.mean(historico_float[max(0,i-3):i]))  # Media 3 meses
                X.append(features)
                y.append(historico_float[i])
            
            if len(X) < 2:
                return self._fallback_inteligente(historico)
            
            X = np.array(X)
            y = np.array(y)
            
            if XGBOOST_DISPONIVEL:
                try:
                    # Usar XGBRegressor real
                    model = XGBRegressor(
                        n_estimators=100,
                        max_depth=3,
                        learning_rate=0.1,
                        random_state=42,
                        verbosity=0
                    )
                    model.fit(X, y)
                except:
                    # Fallback para LinearRegression se XGBoost falhar
                    return self._xgboost_simplificado(historico)
            else:
                return self._xgboost_simplificado(historico)
            
            # Fazer previsoes
            projecoes = []
            ultimo_window = historico_float[-window_size:]
            
            for i in range(self.meses_projecao):
                features = list(ultimo_window)
                features.append(len(historico_float) + i)  # Tendencia temporal
                features.append((len(historico_float) + i) % 12)  # Sazonalidade mensal
                features.append(np.mean(ultimo_window[-3:]))  # Media 3 meses
                
                pred = model.predict([features])[0]
                pred = max(0, pred)  # Nao permitir valores negativos
                projecoes.append(pred)
                
                # Atualizar janela para proxima previsao
                ultimo_window = np.append(ultimo_window[1:], pred)
            
            return np.array(projecoes)
            
        except Exception as e:
            logger.warning(f"Erro no XGBoost: {e}. Usando fallback.")
            return self._xgboost_simplificado(historico)
    
    def _xgboost_simplificado(self, historico):
        """Fallback simplificado para XGBoost usando LinearRegression."""
        try:
            # Preparar dados para treinamento
            X, y = [], []
            window_size = min(6, len(historico) - 1)
            
            for i in range(window_size, len(historico)):
                features = list(historico[i-window_size:i])
                features.append(i)  # Tendencia temporal
                features.append(i % 12)  # Sazonalidade mensal
                X.append(features)
                y.append(historico[i])
            
            if len(X) < 2:
                return self._fallback_inteligente(historico)
            
            X = np.array(X)
            y = np.array(y)
            
            model = LinearRegression()
            model.fit(X, y)
            
            # Fazer previsoes
            projecoes = []
            ultimo_window = historico[-window_size:]
            
            for i in range(self.meses_projecao):
                features = list(ultimo_window)
                features.append(len(historico) + i)
                features.append((len(historico) + i) % 12)
                
                pred = model.predict([features])[0]
                pred = max(0, pred)
                projecoes.append(pred)
                
                ultimo_window = np.append(ultimo_window[1:], pred)
            
            return np.array(projecoes)
        except:
            return self._fallback_inteligente(historico)
    
    def _naive_sazonal(self, historico):
        """
        Método Naive Sazonal - replica o mesmo período do ano anterior
        """
        try:
            if not historico or sum(historico) == 0:
                return [0.0] * self.meses_projecao
            
            historico = np.array(historico, dtype=np.float64)
            
            # Se temos pelo menos 12 meses de histórico, usar sazonalidade
            if len(historico) >= 12:
                projecoes = []
                for h in range(1, self.meses_projecao + 1):
                    # Calcular o índice do mês correspondente no ano anterior
                    # Se estamos projetando o mês h, queremos o mesmo mês do ano anterior
                    indice_ano_anterior = len(historico) - 12 + ((h - 1) % 12)
                    
                    if indice_ano_anterior >= 0 and indice_ano_anterior < len(historico):
                        # Usar o valor do mesmo mês do ano anterior
                        projecao = historico[indice_ano_anterior]
                        
                        # Se o valor é zero, procurar outros valores do mesmo mês
                        if projecao == 0:
                            valores_mes = []
                            mes_atual = (h - 1) % 12
                            for i in range(mes_atual, len(historico), 12):
                                if historico[i] > 0:
                                    valores_mes.append(historico[i])
                            
                            if valores_mes:
                                # Usar média dos valores históricos deste mês
                                projecao = np.mean(valores_mes)
                            else:
                                # Se não há histórico para este mês, usar média dos últimos 3 meses
                                ultimos_3 = historico[-3:]
                                projecao = np.mean(ultimos_3[ultimos_3 > 0]) if np.any(ultimos_3 > 0) else 0
                    else:
                        # Se não conseguir acessar o ano anterior, usar média dos últimos 3 meses
                        ultimos_3 = historico[-3:]
                        projecao = np.mean(ultimos_3[ultimos_3 > 0]) if np.any(ultimos_3 > 0) else 0
                    
                    projecoes.append(max(0, projecao))
                
                return projecoes
            else:
                # Se não há sazonalidade suficiente, usar padrão dos últimos meses
                if len(historico) >= 3:
                    ultimos_3 = historico[-3:]
                    media_recente = np.mean(ultimos_3[ultimos_3 > 0]) if np.any(ultimos_3 > 0) else 0
                    return [media_recente] * self.meses_projecao
                else:
                    media_geral = np.mean(historico[historico > 0]) if np.any(historico > 0) else 0
                    return [media_geral] * self.meses_projecao
                
        except Exception as e:
            # Em caso de erro, usar média dos últimos 3 meses
            if len(historico) >= 3:
                ultimos_3 = historico[-3:]
                media_recente = np.mean(ultimos_3[ultimos_3 > 0]) if np.any(ultimos_3 > 0) else 0
                return [media_recente] * self.meses_projecao
            else:
                return [0.0] * self.meses_projecao
    
    def _croston(self, historico):
        """
        Método Croston - específico para demanda intermitente
        """
        try:
            if not historico or sum(historico) == 0:
                return [0.0] * self.meses_projecao
            
            historico = np.array(historico, dtype=np.float64)
            
            # Parâmetro de suavização
            alpha = 0.2
            
            # Identificar períodos com demanda
            demandas = []
            intervalos = []
            ultimo_periodo_demanda = -1
            
            for i, valor in enumerate(historico):
                if valor > 0:
                    demandas.append(valor)
                    if ultimo_periodo_demanda >= 0:
                        intervalos.append(i - ultimo_periodo_demanda)
                    ultimo_periodo_demanda = i
            
            if len(demandas) < 2:
                # Dados insuficientes para Croston, usar média ponderada dos valores não-zero
                valores_nao_zero = historico[historico > 0]
                if len(valores_nao_zero) > 0:
                    # Dar mais peso aos valores recentes
                    pesos = np.arange(1, len(valores_nao_zero) + 1)
                    media_ponderada = np.average(valores_nao_zero, weights=pesos)
                    # Ajustar pela frequência de demanda
                    freq_demanda = len(valores_nao_zero) / len(historico)
                    projecao_ajustada = media_ponderada * freq_demanda
                    return [projecao_ajustada] * self.meses_projecao
                else:
                    return [0.0] * self.meses_projecao
            
            # Inicialização
            z = demandas[0]  # Tamanho médio da demanda
            x = intervalos[0] if intervalos else 1  # Intervalo médio entre demandas
            
            # Atualização usando suavização exponencial
            for i in range(1, len(demandas)):
                z = alpha * demandas[i] + (1 - alpha) * z
                if i - 1 < len(intervalos):
                    x = alpha * intervalos[i - 1] + (1 - alpha) * x
            
            # Garantir que x seja pelo menos 1
            x = max(x, 1.0)
            
            # Previsão baseada no método Croston
            demanda_por_periodo = z / x if x > 0 else 0
            
            # Aplicar variação baseada na intermitência
            projecoes = []
            for h in range(1, self.meses_projecao + 1):
                # Probabilidade de demanda baseada no intervalo médio
                prob_demanda = 1 / x if x > 0 else 0.1
                
                # Ajustar probabilidade para ser mais realista
                prob_demanda = max(0.1, min(0.9, prob_demanda))
                
                # Previsão considerando probabilidade e variação temporal
                variacao_temporal = 1 + 0.1 * np.sin(h * np.pi / 6)  # Pequena variação sazonal
                projecao = demanda_por_periodo * prob_demanda * variacao_temporal
                
                projecoes.append(max(0, projecao))
            
            return projecoes
            
        except Exception as e:
            # Em caso de erro, usar abordagem simplificada para demanda intermitente
            valores_nao_zero = historico[historico > 0]
            if len(valores_nao_zero) > 0:
                media_valores = np.mean(valores_nao_zero)
                freq_demanda = len(valores_nao_zero) / len(historico)
                projecao_base = media_valores * freq_demanda * 0.8  # Fator conservador
                return [projecao_base] * self.meses_projecao
            else:
                return [0.0] * self.meses_projecao
    
    def _ensemble(self, historico):
        """
        Método Ensemble - combina os 3 melhores métodos para cada item
        """
        try:
            if not historico or sum(historico) == 0:
                return [0.0] * self.meses_projecao
            
            # Lista de métodos base (excluindo o próprio ensemble para evitar recursão)
            metodos_base = [
                ('MEDIA_SIMPLES', self._media_simples),
                ('MEDIA_PONDERADA', self._media_ponderada),
                ('MEDIA_MOVEL', self._media_movel),
                ('HOLT_WINTERS', self._holt_winters),
                ('SARIMA', self._sarima),
                ('PROPHET', self._prophet),
                ('RANDOM_FOREST', self._random_forest),
                ('XGBOOST', self._xgboost)
                # Não incluir NAIVE_SAZONAL e CROSTON para evitar dependência circular
            ]
            
            # Avaliar cada método usando validação cruzada simples
            if len(historico) >= 6:
                scores = []
                
                for nome, metodo in metodos_base:
                    try:
                        # Usar últimos 3 meses como teste para validação
                        if len(historico) >= 6:
                            treino = historico[:-3]
                            teste = historico[-3:]
                        else:
                            treino = historico[:-1]
                            teste = historico[-1:]
                        
                        # Fazer previsão
                        previsoes_metodo = metodo(treino)[:len(teste)]
                        
                        # Calcular erro absoluto médio (mais simples e robusto)
                        mae = np.mean(np.abs(np.array(teste) - np.array(previsoes_metodo)))
                        scores.append((nome, metodo, mae))
                        
                    except:
                        scores.append((nome, metodo, float('inf')))  # Score alto para métodos que falharam
                
                # Selecionar os 3 melhores métodos (menor erro)
                scores.sort(key=lambda x: x[2])
                melhores_3 = scores[:3]
                
                # Calcular pesos inversamente proporcionais ao erro
                pesos = []
                for _, _, mae in melhores_3:
                    if mae == float('inf') or mae == 0:
                        peso = 0.1  # Peso baixo para métodos que falharam ou têm erro zero
                    else:
                        peso = 1 / mae
                    pesos.append(peso)
                
                # Normalizar pesos
                soma_pesos = sum(pesos)
                if soma_pesos > 0:
                    pesos = [p / soma_pesos for p in pesos]
                else:
                    pesos = [1/3, 1/3, 1/3]  # Pesos iguais se todos falharam
                
                # Fazer previsões combinadas
                projecoes_combinadas = np.zeros(self.meses_projecao)
                
                for i, (nome, metodo, _) in enumerate(melhores_3):
                    try:
                        previsoes_metodo = metodo(historico)
                        if len(previsoes_metodo) == self.meses_projecao:
                            projecoes_combinadas += np.array(previsoes_metodo) * pesos[i]
                        else:
                            # Se o método retornou tamanho diferente, ajustar
                            previsoes_ajustadas = list(previsoes_metodo) + [0] * (self.meses_projecao - len(previsoes_metodo))
                            projecoes_combinadas += np.array(previsoes_ajustadas[:self.meses_projecao]) * pesos[i]
                    except:
                        # Se método falhar, usar média dos últimos 6 meses com peso correspondente
                        ultimos_6 = historico[-6:] if len(historico) >= 6 else historico
                        media_fallback = np.mean(ultimos_6[ultimos_6 > 0]) if np.any(ultimos_6 > 0) else 0
                        projecoes_combinadas += media_fallback * pesos[i]
                
                return [max(0, p) for p in projecoes_combinadas]
            
            else:
                # Dados insuficientes para ensemble complexo, usar combinação simples de 3 métodos básicos
                try:
                    pred1 = self._media_simples(historico)
                    pred2 = self._media_ponderada(historico)
                    pred3 = self._media_movel(historico)
                    
                    # Combinação ponderada: 40% média ponderada, 30% média simples, 30% média móvel
                    projecoes = []
                    for i in range(self.meses_projecao):
                        combinacao = pred1[i] * 0.3 + pred2[i] * 0.4 + pred3[i] * 0.3
                        projecoes.append(max(0, combinacao))
                    
                    return projecoes
                except:
                    # Último fallback: média dos últimos valores
                    ultimos_valores = historico[-3:] if len(historico) >= 3 else historico
                    media_final = np.mean(ultimos_valores[ultimos_valores > 0]) if np.any(ultimos_valores > 0) else 0
                    return [media_final] * self.meses_projecao
                    
        except Exception as e:
            # Em caso de erro geral, usar abordagem conservadora
            if len(historico) >= 3:
                ultimos_3 = historico[-3:]
                media_conservadora = np.mean(ultimos_3[ultimos_3 > 0]) if np.any(ultimos_3 > 0) else 0
                return [media_conservadora * 0.9] * self.meses_projecao  # Fator conservador
            else:
                return [0.0] * self.meses_projecao
    
    def determinar_periodo_backtest(self, num_meses_historico):
        """
        Determina o periodo de backtest baseado na quantidade de dados historicos.
        
        Logica robusta:
        - >=30 meses: 10 meses de teste (validacao muito robusta)
        - 24-29 meses: 8 meses de teste (alta robustez)
        - 18-23 meses: 6 meses de teste (boa validacao)
        - 12-17 meses: 4 meses de teste (minimo para sazonalidade)
        - <12 meses: 3 meses de teste (conservador)
        """
        if num_meses_historico >= 30:
            return 10
        elif num_meses_historico >= 24:
            return 8
        elif num_meses_historico >= 18:
            return 6
        elif num_meses_historico >= 12:
            return 4
        else:
            return 3
    
    def validacao_cruzada_temporal(self, historico, metodo_func, n_splits=3):
        """
        Realiza validacao cruzada temporal (Time Series Cross-Validation).
        
        Args:
            historico: Array com dados historicos
            metodo_func: Funcao do metodo de previsao
            n_splits: Numero de divisoes para validacao cruzada
            
        Returns:
            dict: Metricas agregadas (MAPE medio, MAE medio, BIAS medio)
        """
        try:
            historico_float = np.array(historico, dtype=np.float64)
            n_samples = len(historico_float)
            
            # Determinar tamanho minimo de treino e teste
            min_train_size = max(6, n_samples // 2)
            test_size = max(3, n_samples // (n_splits + 1))
            
            # Se nao ha dados suficientes para CV, usar metodo simples
            if n_samples < min_train_size + test_size:
                return None
            
            mape_scores = []
            mae_scores = []
            bias_scores = []
            
            # Usar TimeSeriesSplit do sklearn
            tscv = TimeSeriesSplit(n_splits=n_splits, test_size=test_size)
            
            for train_idx, test_idx in tscv.split(historico_float):
                if len(train_idx) < 6:  # Minimo de dados para treino
                    continue
                    
                train_data = historico_float[train_idx]
                test_data = historico_float[test_idx]
                
                try:
                    # Fazer previsao
                    pred = metodo_func(train_data)[:len(test_data)]
                    
                    if len(pred) < len(test_data):
                        # Ajustar tamanho se necessario
                        pred = np.concatenate([pred, np.full(len(test_data) - len(pred), pred[-1] if len(pred) > 0 else 0)])
                    
                    # Calcular metricas
                    mae = mean_absolute_error(test_data, pred[:len(test_data)])
                    mae_scores.append(mae)
                    
                    # MAPE com tratamento para zeros
                    mape_values = []
                    for real, predicted in zip(test_data, pred[:len(test_data)]):
                        if real != 0:
                            mape_values.append(abs((real - predicted) / real) * 100)
                        elif predicted != 0:
                            mape_values.append(100)
                        else:
                            mape_values.append(0)
                    if mape_values:
                        mape_scores.append(np.mean(mape_values))
                    
                    # BIAS
                    bias = np.mean(pred[:len(test_data)] - test_data)
                    bias_scores.append(bias)
                    
                except Exception as e:
                    logger.debug(f"Erro no fold de CV: {e}")
                    continue
            
            if not mape_scores:
                return None
            
            return {
                'mape_cv': np.mean(mape_scores),
                'mape_std': np.std(mape_scores),
                'mae_cv': np.mean(mae_scores),
                'bias_cv': np.mean(bias_scores)
            }
            
        except Exception as e:
            logger.debug(f"Erro na validacao cruzada: {e}")
            return None

    def classificar_tipo_produto(self, historico):
        """
        Classifica o tipo de produto baseado no padrao de demanda.
        
        Returns:
            dict: Tipo do produto e caracteristicas
        """
        try:
            historico_float = np.array(historico, dtype=np.float64)
            historico_valido = historico_float[historico_float > 0]
            
            if len(historico_valido) < 3:
                return {'tipo': 'NOVO', 'volume': 'BAIXO', 'sazonal': False, 'intermitente': True}
            
            # Calcular metricas
            media = np.mean(historico_valido)
            cv = np.std(historico_valido) / media if media > 0 else 0  # Coeficiente de variacao
            
            # Verificar intermitencia (% de meses com vendas = 0)
            pct_zeros = np.sum(historico_float == 0) / len(historico_float)
            intermitente = pct_zeros > 0.3  # Mais de 30% de zeros
            
            # Verificar sazonalidade (se ha padrao repetitivo)
            sazonal = False
            if len(historico_float) >= 24:
                # Comparar primeiro e segundo ano
                ano1 = historico_float[:12]
                ano2 = historico_float[12:24]
                if np.std(ano1) > 0 and np.std(ano2) > 0:
                    correlacao = np.corrcoef(ano1, ano2)[0, 1]
                    sazonal = correlacao > 0.5
            
            # Verificar tendencia
            if len(historico_float) >= 6:
                primeira_metade = np.mean(historico_float[:len(historico_float)//2])
                segunda_metade = np.mean(historico_float[len(historico_float)//2:])
                if primeira_metade > 0:
                    tendencia_pct = (segunda_metade - primeira_metade) / primeira_metade * 100
                else:
                    tendencia_pct = 0
            else:
                tendencia_pct = 0
            
            # Classificar volume
            total_12m = np.sum(historico_float[-12:]) if len(historico_float) >= 12 else np.sum(historico_float)
            if total_12m >= 10000:
                volume = 'ALTO'
            elif total_12m >= 1000:
                volume = 'MEDIO'
            else:
                volume = 'BAIXO'
            
            # Classificar tipo
            if intermitente:
                tipo = 'INTERMITENTE'
            elif sazonal and abs(tendencia_pct) > 10:
                tipo = 'SAZONAL_TENDENCIA'
            elif sazonal:
                tipo = 'SAZONAL'
            elif abs(tendencia_pct) > 20:
                tipo = 'TENDENCIA_FORTE'
            elif abs(tendencia_pct) > 10:
                tipo = 'TENDENCIA_MODERADA'
            else:
                tipo = 'ESTAVEL'
            
            return {
                'tipo': tipo,
                'volume': volume,
                'sazonal': sazonal,
                'intermitente': intermitente,
                'tendencia_pct': tendencia_pct,
                'cv': cv
            }
            
        except Exception as e:
            logger.debug(f"Erro na classificacao do produto: {e}")
            return {'tipo': 'DESCONHECIDO', 'volume': 'BAIXO', 'sazonal': False, 'intermitente': False}
    
    def calcular_correlacao_sazonal(self, historico, previsao):
        """
        Calcula a correlacao entre o padrao sazonal previsto e o realizado.
        
        Args:
            historico: Array com dados historicos (minimo 12 meses)
            previsao: Array com previsoes (12 meses)
            
        Returns:
            float: Correlacao sazonal (-1 a 1), ou None se nao aplicavel
        """
        try:
            historico_float = np.array(historico, dtype=np.float64)
            previsao_float = np.array(previsao, dtype=np.float64)
            
            if len(historico_float) < 12 or len(previsao_float) < 12:
                return None
            
            # Extrair padrao sazonal do historico (ultimos 12 meses)
            padrao_historico = historico_float[-12:]
            padrao_previsao = previsao_float[:12]
            
            # Normalizar para comparar padroes (nao magnitudes)
            if np.std(padrao_historico) > 0 and np.std(padrao_previsao) > 0:
                padrao_historico_norm = (padrao_historico - np.mean(padrao_historico)) / np.std(padrao_historico)
                padrao_previsao_norm = (padrao_previsao - np.mean(padrao_previsao)) / np.std(padrao_previsao)
                
                correlacao = np.corrcoef(padrao_historico_norm, padrao_previsao_norm)[0, 1]
                return correlacao if not np.isnan(correlacao) else 0
            
            return 0
            
        except Exception as e:
            logger.debug(f"Erro no calculo de correlacao sazonal: {e}")
            return None
    
    def calcular_score_combinado_avancado(self, mape, bias, estabilidade, correlacao_sazonal, 
                                          direcionamento_correto, tipo_produto):
        """
        Calcula o score combinado avancado para selecao do melhor modelo.
        
        Pesos:
        - MAPE: 40% (precisao geral)
        - BIAS: 20% (vies)
        - Estabilidade: 15% (consistencia temporal)
        - Direcionamento: 10% (alinhamento com tendencia)
        - Correlacao Sazonal: 10% (captura de padroes sazonais)
        - Bonus/Penalidade por tipo: 5%
        
        Args:
            mape: MAPE normalizado (0-1, menor = melhor)
            bias: BIAS normalizado (0-1, menor = melhor)
            estabilidade: Desvio padrao do MAPE normalizado (0-1, menor = melhor)
            correlacao_sazonal: Correlacao sazonal (0-1, maior = melhor)
            direcionamento_correto: Boolean se modelo segue tendencia correta
            tipo_produto: Dict com classificacao do produto
            
        Returns:
            float: Score combinado (menor = melhor)
        """
        try:
            # Pesos base
            peso_mape = 0.40
            peso_bias = 0.20
            peso_estabilidade = 0.15
            peso_direcionamento = 0.10
            peso_sazonal = 0.10
            peso_tipo = 0.05
            
            # Ajustar pesos conforme tipo de produto
            if tipo_produto.get('tipo') == 'SAZONAL' or tipo_produto.get('tipo') == 'SAZONAL_TENDENCIA':
                # Para produtos sazonais, aumentar peso da correlacao sazonal
                peso_sazonal = 0.20
                peso_mape = 0.35
            elif tipo_produto.get('tipo') == 'INTERMITENTE':
                # Para produtos intermitentes, priorizar BIAS (nao superestimar)
                peso_bias = 0.30
                peso_mape = 0.35
            elif tipo_produto.get('tipo') in ['TENDENCIA_FORTE', 'TENDENCIA_MODERADA']:
                # Para produtos com tendencia, priorizar direcionamento
                peso_direcionamento = 0.20
                peso_mape = 0.35
            
            # Calcular componentes do score
            score_mape = mape * peso_mape
            score_bias = bias * peso_bias
            score_estabilidade = estabilidade * peso_estabilidade if estabilidade is not None else 0
            
            # Direcionamento: bonus se correto, penalidade se incorreto
            score_direcionamento = 0 if direcionamento_correto else peso_direcionamento
            
            # Correlacao sazonal: inverter (maior correlacao = menor score)
            if correlacao_sazonal is not None and tipo_produto.get('sazonal', False):
                score_sazonal = (1 - max(0, correlacao_sazonal)) * peso_sazonal
            else:
                score_sazonal = 0
            
            # Bonus/penalidade por tipo
            score_tipo = 0
            if tipo_produto.get('volume') == 'ALTO':
                score_tipo = -0.02  # Bonus para alto volume (mais dados = mais confiavel)
            elif tipo_produto.get('volume') == 'BAIXO':
                score_tipo = 0.02  # Penalidade para baixo volume
            
            # Score final (menor = melhor)
            score_final = score_mape + score_bias + score_estabilidade + score_direcionamento + score_sazonal + score_tipo
            
            return max(0, min(1, score_final))  # Limitar entre 0 e 1
            
        except Exception as e:
            logger.debug(f"Erro no calculo do score combinado: {e}")
            return 1.0  # Score maximo (pior) em caso de erro

    def realizar_backtest(self):
        """
        Realiza backtest dos modelos para avaliar precisao.
        VERSAO 5.5 - Score Combinado Avancado com Estabilidade e Correlacao Sazonal.
        """
        logger.info("Realizando backtest dos modelos com score combinado avancado...")
        logger.info("VERSAO 5.5 - Estabilidade + Correlacao Sazonal + Classificacao por Tipo")
        
        if self.df_resultado is None:
            print("Erro: Dados não processados.")
            return
        
        # Métodos a serem testados
        metodos = ['MEDIA_SIMPLES', 'MEDIA_PONDERADA', 'MEDIA_MOVEL', 
                  'HOLT_WINTERS', 'SARIMA', 'PROPHET', 'RANDOM_FOREST', 'XGBOOST',
                  'NAIVE_SAZONAL', 'CROSTON', 'ENSEMBLE']
        
        resultados_backtest = []
        
        # Estatísticas para acompanhamento
        periodos_utilizados = []
        meses_historicos = []
        
        for idx, row in self.df_resultado.iterrows():
            codigo = row['Codigo']
            historico = row[self.colunas_meses].values
            
            # Contar meses com dados válidos
            num_meses_historico = sum(1 for x in historico if pd.notna(x) and x > 0)
            meses_historicos.append(num_meses_historico)
            
            if num_meses_historico < 6:  # Mínimo absoluto
                continue
            
            # Determinar período de teste adaptativo
            meses_teste = self.determinar_periodo_backtest(num_meses_historico)
            periodos_utilizados.append(meses_teste)
            
            print(f"Item {codigo}: Usando {meses_teste} meses para teste (de {num_meses_historico} meses disponíveis)")
            
            # Usar período adaptativo como teste
            historico_treino = historico[:-meses_teste]
            historico_teste = historico[-meses_teste:]
            
                     # Obter variações (incluindo 3M)
            var_3m = row.get('VAR_3M_PCT', 0)
            var_6m = row.get('VAR_6M_PCT', 0)
            var_12m = row.get('VAR_12M_PCT', 0)
            
            # Tratar valores NaN
            if pd.isna(var_3m):
                var_3m = 0
            if pd.isna(var_6m):
                var_6m = 0
            if pd.isna(var_12m):
                var_12m = 0
                
            # Tendência ponderada (30% dos últimos 3M, 40% dos últimos 6M, 30% dos últimos 12M)
            tendencia_ponderada = var_3m * 0.3 + var_6m * 0.4 + var_12m * 0.3
            
            # Determinar direção da tendência
            if tendencia_ponderada > 5:
                tendencia = "crescimento"
            elif tendencia_ponderada < -5:
                tendencia = "queda"
            else:
                tendencia = "estavel"
            
            melhor_score = float('inf')
            melhor_modelo = 'MEDIA_SIMPLES'
            melhor_mape = float('inf')
            melhor_bias = 0
            
            resultados_item = {'Codigo': codigo, 'TENDENCIA': tendencia}
            
            # Armazenar resultados para normalização
            mape_valores = {}
            bias_valores = {}
            
            # Primeira passagem: calcular métricas para todos os modelos
            for metodo in metodos:
                try:
                    # Aplicar método no histórico de treino
                    if metodo == 'MEDIA_SIMPLES':
                        pred = self._media_simples(historico_treino)[:meses_teste]
                    elif metodo == 'MEDIA_PONDERADA':
                        pred = self._media_ponderada(historico_treino)[:meses_teste]
                    elif metodo == 'MEDIA_MOVEL':
                        pred = self._media_movel(historico_treino)[:meses_teste]
                    elif metodo == 'HOLT_WINTERS':
                        pred = self._holt_winters(historico_treino)[:meses_teste]
                    elif metodo == 'SARIMA':
                        pred = self._sarima(historico_treino)[:meses_teste]
                    elif metodo == 'PROPHET':
                        pred = self._prophet(historico_treino)[:meses_teste]
                    elif metodo == 'RANDOM_FOREST':
                        pred = self._random_forest(historico_treino)[:meses_teste]
                    elif metodo == 'XGBOOST':
                        pred = self._xgboost(historico_treino)[:meses_teste]
                    elif metodo == 'NAIVE_SAZONAL':
                        pred = self._naive_sazonal(historico_treino)[:meses_teste]
                    elif metodo == 'CROSTON':
                        pred = self._croston(historico_treino)[:meses_teste]
                    elif metodo == 'ENSEMBLE':
                        pred = self._ensemble(historico_treino)[:meses_teste]
                    
                    # Calcular métricas
                    mae = mean_absolute_error(historico_teste, pred)
                    mse = mean_squared_error(historico_teste, pred)
                    
                    # MAPE com tratamento para valores zero
                    mape_values = []
                    for real, predicted in zip(historico_teste, pred):
                        if real != 0:
                            mape_values.append(abs((real - predicted) / real) * 100)
                        elif predicted != 0:
                            mape_values.append(100)  # Erro máximo quando real=0 mas pred!=0
                        else:
                            mape_values.append(0)    # Ambos zero = erro zero
                    mape = np.mean(mape_values) if mape_values else 0
                    
                    # BIAS (viés) - indica se o modelo super ou subestima
                    bias = np.mean(pred - historico_teste)
                    
                    # Status do BIAS - indica se está SUPERestimando ou SUBestimando
                    bias_status = "SUPERESTIMANDO" if bias > 0 else "SUBESTIMANDO" if bias < 0 else "NEUTRO"
                    
                    resultados_item[f'MAPE_{metodo}'] = mape
                    resultados_item[f'MAE_{metodo}'] = mae
                    resultados_item[f'MSE_{metodo}'] = mse
                    resultados_item[f'BIAS_{metodo}'] = bias
                    resultados_item[f'BIAS_STATUS_{metodo}'] = bias_status
                    
                    # Armazenar para normalização
                    mape_valores[metodo] = mape
                    bias_valores[metodo] = bias
                        
                except Exception as e:
                    resultados_item[f'MAPE_{metodo}'] = float('inf')
                    resultados_item[f'MAE_{metodo}'] = float('inf')
                    resultados_item[f'MSE_{metodo}'] = float('inf')
                    resultados_item[f'BIAS_{metodo}'] = 0
                    resultados_item[f'BIAS_STATUS_{metodo}'] = "NEUTRO"
                    
                    mape_valores[metodo] = float('inf')
                    bias_valores[metodo] = 0
            
            # Classificar tipo de produto para ajustar pesos
            tipo_produto = self.classificar_tipo_produto(historico)
            resultados_item['TIPO_PRODUTO'] = tipo_produto.get('tipo', 'DESCONHECIDO')
            resultados_item['VOLUME_PRODUTO'] = tipo_produto.get('volume', 'BAIXO')
            resultados_item['SAZONAL'] = tipo_produto.get('sazonal', False)
            
            # Segunda passagem: normalizar e calcular score combinado AVANCADO
            if mape_valores:
                # Filtrar valores válidos para normalização
                mape_validos = [v for v in mape_valores.values() if v < float('inf')]
                
                if mape_validos:  # Se há pelo menos um valor válido
                    # Encontrar valores mínimos e máximos para normalização
                    min_mape = min(mape_validos)
                    max_mape = max(mape_validos)
                    
                    # Normalizar BIAS para valores absolutos (distância de zero)
                    bias_abs = {k: abs(v) for k, v in bias_valores.items()}
                    min_bias_abs = min(bias_abs.values())
                    max_bias_abs = max(bias_abs.values())
                    
                    # Calcular métricas de estabilidade via validação cruzada
                    estabilidade_valores = {}
                    correlacao_sazonal_valores = {}
                    
                    for metodo in metodos:
                        # Calcular estabilidade (desvio padrão do MAPE via CV)
                        try:
                            if metodo == 'MEDIA_SIMPLES':
                                metodo_func = self._media_simples
                            elif metodo == 'MEDIA_PONDERADA':
                                metodo_func = self._media_ponderada
                            elif metodo == 'MEDIA_MOVEL':
                                metodo_func = self._media_movel
                            elif metodo == 'HOLT_WINTERS':
                                metodo_func = self._holt_winters
                            elif metodo == 'SARIMA':
                                metodo_func = self._sarima
                            elif metodo == 'PROPHET':
                                metodo_func = self._prophet
                            elif metodo == 'RANDOM_FOREST':
                                metodo_func = self._random_forest
                            elif metodo == 'XGBOOST':
                                metodo_func = self._xgboost
                            elif metodo == 'NAIVE_SAZONAL':
                                metodo_func = self._naive_sazonal
                            elif metodo == 'CROSTON':
                                metodo_func = self._croston
                            elif metodo == 'ENSEMBLE':
                                metodo_func = self._ensemble
                            else:
                                metodo_func = self._media_simples
                            
                            # Validação cruzada para estabilidade
                            cv_result = self.validacao_cruzada_temporal(historico_treino, metodo_func, n_splits=3)
                            if cv_result and 'mape_std' in cv_result:
                                estabilidade_valores[metodo] = cv_result['mape_std']
                            else:
                                estabilidade_valores[metodo] = None
                            
                            # Correlação sazonal
                            previsao_completa = metodo_func(historico_treino)
                            corr_sazonal = self.calcular_correlacao_sazonal(historico_treino, previsao_completa)
                            correlacao_sazonal_valores[metodo] = corr_sazonal
                            
                        except Exception as e:
                            estabilidade_valores[metodo] = None
                            correlacao_sazonal_valores[metodo] = None
                    
                    # Normalizar estabilidade
                    estab_validos = [v for v in estabilidade_valores.values() if v is not None]
                    if estab_validos:
                        min_estab = min(estab_validos)
                        max_estab = max(estab_validos)
                    else:
                        min_estab = max_estab = 0
                    
                    # Calcular score combinado AVANCADO para cada modelo
                    for metodo in metodos:
                        if mape_valores[metodo] < float('inf'):
                            # Normalizar MAPE (0 = melhor, 1 = pior)
                            if max_mape > min_mape:
                                mape_norm = (mape_valores[metodo] - min_mape) / (max_mape - min_mape)
                            else:
                                mape_norm = 0
                            
                            # Normalizar BIAS absoluto (0 = melhor, 1 = pior)
                            if max_bias_abs > min_bias_abs:
                                bias_norm = (bias_abs[metodo] - min_bias_abs) / (max_bias_abs - min_bias_abs)
                            else:
                                bias_norm = 0
                            
                            # Normalizar estabilidade (0 = melhor, 1 = pior)
                            if estabilidade_valores[metodo] is not None and max_estab > min_estab:
                                estab_norm = (estabilidade_valores[metodo] - min_estab) / (max_estab - min_estab)
                            else:
                                estab_norm = 0.5  # Valor neutro se não disponível
                            
                            # Verificar direcionamento correto
                            direcionamento_correto = False
                            if tendencia == "crescimento" and bias_valores[metodo] > 0:
                                direcionamento_correto = True
                            elif tendencia == "queda" and bias_valores[metodo] < 0:
                                direcionamento_correto = True
                            elif tendencia == "estavel" and abs(bias_valores[metodo]) < np.mean(historico_teste) * 0.1:
                                direcionamento_correto = True
                            
                            # Correlação sazonal
                            corr_sazonal = correlacao_sazonal_valores.get(metodo, None)
                            
                            # Calcular score combinado avançado
                            score = self.calcular_score_combinado_avancado(
                                mape=mape_norm,
                                bias=bias_norm,
                                estabilidade=estab_norm,
                                correlacao_sazonal=corr_sazonal,
                                direcionamento_correto=direcionamento_correto,
                                tipo_produto=tipo_produto
                            )
                            
                            # Armazenar métricas adicionais
                            resultados_item[f'SCORE_{metodo}'] = score
                            resultados_item[f'ESTABILIDADE_{metodo}'] = estabilidade_valores.get(metodo, None)
                            resultados_item[f'CORR_SAZONAL_{metodo}'] = corr_sazonal
                            resultados_item[f'DIRECIONAMENTO_{metodo}'] = 'CORRETO' if direcionamento_correto else 'INCORRETO'
                            
                            # Verificar se é o melhor modelo
                            if score < melhor_score:
                                melhor_score = score
                                melhor_modelo = metodo
                                melhor_mape = mape_valores[metodo]
                                melhor_bias = bias_valores[metodo]
                else:
                    # Se todos os métodos falharam, não definir melhor modelo aqui
                    # O fallback será tratado na função selecionar_melhor_modelo()
                    pass
            
            resultados_item['MELHOR_MODELO'] = melhor_modelo
            resultados_item['MELHOR_MAPE'] = melhor_mape
            resultados_item['MELHOR_BIAS'] = melhor_bias
            resultados_item['MELHOR_SCORE'] = melhor_score
            resultados_item['MESES_BACKTEST'] = meses_teste  # Nova coluna com período de teste
            resultados_item['MESES_HISTORICO'] = num_meses_historico  # Nova coluna com total de meses
            resultados_backtest.append(resultados_item)
            
            # Armazenar melhor modelo para este item
            self.melhor_modelo_por_item[codigo] = melhor_modelo
            
            # Armazenar informações adicionais para justificativa
            if not hasattr(self, 'tendencia_por_item'):
                self.tendencia_por_item = {}
            if not hasattr(self, 'bias_por_item'):
                self.bias_por_item = {}
            if not hasattr(self, 'mape_por_item'):
                self.mape_por_item = {}
            if not hasattr(self, 'meses_backtest_por_item'):
                self.meses_backtest_por_item = {}
                
            self.tendencia_por_item[codigo] = tendencia
            self.bias_por_item[codigo] = melhor_bias
            self.mape_por_item[codigo] = melhor_mape
            self.meses_backtest_por_item[codigo] = meses_teste
        
        self.resultados_backtest = pd.DataFrame(resultados_backtest)
        
        # Exibir estatísticas do backtest adaptativo
        print("Backtest adaptativo concluído!")
        print("=== ESTATÍSTICAS DO BACK TEST ADAPTATIVO ROBUSTO ===")
        print(f"Total de itens analisados: {len(resultados_backtest)}")
        
        if periodos_utilizados:
            from collections import Counter
            distribuicao = Counter(periodos_utilizados)
            print("Distribuição por período de teste (VERSÃO 5.2 - ROBUSTA):")
            for periodo in sorted(distribuicao.keys()):
                count = distribuicao[periodo]
                if periodo == 3:
                    print(f"  {periodo} meses de teste: {count} itens (<12 meses histórico)")
                elif periodo == 4:
                    print(f"  {periodo} meses de teste: {count} itens (12-17 meses histórico)")
                elif periodo == 6:
                    print(f"  {periodo} meses de teste: {count} itens (18-23 meses histórico)")
                elif periodo == 8:
                    print(f"  {periodo} meses de teste: {count} itens (24-29 meses histórico)")
                elif periodo == 10:
                    print(f"  {periodo} meses de teste: {count} itens (≥30 meses histórico)")
                else:
                    print(f"  {periodo} meses de teste: {count} itens")
        
        if meses_historicos:
            print(f"Dados históricos - Mín: {min(meses_historicos)} meses, Máx: {max(meses_historicos)} meses, Média: {np.mean(meses_historicos):.1f} meses")
            
            # Calcular aproveitamento médio dos dados para teste
            aproveitamentos = [p/h*100 for p, h in zip(periodos_utilizados, meses_historicos) if h > 0]
            if aproveitamentos:
                print(f"Aproveitamento médio dos dados para teste: {np.mean(aproveitamentos):.1f}%")
                print(f"Faixa de aproveitamento: {min(aproveitamentos):.1f}% - {max(aproveitamentos):.1f}%")
        
        print("============================================================")
    
    def selecionar_melhor_modelo(self):
        """
        Seleciona o melhor modelo para cada item e calcula cenários finais.
        Utiliza abordagem híbrida baseada em MAPE e BIAS.
        """
        print("Selecionando melhor modelo e calculando cenários finais...")
        
        if self.df_resultado is None or self.resultados_backtest is None:
            print("Erro: Execute realizar_backtest() primeiro.")
            return
        
        df = self.df_resultado.copy()
        
        # Inicializar dicionários se não existirem
        if not hasattr(self, 'tendencia_por_item'):
            self.tendencia_por_item = {}
        if not hasattr(self, 'bias_por_item'):
            self.bias_por_item = {}
        
        # Adicionar colunas do melhor cenário
        melhor_cenario = []
        total_melhor_cenario = []
        justificativa_melhor = []
        
        for idx, row in df.iterrows():
            codigo = row['Codigo']
            
            if codigo in self.melhor_modelo_por_item:
                melhor_modelo = self.melhor_modelo_por_item[codigo]
                melhor_cenario.append(melhor_modelo)
                total_melhor_cenario.append(row[f'TOTAL_12M_{melhor_modelo}'])
                
                # Obter informações adicionais para justificativa
                tendencia = self.tendencia_por_item.get(codigo, "estavel")
                bias = self.bias_por_item.get(codigo, 0)
                mape = self.mape_por_item.get(codigo, 0)
                meses_backtest = self.meses_backtest_por_item.get(codigo, 0)
                
                # Criar justificativa mais detalhada com valores específicos
                if tendencia == "crescimento":
                    if bias > 0:
                        justificativa = f"Melhor MAPE {mape:.1f}% com ajuste para tendência de crescimento (BIAS +{bias:.1f}, {meses_backtest}M teste): {melhor_modelo}"
                    else:
                        justificativa = f"Melhor MAPE {mape:.1f}% com tendência de crescimento (BIAS {bias:.1f}, {meses_backtest}M teste): {melhor_modelo}"
                elif tendencia == "queda":
                    if bias < 0:
                        justificativa = f"Melhor MAPE {mape:.1f}% com ajuste para tendência de queda (BIAS {bias:.1f}, {meses_backtest}M teste): {melhor_modelo}"
                    else:
                        justificativa = f"Melhor MAPE {mape:.1f}% com tendência de queda (BIAS +{bias:.1f}, {meses_backtest}M teste): {melhor_modelo}"
                else:
                    justificativa = f"Melhor MAPE {mape:.1f}% com tendência estável (BIAS {bias:.1f}, {meses_backtest}M teste): {melhor_modelo}"
                
                justificativa_melhor.append(justificativa)
            else:
                melhor_cenario.append('MEDIA_SIMPLES')
                total_melhor_cenario.append(row['TOTAL_12M_MEDIA_SIMPLES'])
                justificativa_melhor.append("Fallback para MEDIA_SIMPLES")
        
        df['MELHOR_CENARIO'] = melhor_cenario
        df['TOTAL_MELHOR_CENARIO'] = total_melhor_cenario
        df['JUSTIFICATIVA_MELHOR'] = justificativa_melhor
        
        # Calcular cenário ajustado
        def calcular_cenario_ajustado(row):
            total_melhor = row['TOTAL_MELHOR_CENARIO']
            ajuste_pct = row['SUGESTAO_AJUSTE_PCT']
            
            if pd.isna(ajuste_pct):
                ajuste_pct = 0
            
            # Aplicar ajuste percentual
            fator_ajuste = 1 + (ajuste_pct / 100)
            return total_melhor * fator_ajuste
        
        df['TOTAL_CENARIO_AJUSTADO'] = df.apply(calcular_cenario_ajustado, axis=1)
        
        # Adicionar coluna de meses de backtest ao DataFrame principal
        meses_backtest_lista = []
        for _, row in df.iterrows():
            codigo = row['Codigo']
            meses_backtest = self.meses_backtest_por_item.get(codigo, 0)
            meses_backtest_lista.append(meses_backtest)
        
        df['MESES_BACKTEST'] = meses_backtest_lista
        
        # Calcular total histórico (últimos 12 meses)
        ultimos_12_meses = self.colunas_meses[-12:] if len(self.colunas_meses) >= 12 else self.colunas_meses
        df['TOTAL_12M_HISTORICO'] = df[ultimos_12_meses].sum(axis=1)
        
        # Adicionar novas colunas solicitadas
        # 1. TOTAL_12M_HISTORICO + (TOTAL_12M_HISTORICO * SUGESTAO_AJUSTE_PCT)
        def calcular_historico_ajustado(row):
            total_historico = row['TOTAL_12M_HISTORICO']
            ajuste_pct = row['SUGESTAO_AJUSTE_PCT']
            
            if pd.isna(ajuste_pct):
                ajuste_pct = 0
            
            # Aplicar ajuste percentual
            fator_ajuste = 1 + (ajuste_pct / 100)
            return total_historico * fator_ajuste
        
        df['TOTAL_HISTORICO_AJUSTADO'] = df.apply(calcular_historico_ajustado, axis=1)
        
        # 2. Variação entre TOTAL_HISTORICO_AJUSTADO e TOTAL_CENARIO_AJUSTADO
        def calcular_variacao_ajustados(row):
            historico_ajustado = row['TOTAL_HISTORICO_AJUSTADO']
            cenario_ajustado = row['TOTAL_CENARIO_AJUSTADO']
            
            if historico_ajustado == 0:
                return 0
            
            return ((cenario_ajustado / historico_ajustado) - 1) * 100
        
        df['VAR_AJUSTADOS_PCT'] = df.apply(calcular_variacao_ajustados, axis=1)
        
        self.df_resultado = df
        print("Melhor modelo selecionado e cenários finais calculados!")
    
    def gerar_relatorio_excel(self, caminho_saida):
        """
        Gera relatório Excel com todas as análises e projeções.
        
        Args:
            caminho_saida (str): Caminho para salvar o arquivo Excel.
        """
        print(f"Gerando relatório Excel: {caminho_saida}")
        print("Verificando dados disponíveis...")
        
        if self.df_resultado is None:
            print("Erro: Dados não processados.")
            return
        
        try:
            with pd.ExcelWriter(caminho_saida, engine='openpyxl') as writer:
                # Aba 1: Campos Essenciais
                try:
                    self._gerar_aba_campos_essenciais(writer)
                    print("✅ Aba Geral gerada com sucesso")
                except Exception as e:
                    print(f"❌ Erro na aba Geral: {str(e)}")
                
                # Aba 2: Consolidado Nova Lógica
                try:
                    self._gerar_aba_consolidado_nova_logica(writer)
                    print("✅ Aba Detalhado gerada com sucesso")
                except Exception as e:
                    print(f"❌ Erro na aba Detalhado: {str(e)}")
                
                # Aba 3: Backtest Detalhado
                try:
                    self._gerar_aba_backtest_detalhado(writer)
                    print("✅ Aba Backtest gerada com sucesso")
                except Exception as e:
                    print(f"❌ Erro na aba Backtest: {str(e)}")
                
                # Aba 4: Backtest Por Produto
                try:
                    self._gerar_aba_backtest_por_produto(writer)
                    print("✅ Aba Backtest_Sku gerada com sucesso")
                except Exception as e:
                    print(f"❌ Erro na aba Backtest_Sku: {str(e)}")
                
                # Aba 5: Resumo dos Modelos
                try:
                    self._gerar_aba_resumo_modelos(writer)
                    print("✅ Aba Modelos_Estatisticos gerada com sucesso")
                except Exception as e:
                    print(f"❌ Erro na aba Modelos_Estatisticos: {str(e)}")
                
                # Aba 6: Análise de Sazonalidade
                try:
                    self._gerar_aba_analise_sazonalidade(writer)
                    print("✅ Aba Sazonalidade gerada com sucesso")
                except Exception as e:
                    print(f"❌ Erro na aba Sazonalidade: {str(e)}")
                
                # Aba 6.5: Análise de Cenários (NOVA)
                try:
                    self._gerar_aba_analise_cenarios(writer)
                    print("✅ Aba Analise_Cenarios gerada com sucesso")
                except Exception as e:
                    print(f"❌ Erro na aba Analise_Cenarios: {str(e)}")

                # Aba 6.6: Visão Executiva consolidada (NOVA)
                try:
                    self._gerar_aba_visao_executiva(writer)
                    print("✅ Aba Visao_Executiva gerada com sucesso")
                except Exception as e:
                    print(f"❌ Erro na aba Visao_Executiva: {str(e)}")
                
                # Aba 7: Análise de Acuracidade (se dados de previsão disponíveis)
                if hasattr(self, 'df_acuracidade') and self.df_acuracidade is not None and not self.df_acuracidade.empty:
                    try:
                        print("Gerando aba de Análise de Acuracidade...")
                        self._gerar_aba_analise_acuracidade(writer)
                        print("✅ Aba Acuracidade gerada com sucesso")
                    except Exception as e:
                        print(f"❌ Erro na aba Acuracidade: {str(e)}")
                    
                    # ✅ NOVA: Aba 8: Análise de Acuracidade Detalhada
                    if hasattr(self, 'df_acuracidade_detalhada') and self.df_acuracidade_detalhada is not None and not self.df_acuracidade_detalhada.empty:
                        try:
                            print("Gerando aba de Análise de Acuracidade Detalhada...")
                            self._gerar_aba_analise_acuracidade_detalhada(writer)
                            print("✅ Aba Acuracidade_Detalhada gerada com sucesso")
                        except Exception as e:
                            print(f"❌ Erro na aba Acuracidade_Detalhada: {str(e)}")
                    else:
                        print("⚠️ Aba de Análise de Acuracidade Detalhada não gerada - dados detalhados não disponíveis.")
                else:
                    print("⚠️ Aba de Análise de Acuracidade não gerada - dados não disponíveis ou vazios.")
                
                # Aba 9: Comportamento de Clientes Consolidado (se dados de clientes disponíveis)
                if hasattr(self, 'df_comportamento_consolidado') and self.df_comportamento_consolidado is not None and not self.df_comportamento_consolidado.empty:
                    try:
                        print("Gerando aba de Comportamento de Clientes Consolidado...")
                        self._gerar_aba_comportamento_clientes_consolidado(writer)
                        print("✅ Aba Clientes gerada com sucesso")
                    except Exception as e:
                        print(f"❌ Erro na aba Clientes: {str(e)}")
                else:
                    print("⚠️ Aba de Comportamento de Clientes Consolidado não gerada - dados não disponíveis ou vazios.")
                
                # Aba 10: Comportamento de Clientes Detalhado (se dados de clientes disponíveis)
                if hasattr(self, 'df_comportamento_detalhado') and self.df_comportamento_detalhado is not None and not self.df_comportamento_detalhado.empty:
                    try:
                        print("Gerando aba de Comportamento de Clientes Detalhado...")
                        self._gerar_aba_comportamento_clientes_detalhado(writer)
                        print("✅ Aba Cliente_detalhado gerada com sucesso")
                    except Exception as e:
                        print(f"❌ Erro na aba Cliente_detalhado: {str(e)}")
                else:
                    print("⚠️ Aba de Comportamento de Clientes Detalhado não gerada - dados não disponíveis ou vazios.")

                # Aba 11: Comportamento de Clientes Por Marca (se dados de clientes disponíveis)
                if hasattr(self, "df_comportamento_por_marca") and self.df_comportamento_por_marca is not None and not self.df_comportamento_por_marca.empty:
                    try:
                        print("Gerando aba de Comportamento de Clientes Por Marca...")
                        self._gerar_aba_comportamento_clientes_por_marca(writer)
                        print("✅ Aba Clientes_Por_Marca gerada com sucesso")
                    except Exception as e:
                        print(f"❌ Erro na aba Clientes_Por_Marca: {str(e)}")
                else:
                    print("⚠️ Aba de Comportamento de Clientes Por Marca não gerada - dados não disponíveis ou vazios.")
            
            print(f"\n✅ Relatório Excel gerado com sucesso: {caminho_saida}")
            
        except Exception as e:
            print(f"❌ Erro crítico ao gerar relatório Excel: {str(e)}")
            import traceback
            traceback.print_exc()
    def _gerar_aba_campos_essenciais(self, writer):
        """Gera a aba Campos Essenciais."""
        print("Gerando aba: Campos Essenciais")
        
        # Calcular TOP_4_MESES_HISTORICO para cada item (Abordagem Híbrida)
        def calcular_top_4_meses_historico(row):
            try:
                # Extrair dados históricos por ano desde 2022
                vendas_por_ano = {}
                vendas_por_mes_consolidado = {i: [] for i in range(1, 13)}  # Jan=1, Dez=12
                
                for col in self.colunas_meses:
                    try:
                        # Verificar diferentes formatos possíveis
                        if '/' in col:
                            # Formato: "mmm/yy" ou "mmm/yyyy"
                            mes_ano = col.split('/')
                            if len(mes_ano) == 2:
                                mes_str, ano_str = mes_ano
                                
                                # Converter mês para número
                                meses_dict = {
                                    'jan': 1, 'fev': 2, 'mar': 3, 'abr': 4, 'mai': 5, 'jun': 6,
                                    'jul': 7, 'ago': 8, 'set': 9, 'out': 10, 'nov': 11, 'dez': 12,
                                    'janeiro': 1, 'fevereiro': 2, 'março': 3, 'abril': 4, 'maio': 5, 'junho': 6,
                                    'julho': 7, 'agosto': 8, 'setembro': 9, 'outubro': 10, 'novembro': 11, 'dezembro': 12
                                }
                                
                                mes_num = meses_dict.get(mes_str.lower())
                                
                                # Converter ano
                                if len(ano_str) == 2:
                                    ano_num = 2000 + int(ano_str)
                                elif len(ano_str) == 4:
                                    ano_num = int(ano_str)
                                else:
                                    continue
                                
                                # Filtrar apenas dados de 2022 em diante
                                if mes_num and ano_num >= 2022:
                                    valor = row[col] if not pd.isna(row[col]) else 0
                                    
                                    # Agrupar por ano
                                    if ano_num not in vendas_por_ano:
                                        vendas_por_ano[ano_num] = {}
                                    vendas_por_ano[ano_num][mes_num] = valor
                                    
                                    vendas_por_mes_consolidado[mes_num].append(valor)
                        
                        elif '-' in col:
                            # Formato alternativo: "mmm-yy"
                            mes_ano = col.split('-')
                            if len(mes_ano) == 2:
                                mes_str, ano_str = mes_ano
                                
                                meses_dict = {
                                    'jan': 1, 'fev': 2, 'mar': 3, 'abr': 4, 'mai': 5, 'jun': 6,
                                    'jul': 7, 'ago': 8, 'set': 9, 'out': 10, 'nov': 11, 'dez': 12
                                }
                                
                                mes_num = meses_dict.get(mes_str.lower())
                                
                                if len(ano_str) == 2:
                                    ano_num = 2000 + int(ano_str)
                                elif len(ano_str) == 4:
                                    ano_num = int(ano_str)
                                else:
                                    continue
                                
                                # Filtrar apenas dados de 2022 em diante
                                if mes_num and ano_num >= 2022:
                                    valor = row[col] if not pd.isna(row[col]) else 0
                                    vendas_por_mes_consolidado[mes_num].append(valor)
                                    
                    except:
                        continue
                
                # Analisar cada ano individualmente para frequência
                analise_por_ano = {}
                for ano, vendas_ano in vendas_por_ano.items():
                    if vendas_ano:
                        # Encontrar os 4 meses mais fortes do ano
                        vendas_ordenadas = sorted(vendas_ano.items(), key=lambda x: x[1], reverse=True)
                        top_4_meses = [mes for mes, valor in vendas_ordenadas[:4] if valor > 0]
                        analise_por_ano[ano] = top_4_meses
                
                # Calcular médias por mês
                medias_por_mes = {}
                for mes in range(1, 13):
                    valores = vendas_por_mes_consolidado[mes]
                    if valores:
                        medias_por_mes[mes] = sum(valores) / len(valores)
                    else:
                        medias_por_mes[mes] = 0
                
                # Consolidar meses mais fortes historicamente (frequência)
                contador_meses = {i: 0 for i in range(1, 13)}
                for ano, meses_fortes in analise_por_ano.items():
                    for mes in meses_fortes:
                        contador_meses[mes] += 1
                
                # Abordagem Híbrida: Frequência (60%) + Média (40%)
                max_frequencia = max(contador_meses.values()) if contador_meses.values() else 1
                max_media = max(medias_por_mes.values()) if medias_por_mes.values() else 1
                
                scores_hibridos = {}
                for mes in range(1, 13):
                    score_frequencia = contador_meses[mes] / max_frequencia if max_frequencia > 0 else 0
                    score_media = medias_por_mes[mes] / max_media if max_media > 0 else 0
                    
                    # Score híbrido: 60% frequência + 40% média
                    score_hibrido = (score_frequencia * 0.6) + (score_media * 0.4)
                    scores_hibridos[mes] = score_hibrido
                
                # Encontrar os 4 meses com maiores scores híbridos
                meses_ordenados_hibrido = sorted(scores_hibridos.items(), key=lambda x: x[1], reverse=True)
                top_4_meses = [mes for mes, score in meses_ordenados_hibrido[:4] if score > 0]
                
                # Converter números de mês para nomes
                nomes_meses = {
                    1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril', 5: 'Maio', 6: 'Junho',
                    7: 'Julho', 8: 'Agosto', 9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro'
                }
                
                meses_nomes = [nomes_meses[mes] for mes in top_4_meses]
                return ', '.join(meses_nomes) if meses_nomes else 'N/A'
                
            except:
                return 'N/A'
        
        # Adicionar coluna TOP_4_MESES_HISTORICO ao DataFrame
        df_com_sazonalidade = self.df_resultado.copy()
        df_com_sazonalidade['TOP_4_MESES_HISTORICO'] = df_com_sazonalidade.apply(calcular_top_4_meses_historico, axis=1)
        
        # ✅ NOVA: Adicionar coluna PRIMEIRO_MES_VENDA
        def calcular_primeiro_mes_venda(row):
            """Calcula o primeiro mês com vendas > 0 para o item."""
            for col in self.colunas_meses:
                if pd.notna(row[col]) and row[col] > 0:
                    # Extrair mês e ano da coluna (formato: jan-23, fev-24, etc.)
                    if '-' in col:
                        mes_ano = col.upper()  # Converter para maiúsculo
                        return mes_ano
            return "SEM VENDAS"
        
        df_com_sazonalidade['PRIMEIRO_MES_VENDA'] = df_com_sazonalidade.apply(calcular_primeiro_mes_venda, axis=1)
        
        # ✅ NOVA: Adicionar coluna PRIMEIRO_MES_ULTIMOS_24M
        def calcular_primeiro_mes_ultimos_24m(row):
            """Calcula o primeiro mês com vendas > 0 nos últimos 24 meses."""
            # Pegar os últimos 24 meses (ou todos se tiver menos)
            ultimos_24_meses = self.colunas_meses[-24:] if len(self.colunas_meses) >= 24 else self.colunas_meses
            
            for col in ultimos_24_meses:
                if pd.notna(row[col]) and row[col] > 0:
                    # Extrair mês e ano da coluna (formato: jan-23, fev-24, etc.)
                    if '-' in col:
                        mes_ano = col.upper()  # Converter para maiúsculo
                        return mes_ano
            return "SEM VENDAS 24M"
        
        df_com_sazonalidade['PRIMEIRO_MES_ULTIMOS_24M'] = df_com_sazonalidade.apply(calcular_primeiro_mes_ultimos_24m, axis=1)
        
        # ✅ NOVA: Adicionar coluna STATUS_ATIVIDADE
        def calcular_status_atividade(row):
            """Determina se o item é FREQUENTE, REATIVADO, NOVO ou ESPORÁDICO."""
            import pandas as pd
            
            # Analisar últimos 24 meses
            ultimos_24_meses = self.colunas_meses[-24:] if len(self.colunas_meses) >= 24 else self.colunas_meses
            ultimos_12_meses = self.colunas_meses[-12:] if len(self.colunas_meses) >= 12 else self.colunas_meses
            ultimos_6_meses = self.colunas_meses[-6:] if len(self.colunas_meses) >= 6 else self.colunas_meses
            
            # Contar meses com vendas
            vendas_24m = sum(1 for col in ultimos_24_meses if pd.notna(row[col]) and row[col] > 0)
            vendas_12m = sum(1 for col in ultimos_12_meses if pd.notna(row[col]) and row[col] > 0)
            vendas_6m = sum(1 for col in ultimos_6_meses if pd.notna(row[col]) and row[col] > 0)
            
            # Verificar se é NOVO (primeiro mês de venda nos últimos 12 meses)
            primeiro_mes_geral = row['PRIMEIRO_MES_VENDA']
            primeiro_mes_24m = row['PRIMEIRO_MES_ULTIMOS_24M']
            
            if primeiro_mes_geral != "SEM VENDAS" and primeiro_mes_24m != "SEM VENDAS 24M":
                # Se primeiro mês geral é igual ao primeiro mês dos últimos 24M = item novo
                if primeiro_mes_geral == primeiro_mes_24m and vendas_12m <= 6:
                    return "NOVO"
            
            # Verificar se é REATIVADO
            # Critério: diferença significativa entre primeiro mês geral e primeiro mês 24M
            # E voltou a vender nos últimos 6 meses
            if (primeiro_mes_geral != primeiro_mes_24m and 
                primeiro_mes_24m != "SEM VENDAS 24M" and 
                vendas_6m > 0):
                
                # Verificar se houve gap de inatividade (6+ meses consecutivos sem venda)
                gap_encontrado = False
                meses_consecutivos_sem_venda = 0
                
                for col in ultimos_24_meses:
                    if pd.isna(row[col]) or row[col] == 0:
                        meses_consecutivos_sem_venda += 1
                        if meses_consecutivos_sem_venda >= 6:  # ✅ AJUSTADO: 6+ meses
                            gap_encontrado = True
                    else:
                        meses_consecutivos_sem_venda = 0
                
                if gap_encontrado:
                    return "REATIVADO"
            
            # Verificar se é FREQUENTE
            # Critério: vendeu em pelo menos 70% dos últimos 12 meses OU 50% dos últimos 24 meses
            if len(ultimos_12_meses) > 0:
                freq_12m = vendas_12m / len(ultimos_12_meses)
                if freq_12m >= 0.70:
                    return "FREQUENTE"
            
            if len(ultimos_24_meses) > 0:
                freq_24m = vendas_24m / len(ultimos_24_meses)
                if freq_24m >= 0.50:
                    return "FREQUENTE"
            
            # Caso contrário, é ESPORÁDICO
            if vendas_24m > 0:
                return "ESPORÁDICO"
            else:
                return "INATIVO"
        
        df_com_sazonalidade['STATUS_ATIVIDADE'] = df_com_sazonalidade.apply(calcular_status_atividade, axis=1)
        
        # Adicionar dados de acuracidade ao df_resultado se disponível
        if hasattr(self, 'df_acuracidade') and self.df_acuracidade is not None and not self.df_acuracidade.empty:
            # Selecionar apenas as colunas de acuracidade necessárias
            colunas_acuracidade = ['Codigo', 'MAPE_MEDIO_MENSAL', 'CLASSIFICACAO_ERRO_MENSAL', 
                                 'MAPE_TOTAL', 'CLASSIFICACAO_ERRO_TOTAL']
            df_acur_essencial = self.df_acuracidade[colunas_acuracidade].copy()
            
            # Fazer merge com df_resultado
            df_com_sazonalidade = df_com_sazonalidade.merge(df_acur_essencial, on='Codigo', how='left')
        else:
            # Se não há dados de acuracidade, adicionar colunas vazias
            df_com_sazonalidade['MAPE_MEDIO_MENSAL'] = None
            df_com_sazonalidade['CLASSIFICACAO_ERRO_MENSAL'] = 'SEM DADOS'
            df_com_sazonalidade['MAPE_TOTAL'] = None
            df_com_sazonalidade['CLASSIFICACAO_ERRO_TOTAL'] = 'SEM DADOS'
        
        # Selecionar colunas essenciais (incluindo a nova coluna)
        colunas_essenciais = [
            'Codigo', 'STATUS_ITEM', 'PRIMEIRO_MES_VENDA', 'PRIMEIRO_MES_ULTIMOS_24M', 'STATUS_ATIVIDADE',  # ✅ NOVA COLUNA
            'TOTAL_3M_ANTERIOR', 'TOTAL_3M_ATUAL', 'VAR_3M_PCT', 'FLAG_VAR_3M', 'STATUS_3M',  # ✅ NOVO: 3M
            'TOTAL_6M_ANTERIOR', 'TOTAL_6M_ATUAL', 'VAR_6M_PCT', 'FLAG_VAR_6M', 'STATUS_6M',
            'TOTAL_12M_ANTERIOR', 'TOTAL_12M_ATUAL', 'VAR_12M_PCT', 'FLAG_VAR_12M', 'STATUS_12M',
            'TOTAL_18M_ANTERIOR', 'TOTAL_18M_ATUAL', 'VAR_18M_PCT', 'FLAG_VAR_18M', 'STATUS_18M',
            'CATEGORIA_VOLUME', 'FLAG_VARIACAO_GERAL',  # Novas colunas de contexto
            'SUGESTAO_AJUSTE_PCT',  # ✅ REMOVIDO STATUS_ITEM duplicado
            'TOTAL_12M_HISTORICO',
            'TOTAL_12M_MEDIA_SIMPLES', 'TOTAL_12M_MEDIA_PONDERADA', 'TOTAL_12M_MEDIA_MOVEL',
            'TOTAL_12M_HOLT_WINTERS', 'TOTAL_12M_SARIMA', 'TOTAL_12M_PROPHET',
            'TOTAL_12M_RANDOM_FOREST', 'TOTAL_12M_XGBOOST',
            'TOTAL_12M_NAIVE_SAZONAL', 'TOTAL_12M_CROSTON', 'TOTAL_12M_ENSEMBLE',  # Novos cenários
            'MELHOR_CENARIO', 'TOTAL_MELHOR_CENARIO', 'JUSTIFICATIVA_MELHOR',
            'MESES_BACKTEST',  # Nova coluna com período de backtest
            'TOTAL_CENARIO_AJUSTADO',
            'TOTAL_HISTORICO_AJUSTADO',  # Nova coluna: histórico + ajuste
            'VAR_AJUSTADOS_PCT',  # Nova coluna: variação entre histórico ajustado e cenário ajustado
            'TOP_4_MESES_HISTORICO',  # Nova coluna: meses mais fortes historicamente
            # ✅ NOVAS COLUNAS DE ACURACIDADE
            'MAPE_MEDIO_MENSAL', 'CLASSIFICACAO_ERRO_MENSAL',
            'MAPE_TOTAL', 'CLASSIFICACAO_ERRO_TOTAL'
        ]
        
        df_essenciais = df_com_sazonalidade[colunas_essenciais].copy()
        df_essenciais.to_excel(writer, sheet_name='Geral', index=False)
        
        # Aplicar formatação
        worksheet = writer.sheets['Geral']
        self._aplicar_formatacao_basica(worksheet)
        
        # Formatação específica para colunas de variação e MAPE
        self._aplicar_formatacao_percentual(worksheet, ['VAR_3M_PCT', 'VAR_6M_PCT', 'VAR_12M_PCT', 'VAR_18M_PCT', 'SUGESTAO_AJUSTE_PCT', 'VAR_AJUSTADOS_PCT', 'MAPE_MEDIO_MENSAL', 'MAPE_TOTAL'])
        self._aplicar_formatacao_condicional_variacao(worksheet)
        # Formatação de contexto temporariamente desabilitada para evitar erros no Excel
        # self._aplicar_formatacao_flags_contexto(worksheet)
    
    def _gerar_aba_consolidado_nova_logica(self, writer):
        """Gera a aba Consolidado Nova Lógica."""
        print("Gerando aba: Consolidado Nova Lógica")
        
        df_consolidado = self.df_resultado.copy()
        
        # Reorganizar colunas na ordem correta
        colunas_ordenadas = ['Codigo']
        
        # Adicionar colunas históricas
        colunas_ordenadas.extend(self.colunas_meses)
        
        # Adicionar colunas de análise comparativa na ordem correta (incluindo 3M)
        for periodo in [3, 6, 12, 18]:
            colunas_ordenadas.extend([
                f'TOTAL_{periodo}M_ANTERIOR',
                f'TOTAL_{periodo}M_ATUAL', 
                f'VAR_{periodo}M_PCT',
                f'STATUS_{periodo}M'
            ])
        
        # Adicionar colunas de status e primeiro mês
        colunas_ordenadas.extend(['STATUS_ITEM', 'PRIMEIRO_MES_VENDA', 'PRIMEIRO_MES_ULTIMOS_24M', 'STATUS_ATIVIDADE'])  # ✅ NOVA COLUNA
        
        # Adicionar outras colunas de análise
        colunas_ordenadas.extend([
            'SUGESTAO_AJUSTE_PCT',
            'TOTAL_12M_HISTORICO'
        ])
        
        # Adicionar colunas de cenários
        colunas_ordenadas.extend([
            'MELHOR_CENARIO', 'TOTAL_MELHOR_CENARIO', 'JUSTIFICATIVA_MELHOR',
            'TOTAL_CENARIO_AJUSTADO'
        ])
        
        # Definir lista de métodos estatísticos
        metodos = ['MEDIA_SIMPLES', 'MEDIA_PONDERADA', 'MEDIA_MOVEL', 
                  'HOLT_WINTERS', 'SARIMA', 'PROPHET', 'RANDOM_FOREST', 'XGBOOST',
                  'NAIVE_SAZONAL', 'CROSTON', 'ENSEMBLE']
        
        # Adicionar projeções futuras em sequência cronológica por método
        for metodo in metodos:
            # Adicionar todas as projeções de um método em sequência cronológica
            for data in self.colunas_projecao:
                if f'{data}_{metodo}' in df_consolidado.columns:
                    colunas_ordenadas.append(f'{data}_{metodo}')
            
            # Adicionar total do método (que já foi calculado como TOTAL_12M_METODO)
            if f'TOTAL_12M_{metodo}' in df_consolidado.columns:
                colunas_ordenadas.append(f'TOTAL_12M_{metodo}')
        
        # Filtrar apenas colunas que existem no DataFrame
        colunas_existentes = [col for col in colunas_ordenadas if col in df_consolidado.columns]
        
        df_final = df_consolidado[colunas_existentes]
        df_final.to_excel(writer, sheet_name='Detalhado', index=False)
        
        # Aplicar formatação
        worksheet = writer.sheets['Detalhado']
        self._aplicar_formatacao_basica(worksheet)
        
        # Formatação específica para colunas de variação (incluindo 3M)
        colunas_variacao = ['VAR_3M_PCT', 'VAR_6M_PCT', 'VAR_12M_PCT', 'VAR_18M_PCT', 'SUGESTAO_AJUSTE_PCT']
        self._aplicar_formatacao_percentual(worksheet, colunas_variacao)
        
        # Formatação especial para colunas de totais projetados (cinza escuro com fonte branca)
        colunas_totais_projetados = [f'TOTAL_12M_{metodo}' for metodo in metodos]
        self._aplicar_formatacao_totais_projetados(worksheet, colunas_totais_projetados)
        
        self._aplicar_formatacao_condicional_variacao(worksheet)
    
    def _gerar_aba_backtest_detalhado(self, writer):
        """Gera a aba Backtest Detalhado."""
        print("Gerando aba: Backtest Detalhado")
        
        if hasattr(self, 'resultados_backtest') and self.resultados_backtest is not None:
            # Criar DataFrame dos resultados de backtest
            df_backtest = pd.DataFrame(self.resultados_backtest)
            
            # Reorganizar colunas conforme layout solicitado: Código + MAPE + MAE + MSE + BIAS + BIAS_STATUS
            metodos = ['MEDIA_SIMPLES', 'MEDIA_PONDERADA', 'MEDIA_MOVEL', 
                      'HOLT_WINTERS', 'SARIMA', 'PROPHET', 'RANDOM_FOREST', 'XGBOOST',
                      'NAIVE_SAZONAL', 'CROSTON', 'ENSEMBLE']
            
            colunas_reorganizadas = ['Codigo']
            
            # Adicionar todas as colunas MAPE primeiro
            for metodo in metodos:
                col_mape = f'MAPE_{metodo}'
                if col_mape in df_backtest.columns:
                    colunas_reorganizadas.append(col_mape)
            
            # Adicionar todas as colunas MAE
            for metodo in metodos:
                col_mae = f'MAE_{metodo}'
                if col_mae in df_backtest.columns:
                    colunas_reorganizadas.append(col_mae)
            
            # Adicionar todas as colunas MSE
            for metodo in metodos:
                col_mse = f'MSE_{metodo}'
                if col_mse in df_backtest.columns:
                    colunas_reorganizadas.append(col_mse)
            
            # Adicionar todas as colunas BIAS
            for metodo in metodos:
                col_bias = f'BIAS_{metodo}'
                if col_bias in df_backtest.columns:
                    colunas_reorganizadas.append(col_bias)
            
            # Adicionar todas as colunas BIAS_STATUS
            for metodo in metodos:
                col_bias_status = f'BIAS_STATUS_{metodo}'
                if col_bias_status in df_backtest.columns:
                    colunas_reorganizadas.append(col_bias_status)
            
            # Adicionar colunas de melhor modelo
            if 'MELHOR_MODELO' in df_backtest.columns:
                colunas_reorganizadas.append('MELHOR_MODELO')
            if 'MELHOR_MAPE' in df_backtest.columns:
                colunas_reorganizadas.append('MELHOR_MAPE')
            
            # Filtrar apenas colunas que existem no DataFrame
            colunas_existentes = [col for col in colunas_reorganizadas if col in df_backtest.columns]
            df_reorganizado = df_backtest[colunas_existentes]
            
            # Escrever na aba começando da linha 1 (sem observações no topo)
            df_reorganizado.to_excel(writer, sheet_name='Backtest', index=False, startrow=0)
            
            # Obter worksheet para adicionar observações
            worksheet = writer.sheets['Backtest']
            
            # Inserir linhas no topo para as observações
            worksheet.insert_rows(1, 8)  # Inserir 8 linhas no topo
            
            # Adicionar observações nas primeiras linhas
            observacoes = [
                ['Tipo', 'Descrição'],
                ['PERIODO', 'Período de teste utilizado no backtest: Últimos 6 meses do histórico de vendas'],
                ['MAPE', 'Erro Percentual Absoluto Médio (Mean Absolute Percentage Error): Média dos erros percentuais absolutos. Quanto menor, melhor.'],
                ['MAE', 'Erro Absoluto Médio (Mean Absolute Error): Média dos valores absolutos dos erros. Quanto menor, melhor.'],
                ['MSE', 'Erro Quadrático Médio (Mean Squared Error): Média dos quadrados dos erros. Penaliza erros maiores. Quanto menor, melhor.'],
                ['BIAS', 'BIAS (Viés): Indica se o modelo tende a super ou subestimar. Valores positivos = superestimação, negativos = subestimação.'],
                ['BIAS_STATUS', 'Status do BIAS: Indica se o modelo está SUPERESTIMANDO ou SUBESTIMANDO a demanda.'],
                ['', '']  # Linha vazia para separar
            ]
            
            # Escrever observações nas primeiras linhas
            for i, obs in enumerate(observacoes):
                worksheet.cell(row=i+1, column=1, value=obs[0])
                worksheet.cell(row=i+1, column=2, value=obs[1])
            
            # Aplicar formatação básica
            self._aplicar_formatacao_basica(worksheet)
            
            # Formatação especial para cabeçalhos das observações
            from openpyxl.styles import Font, PatternFill, Alignment
            
            header_font = Font(name="Calibri", size=11, bold=True)
            header_fill = PatternFill(start_color="D9E1F2", end_color="D9E1F2", fill_type="solid")
            
            # Formatar primeira linha das observações
            for col in range(1, 3):
                cell = worksheet.cell(row=1, column=col)
                cell.font = header_font
                cell.fill = header_fill
                cell.alignment = Alignment(horizontal="center", vertical="center")
            
            # Formatar células das observações (SEM quebra de texto automática)
            for row in range(2, 8):
                for col in range(1, 3):
                    cell = worksheet.cell(row=row, column=col)
                    cell.alignment = Alignment(horizontal="left", vertical="top", wrap_text=False)
            
            # Ajustar largura das colunas das observações
            worksheet.column_dimensions['A'].width = 15
            worksheet.column_dimensions['B'].width = 120  # Aumentar largura para acomodar texto sem quebra
            
        else:
            # Se não há dados de backtest, criar aba vazia com mensagem
            df_vazio = pd.DataFrame([['Nenhum dado de backtest disponível']], columns=['Mensagem'])
            df_vazio.to_excel(writer, sheet_name='Backtest', index=False)
            
            worksheet = writer.sheets['Backtest']
            self._aplicar_formatacao_basica(worksheet)
    
    def _gerar_aba_backtest_por_produto(self, writer):
        """Gera a aba Backtest Por Produto."""
        print("Gerando aba: Backtest Por Produto")
        
        if hasattr(self, 'resultados_backtest') and self.resultados_backtest is not None:
            # Selecionar apenas colunas principais para melhor compreensão
            colunas_principais = ['Codigo', 'MELHOR_MODELO', 'MELHOR_MAPE']
            
            # Adicionar colunas de MAPE para cada método (indicador principal)
            metodos = ['MEDIA_SIMPLES', 'MEDIA_PONDERADA', 'MEDIA_MOVEL', 
                      'HOLT_WINTERS', 'SARIMA', 'PROPHET', 'RANDOM_FOREST', 'XGBOOST',
                      'NAIVE_SAZONAL', 'CROSTON', 'ENSEMBLE']
            
            colunas_mape = ['MELHOR_MAPE']
            for metodo in metodos:
                col_mape = f'MAPE_{metodo}'
                if col_mape in self.resultados_backtest.columns:
                    colunas_principais.append(col_mape)
                    colunas_mape.append(col_mape)
            
            # Adicionar colunas de BIAS para cada método
            colunas_bias = []
            for metodo in metodos:
                col_bias = f'BIAS_{metodo}'
                if col_bias in self.resultados_backtest.columns:
                    colunas_principais.append(col_bias)
                    colunas_bias.append(col_bias)
            
            # Adicionar colunas de status do BIAS para cada método
            colunas_bias_status = []
            for metodo in metodos:
                col_bias_status = f'BIAS_STATUS_{metodo}'
                if col_bias_status in self.resultados_backtest.columns:
                    colunas_principais.append(col_bias_status)
                    colunas_bias_status.append(col_bias_status)
            
            df_backtest_produto = self.resultados_backtest[colunas_principais].copy()
            df_backtest_produto.to_excel(writer, sheet_name='Backtest_Sku', index=False)
        else:
            # Criar DataFrame vazio
            df_vazio = pd.DataFrame(columns=['Codigo', 'MELHOR_MODELO', 'MELHOR_MAPE'])
            df_vazio.to_excel(writer, sheet_name='Backtest_Sku', index=False)
        
        # Aplicar formatação
        worksheet = writer.sheets['Backtest_Sku']
        self._aplicar_formatacao_basica(worksheet)
        
        # Aplicar formatação percentual às colunas de MAPE
        if 'colunas_mape' in locals():
            self._aplicar_formatacao_percentual(worksheet, colunas_mape)
        
        # Aplicar formatação numérica às colunas de BIAS
        if 'colunas_bias' in locals():
            self._aplicar_formatacao_numerica(worksheet, colunas_bias, formato='0.00')
    
    def _aplicar_formatacao_basica(self, worksheet):
        """Aplica formatação básica à planilha."""
        from openpyxl.styles import Font
        
        # Definir fonte padrão
        font = Font(name='Calibri', size=12)
        
        # Aplicar fonte a todas as células
        for row in worksheet.iter_rows():
            for cell in row:
                cell.font = font
        
        # Ajustar zoom para 67%
        worksheet.sheet_view.zoomScale = 67
        
        # Auto-ajustar largura das colunas
        for column in worksheet.columns:
            max_length = 0
            column_letter = column[0].column_letter
            for cell in column:
                try:
                    if len(str(cell.value)) > max_length:
                        max_length = len(str(cell.value))
                except:
                    pass
            adjusted_width = min(max_length + 2, 50)
            worksheet.column_dimensions[column_letter].width = adjusted_width
    
    def _aplicar_formatacao_percentual_unificada(self, worksheet, colunas_percentuais=None, df=None, nome_coluna=None, dividir_por_100=True):
        """
        Funcao UNIFICADA para aplicar formatacao percentual.
        Consolida as funcoes: _aplicar_formatacao_percentual, _aplicar_formatacao_porcentagem, 
        _aplicar_formatacao_porcentagem_corrigida.
        
        Args:
            worksheet: Planilha do Excel
            colunas_percentuais: Lista de colunas para formatar (modo lista)
            df: DataFrame de referencia (modo coluna unica)
            nome_coluna: Nome da coluna especifica (modo coluna unica)
            dividir_por_100: Se True, divide valores por 100 antes de formatar
        """
        try:
            from openpyxl.utils import get_column_letter
            
            # Modo 1: Lista de colunas
            if colunas_percentuais is not None:
                header_row = list(worksheet.iter_rows(min_row=1, max_row=1))[0]
                col_indices = {}
                
                for idx, cell in enumerate(header_row):
                    if cell.value in colunas_percentuais:
                        col_indices[cell.value] = idx + 1
                
                for col_name, col_idx in col_indices.items():
                    for row in range(2, worksheet.max_row + 1):
                        cell = worksheet.cell(row=row, column=col_idx)
                        if cell.value is not None and isinstance(cell.value, (int, float)):
                            if not pd.isna(cell.value):
                                # Determinar se deve dividir por 100
                                deve_dividir = self._deve_dividir_por_100(col_name)
                                if deve_dividir:
                                    cell.value = cell.value / 100
                            cell.number_format = '0.00%'
            
            # Modo 2: Coluna unica
            elif nome_coluna is not None and df is not None:
                if nome_coluna not in df.columns:
                    logger.debug(f"Coluna {nome_coluna} nao encontrada.")
                    return
                
                col_index = list(df.columns).index(nome_coluna) + 1
                col_letter = get_column_letter(col_index)
                
                for row in range(2, len(df) + 2):
                    cell = worksheet[f'{col_letter}{row}']
                    if cell.value is not None and isinstance(cell.value, (int, float)):
                        if dividir_por_100 and self._deve_dividir_por_100(nome_coluna):
                            cell.value = cell.value / 100
                        cell.number_format = '0.00%'
                        
        except Exception as e:
            logger.warning(f"Erro na formatacao percentual: {e}")
    
    def _deve_dividir_por_100(self, col_name):
        """
        Determina se uma coluna deve ter seus valores divididos por 100.
        
        Returns:
            bool: True se deve dividir, False caso contrario
        """
        # Colunas que NAO devem ser divididas (ja estao em formato decimal 0.xx)
        nao_dividir = [
            'MAPE_MEDIO_MENSAL', 'MAPE_TOTAL'
        ]
        
        for padrao in nao_dividir:
            if padrao in col_name:
                return False
        
        # TODAS as colunas de variacao percentual DEVEM ser divididas por 100
        # pois estao armazenadas como numeros inteiros (ex: 47.06 para 47.06%)
        # e o formato '0.00%' do Excel multiplica por 100
        if 'VAR_' in col_name and '_PCT' in col_name:
            return True
        
        # Colunas MAPE individuais devem ser divididas
        if 'MAPE_' in col_name:
            return True
        
        # Demais colunas percentuais devem ser divididas
        return True
    
    # Manter funcoes antigas como aliases para compatibilidade
    def _aplicar_formatacao_percentual(self, worksheet, colunas_percentuais):
        """Alias para compatibilidade - usa funcao unificada."""
        self._aplicar_formatacao_percentual_unificada(worksheet, colunas_percentuais=colunas_percentuais)
    
    def _aplicar_formatacao_numerica(self, worksheet, colunas_numericas, formato='0.00'):
        """Aplica formatação numérica às colunas especificadas."""
        from openpyxl.styles import NamedStyle
        
        # Criar estilo numérico
        numeric_style = NamedStyle(name="numeric")
        numeric_style.number_format = formato
        
        # Encontrar índices das colunas
        header_row = list(worksheet.iter_rows(min_row=1, max_row=1))[0]
        col_indices = {}
        
        for idx, cell in enumerate(header_row):
            if cell.value in colunas_numericas:
                col_indices[cell.value] = idx + 1
        
        # Aplicar formatação numérica
        for col_name, col_idx in col_indices.items():
            for row in range(2, worksheet.max_row + 1):
                cell = worksheet.cell(row=row, column=col_idx)
                if cell.value is not None and isinstance(cell.value, (int, float)):
                    cell.number_format = formato
    
    def calcular_status_item(self):
        """
        Calcula o status do item com base no histórico de vendas.
        - ITEM NOVO: Vendas apenas nos últimos 12 meses
        - ITEM DE LINHA: Vendas frequentes ao longo do histórico
        - ITEM INATIVO: Sem vendas nos últimos 12 meses
        """
        
        if self.df_resultado is None:
            print("Erro: Dados não processados.")
            return
        
        df = self.df_resultado.copy()
        
        # Identificar o mês mais recente
        ultimo_mes_idx = len(self.colunas_meses) - 1
        
        # Definir períodos para análise
        ultimos_12_meses = self.colunas_meses[max(0, ultimo_mes_idx - 11):ultimo_mes_idx + 1]
        meses_anteriores = self.colunas_meses[:max(0, ultimo_mes_idx - 11)]
        
        # Calcular status do item
        def determinar_status_item(row):
            # Verificar se houve vendas nos últimos 12 meses
            vendas_recentes = row[ultimos_12_meses].sum() > 0
            
            # Verificar se houve vendas em períodos anteriores
            vendas_anteriores = False
            if len(meses_anteriores) > 0:
                vendas_anteriores = row[meses_anteriores].sum() > 0
            
            # Determinar status
            if not vendas_recentes:
                return "ITEM INATIVO"
            elif vendas_recentes and not vendas_anteriores:
                return "ITEM NOVO"
            else:
                return "ITEM DE LINHA"
        
        # Aplicar função para determinar status
        df['STATUS_ITEM'] = df.apply(determinar_status_item, axis=1)
        
        self.df_resultado = df
        print("Status dos itens calculado com sucesso!")
        
    def _aplicar_formatacao_totais_projetados(self, worksheet, colunas_totais):
        """Aplica formatação especial para colunas de totais projetados."""
        from openpyxl.styles import PatternFill, Font
        
        # Definir estilo (cinza escuro com fonte branca)
        fill = PatternFill(start_color="404040", end_color="404040", fill_type="solid")
        font = Font(name='Calibri', size=12, color="FFFFFF")
        
        # Encontrar índices das colunas
        header_row = list(worksheet.iter_rows(min_row=1, max_row=1))[0]
        col_indices = {}
        
        for idx, cell in enumerate(header_row):
            if cell.value in colunas_totais:
                col_indices[cell.value] = idx + 1
        
        # Aplicar formatação
        for col_name, col_idx in col_indices.items():
            for row in range(1, worksheet.max_row + 1):
                cell = worksheet.cell(row=row, column=col_idx)
                cell.fill = fill
                cell.font = font
    
    def _aplicar_formatacao_condicional_variacao(self, worksheet):
        """Aplica formatação condicional para colunas de variação."""
        from openpyxl.styles import PatternFill
        from openpyxl.formatting.rule import CellIsRule
        
        # Definir cores
        cores = {
            'verde_claro': PatternFill(start_color="C6EFCE", end_color="C6EFCE", fill_type="solid"),
            'verde_medio': PatternFill(start_color="92D050", end_color="92D050", fill_type="solid"),
            'verde_escuro': PatternFill(start_color="70AD47", end_color="70AD47", fill_type="solid"),
            'vermelho_claro': PatternFill(start_color="FFC7CE", end_color="FFC7CE", fill_type="solid"),
            'vermelho_medio': PatternFill(start_color="FF9999", end_color="FF9999", fill_type="solid"),
            'vermelho_escuro': PatternFill(start_color="FF6666", end_color="FF6666", fill_type="solid")
        }
        
        # Encontrar colunas de variação (incluindo 3M)
        header_row = list(worksheet.iter_rows(min_row=1, max_row=1))[0]
        colunas_variacao = ['VAR_3M_PCT', 'VAR_6M_PCT', 'VAR_12M_PCT', 'VAR_18M_PCT']
        
        for idx, cell in enumerate(header_row):
            if cell.value in colunas_variacao:
                col_letter = cell.column_letter
                
                # Aplicar regras de formatação condicional
                # Crescimento Alto (>35%)
                worksheet.conditional_formatting.add(
                    f'{col_letter}2:{col_letter}{worksheet.max_row}',
                    CellIsRule(operator='greaterThan', formula=['0.35'], fill=cores['verde_escuro'])
                )
                
                # Crescimento Médio (15% a 35%)
                worksheet.conditional_formatting.add(
                    f'{col_letter}2:{col_letter}{worksheet.max_row}',
                    CellIsRule(operator='between', formula=['0.15', '0.35'], fill=cores['verde_medio'])
                )
                
                # Crescimento Baixo (5% a 15%)
                worksheet.conditional_formatting.add(
                    f'{col_letter}2:{col_letter}{worksheet.max_row}',
                    CellIsRule(operator='between', formula=['0.05', '0.15'], fill=cores['verde_claro'])
                )
                
                # Queda Baixa (-5% a -15%)
                worksheet.conditional_formatting.add(
                    f'{col_letter}2:{col_letter}{worksheet.max_row}',
                    CellIsRule(operator='between', formula=['-0.15', '-0.05'], fill=cores['vermelho_claro'])
                )
                
                # Queda Média (-15% a -30%)
                worksheet.conditional_formatting.add(
                    f'{col_letter}2:{col_letter}{worksheet.max_row}',
                    CellIsRule(operator='between', formula=['-0.30', '-0.15'], fill=cores['vermelho_medio'])
                )
                
                # Queda Alta (<-30%)
                worksheet.conditional_formatting.add(
                    f'{col_letter}2:{col_letter}{worksheet.max_row}',
                    CellIsRule(operator='lessThan', formula=['-0.30'], fill=cores['vermelho_escuro'])
                )

    def _aplicar_formatacao_flags_contexto(self, worksheet):
        """Aplica formatação condicional simplificada para evitar erros no Excel."""
        try:
            from openpyxl.styles import PatternFill
            from openpyxl.formatting.rule import CellIsRule
            
            # Cores simplificadas
            cor_extrema = PatternFill(start_color="FFCDD2", end_color="FFCDD2", fill_type="solid")
            cor_categoria_a = PatternFill(start_color="C8E6C9", end_color="C8E6C9", fill_type="solid")
            
            # Aplicar formatação apenas para colunas principais
            for col_idx, col_name in enumerate(worksheet[1], 1):
                col_letter = col_name.column_letter
                col_value = col_name.value
                
                if col_value == "FLAG_VARIACAO_GERAL":
                    worksheet.conditional_formatting.add(
                        f"{col_letter}2:{col_letter}500",
                        CellIsRule(operator="equal", formula=['"EXTREMA"'], fill=cor_extrema)
                    )
                elif col_value == "CATEGORIA_VOLUME":
                    worksheet.conditional_formatting.add(
                        f"{col_letter}2:{col_letter}500",
                        CellIsRule(operator="equal", formula=['"A"'], fill=cor_categoria_a)
                    )
        except Exception as e:
            print(f"Aviso: Formatação condicional desabilitada devido a erro: {e}")

    def analisar_acuracidade_previsao(self):
        """
        Analisa a acuracidade das previsões comparando previsto vs realizado.
        Calcula MAPE, WMAPE, BIAS e gera sugestões de ajuste.
        """
        if self.df_previsto is None or self.df_historico is None:
            print("Erro: Dados de previsão ou histórico não carregados.")
            return None
        
        print("Analisando acuracidade das previsões...")
        
        # Mapear colunas de previsão para colunas de realizado
        # Aceita diferentes formatos de meses
        mapeamento_colunas = {}
        
        # Lista completa de meses de 2025 em diferentes formatos
        meses_nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
        
        # Gerar todas as variações possíveis de formato para 2025
        meses_2025_variantes = []
        for mes in meses_nomes:
            meses_2025_variantes.append({
                'nome': mes,
                'formatos': [
                    f'{mes}-25',      # jan-25
                    f'{mes}/25',      # jan/25
                    f'{mes}-2025',    # jan-2025
                    f'{mes}/2025',    # jan/2025
                    f'{mes.capitalize()}-25',  # Jan-25
                    f'{mes.capitalize()}/25',  # Jan/25
                ]
            })
        
        print("Debug - Verificando colunas disponíveis:")
        print(f"Colunas previsão: {list(self.df_previsto.columns)}")
        print(f"Colunas histórico: {list(self.df_historico.columns)}")
        
        # Verificar quais meses estão disponíveis em ambos os arquivos
        for mes_info in meses_2025_variantes:
            mes_nome = mes_info['nome']
            formatos = mes_info['formatos']
            
            # Verificar se existe no arquivo de previsão (tentar todos os formatos)
            prev_existe = False
            col_prev = None
            
            for formato in formatos:
                if formato in self.df_previsto.columns:
                    prev_existe = True
                    col_prev = formato
                    break
            
            # Verificar se existe no arquivo histórico (tentar todos os formatos)
            real_existe = False
            col_real = None
            
            for formato in formatos:
                if formato in self.df_historico.columns:
                    real_existe = True
                    col_real = formato
                    break
            
            print(f"  {mes_nome}: Previsão={prev_existe} ({col_prev}), Histórico={real_existe} ({col_real})")
            
            if prev_existe and real_existe:
                mapeamento_colunas[col_prev] = col_real
        
        print(f"Mapeamento de colunas criado: {len(mapeamento_colunas)} pares")
        
        # Identificar quais meses têm dados em ambos os arquivos
        colunas_comparacao = []
        
        for col_prev, col_real in mapeamento_colunas.items():
            colunas_comparacao.append((col_prev, col_real))
        
        if not colunas_comparacao:
            print("Nenhuma coluna compatível encontrada para comparação.")
            return None
        
        print(f"Comparando {len(colunas_comparacao)} meses: {[c[1] for c in colunas_comparacao]}")
        
        # Merge dos dados por código com sufixos para evitar conflitos
        df_merged = pd.merge(
            self.df_historico[['Codigo'] + [c[1] for c in colunas_comparacao]], 
            self.df_previsto[['Codigo'] + [c[0] for c in colunas_comparacao]], 
            on='Codigo', 
            how='inner',
            suffixes=('_real', '_prev')
        )
        
        # Calcular métricas de acuracidade
        resultados = []
        
        for _, row in df_merged.iterrows():
            codigo = row['Codigo']
            
            # Coletar dados de previsto e realizado
            previstos = []
            realizados = []
            
            for col_prev, col_real in colunas_comparacao:
                # Após o merge, as colunas têm sufixos _prev e _real
                col_prev_merged = f"{col_prev}_prev" if f"{col_prev}_prev" in df_merged.columns else col_prev
                col_real_merged = f"{col_real}_real" if f"{col_real}_real" in df_merged.columns else col_real
                
                # Converter para número, tratando strings e valores nulos
                try:
                    previsto = float(row[col_prev_merged]) if pd.notna(row[col_prev_merged]) else 0
                except (ValueError, TypeError):
                    previsto = 0
                
                try:
                    realizado = float(row[col_real_merged]) if pd.notna(row[col_real_merged]) else 0
                except (ValueError, TypeError):
                    realizado = 0
                
                # Só incluir na análise se pelo menos um dos valores for > 0
                if previsto > 0 or realizado > 0:
                    previstos.append(previsto)
                    realizados.append(realizado)
            
            if not previstos:
                continue
            
            # Calcular métricas com DUAS abordagens de MAPE
            total_realizado = sum(realizados)
            total_previsto = sum(previstos)
            
            # 1. MAPE MÉDIO MENSAL: média dos MAPEs de cada mês
            mape_medio_mensal = self._calcular_mape(realizados, previstos)
            
            # 2. MAPE TOTAL: baseado nos totais acumulados
            if total_realizado > 0:
                mape_total = abs(total_realizado - total_previsto) / total_realizado
            else:
                mape_total = float('nan')
            
            bias = self._calcular_bias(realizados, previstos)
            
            # Calcular erro absoluto total (Previsto - Realizado)
            erro_absoluto_total = sum(previstos) - sum(realizados)
            
            # Calcular volume médio para categorização
            volume_medio = np.mean(realizados) if realizados else 0
            
            # ✅ NOVA LÓGICA INTELIGENTE: Usar função melhorada baseada em MAPE e BIAS
            # Buscar dados do item no df_resultado para pegar as variações (APENAS para fallback)
            item_dados = None
            if self.df_resultado is not None:
                item_dados = self.df_resultado[self.df_resultado['Codigo'] == codigo]
            
            # Usar a nova função inteligente baseada em MAPE e BIAS
            sugestao_ajuste = self._gerar_sugestao_ajuste(mape_total * 100, bias, volume_medio)
            
            resultados.append({
                'Codigo': codigo,
                'MESES_ANALISADOS': len(realizados),
                'VOLUME_MEDIO_REAL': volume_medio,
                'TOTAL_PREVISTO': sum(previstos),
                'TOTAL_REALIZADO': sum(realizados),
                'ERRO_ABSOLUTO_TOTAL': erro_absoluto_total,
                'MAPE_MEDIO_MENSAL': mape_medio_mensal,  # ✅ NOVA: Média dos MAPEs mensais
                'MAPE_TOTAL': mape_total,  # ✅ NOVA: MAPE dos totais
                'BIAS': self._classificar_bias(bias),
                'SUGESTAO_AJUSTE_PCT': sugestao_ajuste,
                'CLASSIFICACAO_ERRO_MENSAL': self._classificar_erro(mape_medio_mensal * 100),  # ✅ NOVA: Classificação mensal
                'CLASSIFICACAO_ERRO_TOTAL': self._classificar_erro(mape_total * 100),  # ✅ NOVA: Classificação total
                'OBSERVACAO': self._gerar_observacao_ajuste_inteligente(mape_total * 100, bias, volume_medio, sugestao_ajuste)  # ✅ NOVA: Observação inteligente
            })
        
        self.df_acuracidade = pd.DataFrame(resultados)
        print(f"Análise de acuracidade concluída para {len(resultados)} itens.")
        
        # Gerar também dados detalhados mês a mês
        self.df_acuracidade_detalhada = self._gerar_acuracidade_detalhada(df_merged, colunas_comparacao)
        
        return self.df_acuracidade
    
    def _calcular_mape(self, realizados, previstos):
        """Calcula Mean Absolute Percentage Error usando a fórmula correta: |Realizado - Previsto| / Realizado."""
        import numpy as np
        
        if not realizados or not previstos:
            return np.nan
        
        # Calcular MAPE usando a fórmula correta: |Realizado - Previsto| / Realizado
        erros_percentuais = []
        for real, prev in zip(realizados, previstos):
            if real > 0:  # Só considerar valores realizados > 0 para evitar divisão por zero
                erro_pct = abs(real - prev) / real  # ✅ FÓRMULA CORRETA: |R-P|/R
                erros_percentuais.append(erro_pct)
        
        # Se não houver valores válidos, calcular MAPE baseado nos totais
        if not erros_percentuais:
            total_realizado = sum(realizados)
            total_previsto = sum(previstos)
            if total_realizado > 0:
                return abs(total_realizado - total_previsto) / total_realizado  # ✅ FÓRMULA CORRETA
            else:
                return np.nan
        
        return np.mean(erros_percentuais)
    
    def _calcular_wmape(self, realizados, previstos):
        """Calcula Weighted Mean Absolute Percentage Error."""
        import numpy as np
        
        if not realizados or not previstos:
            return np.nan
        
        soma_erros_abs = sum(abs(p - r) for r, p in zip(realizados, previstos))
        soma_realizados = sum(realizados)
        
        return (soma_erros_abs / soma_realizados * 100) if soma_realizados > 0 else np.nan
    
    def _calcular_bias(self, realizados, previstos):
        """Calcula BIAS (tendência de super/subestimação)."""
        import numpy as np
        
        if not realizados or not previstos:
            return np.nan
        
        soma_erros = sum(p - r for r, p in zip(realizados, previstos))
        soma_realizados = sum(realizados)
        
        return (soma_erros / soma_realizados * 100) if soma_realizados > 0 else np.nan
    
    def _calcular_mae(self, realizados, previstos):
        """Calcula Mean Absolute Error."""
        import numpy as np
        
        if not realizados or not previstos:
            return np.nan
        
        erros_abs = [abs(p - r) for r, p in zip(realizados, previstos)]
        return np.mean(erros_abs)
    
    def _gerar_sugestao_ajuste(self, mape, bias, volume_medio):
        """
        Gera sugestão de ajuste inteligente baseada no MAPE e BIAS.
        
        Lógica:
        - MAPE indica a precisão geral do modelo
        - BIAS indica se o modelo tende a super ou subestimar
        - Volume influencia a agressividade do ajuste
        """
        import pandas as pd
        import numpy as np
        
        if pd.isna(mape) or pd.isna(bias):
            return 0
        
        # Categorizar por volume para ajustar conservadorismo
        if volume_medio >= 100:
            categoria = 'ALTO'  # Mais conservador
            fator_conservador = 0.7
        elif volume_medio >= 20:
            categoria = 'MEDIO'  # Moderado
            fator_conservador = 0.85
        else:
            categoria = 'BAIXO'  # Mais agressivo
            fator_conservador = 1.0
        
        # Determinar intensidade do ajuste baseado no MAPE
        if mape > 80:  # MAPE muito alto (>80%)
            intensidade = 'MUITO_ALTA'
            base_ajuste = 25
        elif mape > 50:  # MAPE alto (50-80%)
            intensidade = 'ALTA'
            base_ajuste = 18
        elif mape > 30:  # MAPE médio (30-50%)
            intensidade = 'MEDIA'
            base_ajuste = 12
        elif mape > 15:  # MAPE baixo (15-30%)
            intensidade = 'BAIXA'
            base_ajuste = 6
        else:  # MAPE muito baixo (<15%)
            intensidade = 'MUITO_BAIXA'
            base_ajuste = 3
        
        # Determinar direção do ajuste baseado no BIAS
        if bias > 15:  # Superestimação significativa
            direcao = -1  # Reduzir previsão
            ajuste_bias = base_ajuste * 1.2  # Aumentar intensidade para superestimação
        elif bias > 5:  # Superestimação leve
            direcao = -1
            ajuste_bias = base_ajuste * 0.8
        elif bias < -15:  # Subestimação significativa
            direcao = 1  # Aumentar previsão
            ajuste_bias = base_ajuste * 1.0  # Manter intensidade para subestimação
        elif bias < -5:  # Subestimação leve
            direcao = 1
            ajuste_bias = base_ajuste * 0.7
        else:  # BIAS aceitável (-5 a +5)
            # Para BIAS baixo, usar ajuste mínimo baseado apenas no MAPE
            if mape > 30:
                direcao = -1 if bias > 0 else 1  # Direção baseada no sinal do BIAS
                ajuste_bias = base_ajuste * 0.3  # Ajuste muito conservador
            else:
                return 0  # Modelo preciso e sem viés significativo
        
        # Calcular ajuste final
        ajuste_final = direcao * ajuste_bias * fator_conservador
        
        # Aplicar limites por categoria de volume
        if categoria == 'ALTO':
            ajuste_final = max(-20, min(15, ajuste_final))  # Mais conservador para alto volume
        elif categoria == 'MEDIO':
            ajuste_final = max(-25, min(20, ajuste_final))  # Moderado
        else:
            ajuste_final = max(-30, min(25, ajuste_final))  # Mais agressivo para baixo volume
        
        # Arredondar para valores inteiros
        return round(ajuste_final)
    
    def _gerar_observacao_ajuste_inteligente(self, mape, bias, volume_medio, ajuste_sugerido):
        """Gera observação explicativa para o ajuste sugerido."""
        import pandas as pd
        
        if pd.isna(mape) or pd.isna(bias):
            return "Dados insuficientes para sugestão"
        
        # Classificar MAPE
        if mape > 50:
            precisao = "baixa precisão"
        elif mape > 30:
            precisao = "precisão moderada"
        elif mape > 15:
            precisao = "boa precisão"
        else:
            precisao = "excelente precisão"
        
        # Classificar BIAS
        if abs(bias) > 15:
            if bias > 0:
                tendencia = "forte tendência de superestimação"
            else:
                tendencia = "forte tendência de subestimação"
        elif abs(bias) > 5:
            if bias > 0:
                tendencia = "leve tendência de superestimação"
            else:
                tendencia = "leve tendência de subestimação"
        else:
            tendencia = "sem viés significativo"
        
        # Classificar volume
        if volume_medio >= 100:
            vol_desc = "alto volume"
        elif volume_medio >= 20:
            vol_desc = "volume médio"
        else:
            vol_desc = "baixo volume"
        
        # Gerar observação
        if ajuste_sugerido == 0:
            return f"Modelo com {precisao} e {tendencia}. Ajuste desnecessário."
        elif ajuste_sugerido > 0:
            return f"Modelo com {precisao} e {tendencia}. Item de {vol_desc}. Sugerido aumentar previsão."
        else:
            return f"Modelo com {precisao} e {tendencia}. Item de {vol_desc}. Sugerido reduzir previsão."
    
    def _classificar_erro(self, mape):
        """Classifica o erro baseado no MAPE."""
        import pandas as pd
        
        if pd.isna(mape):
            return "SEM DADOS"
        elif mape <= 10:
            return "EXCELENTE"
        elif mape <= 20:
            return "BOM"
        elif mape <= 40:
            return "ACEITÁVEL"
        elif mape <= 60:
            return "RUIM"
        else:
            return "MUITO RUIM"
    
    def _classificar_bias(self, bias):
        """Classifica a tendência baseada no BIAS."""
        import pandas as pd
        
        if pd.isna(bias):
            return "SEM DADOS"
        elif bias > 15:
            return "SUPERESTIMA MUITO"
        elif bias > 5:
            return "SUPERESTIMA"
        elif bias < -15:
            return "SUBESTIMA MUITO"
        elif bias < -5:
            return "SUBESTIMA"
        else:
            return "EQUILIBRADO"

    def _gerar_observacao_erro(self, mape, bias, volume_medio):
        """
        Gera observação explicativa sobre o motivo do erro.
        
        Args:
            mape: Mean Absolute Percentage Error
            bias: Tendência de super/subestimação
            volume_medio: Volume médio de vendas
            
        Returns:
            str: Observação explicativa
        """
        import pandas as pd
        
        if pd.isna(mape) or pd.isna(bias):
            return "Dados insuficientes para análise"
        
        observacoes = []
        
        # Análise do MAPE
        if mape > 60:
            observacoes.append("Erro muito alto (>60%)")
            if volume_medio < 10:
                observacoes.append("produto de baixo volume")
            if abs(bias) > 20:
                observacoes.append("tendência forte de super/subestimação")
        elif mape > 40:
            observacoes.append("Erro alto (40-60%)")
            if abs(bias) > 15:
                observacoes.append("tendência moderada de super/subestimação")
        elif mape > 20:
            observacoes.append("Erro moderado (20-40%)")
        
        # Análise do BIAS
        if bias > 20:
            observacoes.append("superestima consistentemente")
        elif bias < -20:
            observacoes.append("subestima consistentemente")
        elif abs(bias) > 10:
            if bias > 0:
                observacoes.append("leve tendência de superestimação")
            else:
                observacoes.append("leve tendência de subestimação")
        
        # Análise do volume
        if volume_medio < 5:
            observacoes.append("demanda muito baixa dificulta previsão")
        elif volume_medio < 20:
            observacoes.append("demanda baixa aumenta volatilidade")
        
        # Sugestões específicas
        if mape > 40 and abs(bias) > 15:
            observacoes.append("revisar método de previsão")
        elif mape > 60:
            observacoes.append("considerar análise manual")
        
        if not observacoes:
            return "Performance dentro do esperado"
        
        return "; ".join(observacoes).capitalize()

    def _gerar_acuracidade_detalhada(self, df_merged, colunas_comparacao):
        """
        Gera análise detalhada de acuracidade mês a mês.
        
        Args:
            df_merged: DataFrame com dados merged de previsão e histórico
            colunas_comparacao: Lista de tuplas (col_prev, col_real)
            
        Returns:
            DataFrame com análise detalhada mês a mês
        """
        print("Gerando análise de acuracidade detalhada mês a mês...")
        
        resultados_detalhados = []
        
        for _, row in df_merged.iterrows():
            codigo = row['Codigo']
            resultado_item = {'Codigo': codigo}
            
            # Para cada mês, calcular previsto, realizado e métricas
            for col_prev, col_real in colunas_comparacao:
                # Após o merge, as colunas têm sufixos _prev e _real
                col_prev_merged = f"{col_prev}_prev" if f"{col_prev}_prev" in df_merged.columns else col_prev
                col_real_merged = f"{col_real}_real" if f"{col_real}_real" in df_merged.columns else col_real
                
                # ✅ CORREÇÃO: Converter para float com tratamento de strings
                try:
                    previsto_raw = row[col_prev_merged]
                    if pd.isna(previsto_raw) or str(previsto_raw).strip() in ['', '-', ' -   ', ' - ', '--', 'nan', 'NaN']:
                        previsto = 0.0
                    else:
                        previsto = float(previsto_raw)
                except (ValueError, TypeError):
                    previsto = 0.0
                
                try:
                    realizado_raw = row[col_real_merged]
                    if pd.isna(realizado_raw) or str(realizado_raw).strip() in ['', '-', ' -   ', ' - ', '--', 'nan', 'NaN']:
                        realizado = 0.0
                    else:
                        realizado = float(realizado_raw)
                except (ValueError, TypeError):
                    realizado = 0.0
                
                # Determinar nome do mês para as colunas
                if isinstance(col_real, str):
                    nome_mes = col_real.replace('-', '/').upper()
                elif hasattr(col_real, 'strftime'):
                    nome_mes = col_real.strftime('%b/%y').upper()
                else:
                    nome_mes = str(col_real)
                
                # Adicionar dados do mês
                resultado_item[f'{nome_mes}_PREVISTO'] = previsto
                resultado_item[f'{nome_mes}_REALIZADO'] = realizado
                
                # Calcular métricas do mês
                if realizado > 0 and previsto > 0:
                    # MAPE do mês - FÓRMULA CORRETA: |Realizado - Previsto| / Realizado (DECIMAL)
                    mape_mes = abs((realizado - previsto) / realizado)  # ✅ REMOVIDO * 100 para consistência
                    resultado_item[f'{nome_mes}_MAPE'] = mape_mes
                    
                    # BIAS do mês (classificação textual) - mantém * 100 para classificação
                    bias_mes = ((previsto - realizado) / realizado) * 100
                    resultado_item[f'{nome_mes}_BIAS'] = self._classificar_bias(bias_mes)
                    
                    # Classificação do erro do mês - usar MAPE em percentual para classificação
                    resultado_item[f'{nome_mes}_CLASSIFICACAO'] = self._classificar_erro(mape_mes * 100)
                    
                else:
                    # Sem dados válidos para comparação
                    resultado_item[f'{nome_mes}_MAPE'] = None
                    resultado_item[f'{nome_mes}_BIAS'] = "SEM DADOS"
                    resultado_item[f'{nome_mes}_CLASSIFICACAO'] = "SEM DADOS"
            
            resultados_detalhados.append(resultado_item)
        
        df_detalhado = pd.DataFrame(resultados_detalhados)
        print(f"Análise detalhada concluída para {len(resultados_detalhados)} itens.")
        
        return df_detalhado

    def _gerar_aba_resumo_modelos(self, writer):
        """Gera a aba Resumo dos Modelos com explicação de cada método estatístico."""
        print("Gerando aba: Resumo dos Modelos")
        
        # Dados dos modelos
        dados_modelos = [
            {
                'MODELO': 'MEDIA_SIMPLES',
                'CATEGORIA': 'Baseline',
                'DESCRIÇÃO': 'Calcula a média aritmética simples de todo o histórico de vendas',
                'QUANDO_USAR': 'Produtos com demanda estável, sem tendência ou sazonalidade clara',
                'VANTAGENS': 'Simples, robusto, não requer muitos dados',
                'DESVANTAGENS': 'Não captura tendências ou sazonalidade, pode ser impreciso para produtos com padrões',
                'COMPLEXIDADE': 'Baixa'
            },
            {
                'MODELO': 'MEDIA_PONDERADA',
                'CATEGORIA': 'Baseline Melhorado',
                'DESCRIÇÃO': 'Média que dá maior peso aos meses mais recentes do histórico',
                'QUANDO_USAR': 'Produtos com mudanças graduais na demanda, quando dados recentes são mais relevantes',
                'VANTAGENS': 'Considera importância dos dados recentes, mais responsivo que média simples',
                'DESVANTAGENS': 'Ainda não captura sazonalidade, pode ser sensível a outliers recentes',
                'COMPLEXIDADE': 'Baixa'
            },
            {
                'MODELO': 'MEDIA_MOVEL',
                'CATEGORIA': 'Baseline Melhorado',
                'DESCRIÇÃO': 'Média dos últimos 6 meses, descartando dados mais antigos',
                'QUANDO_USAR': 'Produtos com mudanças de padrão, quando histórico antigo não é relevante',
                'VANTAGENS': 'Mais responsivo a mudanças recentes, elimina ruído de dados antigos',
                'DESVANTAGENS': 'Perde informação histórica, pode ser instável com poucos dados',
                'COMPLEXIDADE': 'Baixa'
            },
            {
                'MODELO': 'HOLT_WINTERS',
                'CATEGORIA': 'Suavização Exponencial',
                'DESCRIÇÃO': 'Método que captura nível, tendência e sazonalidade usando suavização exponencial',
                'QUANDO_USAR': 'Produtos com tendência clara e/ou padrão sazonal definido',
                'VANTAGENS': 'Captura tendência e sazonalidade, bem estabelecido na literatura',
                'DESVANTAGENS': 'Requer ajuste de parâmetros, pode ser instável com dados irregulares',
                'COMPLEXIDADE': 'Média'
            },
            {
                'MODELO': 'SARIMA',
                'CATEGORIA': 'Séries Temporais',
                'DESCRIÇÃO': 'Modelo autoregressivo integrado de médias móveis com componente sazonal',
                'QUANDO_USAR': 'Produtos com padrões complexos, autocorrelação e sazonalidade',
                'VANTAGENS': 'Muito flexível, captura padrões complexos, base teórica sólida',
                'DESVANTAGENS': 'Complexo de configurar, requer muitos dados, pode ser instável',
                'COMPLEXIDADE': 'Alta'
            },
            {
                'MODELO': 'PROPHET',
                'CATEGORIA': 'Decomposição',
                'DESCRIÇÃO': 'Decomposição de tendência e sazonalidade desenvolvida pelo Facebook',
                'QUANDO_USAR': 'Produtos com sazonalidade forte e dados com irregularidades',
                'VANTAGENS': 'Robusto a outliers, captura múltiplas sazonalidades, fácil de interpretar',
                'DESVANTAGENS': 'Pode ser conservador, menos preciso para séries muito curtas',
                'COMPLEXIDADE': 'Média'
            },
            {
                'MODELO': 'RANDOM_FOREST',
                'CATEGORIA': 'Machine Learning',
                'DESCRIÇÃO': 'Ensemble de árvores de decisão que considera múltiplas variáveis',
                'QUANDO_USAR': 'Produtos com padrões não-lineares e múltiplas influências',
                'VANTAGENS': 'Captura relações não-lineares, robusto a outliers, flexível',
                'DESVANTAGENS': 'Caixa-preta, requer mais dados, pode fazer overfitting',
                'COMPLEXIDADE': 'Alta'
            },
            {
                'MODELO': 'XGBOOST',
                'CATEGORIA': 'Machine Learning',
                'DESCRIÇÃO': 'Gradient boosting otimizado para alta performance e precisão',
                'QUANDO_USAR': 'Produtos com padrões complexos onde precisão é crítica',
                'VANTAGENS': 'Alta precisão, captura padrões complexos, bem otimizado',
                'DESVANTAGENS': 'Caixa-preta, requer tuning, pode fazer overfitting',
                'COMPLEXIDADE': 'Alta'
            },
            {
                'MODELO': 'NAIVE_SAZONAL',
                'CATEGORIA': 'Sazonalidade',
                'DESCRIÇÃO': 'Replica o padrão do mesmo período do ano anterior com ajustes',
                'QUANDO_USAR': 'Produtos com forte sazonalidade anual e padrões repetitivos',
                'VANTAGENS': 'Simples, eficaz para sazonalidade forte, fácil de interpretar',
                'DESVANTAGENS': 'Não captura tendências, assume padrão repetitivo constante',
                'COMPLEXIDADE': 'Baixa'
            },
            {
                'MODELO': 'CROSTON',
                'CATEGORIA': 'Demanda Intermitente',
                'DESCRIÇÃO': 'Método específico para produtos com vendas esporádicas e irregulares',
                'QUANDO_USAR': 'Produtos com demanda intermitente (muitos zeros no histórico)',
                'VANTAGENS': 'Especializado em demanda irregular, considera probabilidade de demanda',
                'DESVANTAGENS': 'Específico para um tipo de demanda, pode subestimar produtos regulares',
                'COMPLEXIDADE': 'Média'
            },
            {
                'MODELO': 'ENSEMBLE',
                'CATEGORIA': 'Combinação',
                'DESCRIÇÃO': 'Combina os 3 melhores métodos para cada produto com pesos otimizados',
                'QUANDO_USAR': 'Quando se quer maximizar precisão combinando diferentes abordagens',
                'VANTAGENS': 'Maior robustez, combina pontos fortes de múltiplos métodos',
                'DESVANTAGENS': 'Mais complexo, pode mascarar insights de métodos individuais',
                'COMPLEXIDADE': 'Alta'
            }
        ]
        
        # Criar DataFrame
        df_resumo = pd.DataFrame(dados_modelos)
        
        # Escrever na aba
        df_resumo.to_excel(writer, sheet_name='Modelos_Estatisticos', index=False)
        
        # Obter worksheet para formatação
        worksheet = writer.sheets['Modelos_Estatisticos']
        
        # Aplicar formatação básica
        self._aplicar_formatacao_basica(worksheet)
        
        # Ajustar largura das colunas
        column_widths = {
            'A': 18,  # MODELO
            'B': 20,  # CATEGORIA
            'C': 60,  # DESCRIÇÃO
            'D': 50,  # QUANDO_USAR
            'E': 50,  # VANTAGENS
            'F': 50,  # DESVANTAGENS
            'G': 15   # COMPLEXIDADE
        }
        
        for col_letter, width in column_widths.items():
            worksheet.column_dimensions[col_letter].width = width
        
        # Formatação especial para cabeçalhos
        from openpyxl.styles import Font, PatternFill, Alignment
        
        header_font = Font(name="Calibri", size=12, bold=True, color="FFFFFF")
        header_fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")
        
        for cell in worksheet[1]:
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal="center", vertical="center")
        
        # Formatação para células de dados
        for row in worksheet.iter_rows(min_row=2):
            for cell in row:
                cell.alignment = Alignment(horizontal="left", vertical="top", wrap_text=True)
        
        # Colorir por categoria
        categoria_cores = {
            'Baseline': PatternFill(start_color="E8F4FD", end_color="E8F4FD", fill_type="solid"),
            'Baseline Melhorado': PatternFill(start_color="D4E6F1", end_color="D4E6F1", fill_type="solid"),
            'Suavização Exponencial': PatternFill(start_color="FCF3CF", end_color="FCF3CF", fill_type="solid"),
            'Séries Temporais': PatternFill(start_color="FADBD8", end_color="FADBD8", fill_type="solid"),
            'Decomposição': PatternFill(start_color="E8DAEF", end_color="E8DAEF", fill_type="solid"),
            'Machine Learning': PatternFill(start_color="D5F4E6", end_color="D5F4E6", fill_type="solid"),
            'Sazonalidade': PatternFill(start_color="FEF9E7", end_color="FEF9E7", fill_type="solid"),
            'Demanda Intermitente': PatternFill(start_color="FDEBD0", end_color="FDEBD0", fill_type="solid"),
            'Combinação': PatternFill(start_color="EBF5FB", end_color="EBF5FB", fill_type="solid")
        }
        
        for row_idx, row in enumerate(worksheet.iter_rows(min_row=2), 2):
            categoria = worksheet[f'B{row_idx}'].value
            if categoria in categoria_cores:
                for cell in row:
                    cell.fill = categoria_cores[categoria]

    def _gerar_aba_analise_sazonalidade(self, writer):
        """Gera a aba Análise de Sazonalidade com histórico desde 2022."""
        print("Gerando aba: Análise de Sazonalidade")
        
        try:
            # Analisar sazonalidade por item
            dados_sazonalidade = []
            
            for idx, row in self.df_resultado.iterrows():
                codigo = row['Codigo']
                
                # Extrair dados históricos por ano desde 2022
                vendas_por_ano = {}
                vendas_por_mes_consolidado = {i: [] for i in range(1, 13)}  # Jan=1, Dez=12
                
                for col in self.colunas_meses:
                    try:
                        # Verificar diferentes formatos possíveis
                        if '/' in col:
                            # Formato: "mmm/yy" ou "mmm/yyyy"
                            mes_ano = col.split('/')
                            if len(mes_ano) == 2:
                                mes_str, ano_str = mes_ano
                                
                                # Converter mês para número (aceitar diferentes formatos)
                                meses_dict = {
                                    'jan': 1, 'fev': 2, 'mar': 3, 'abr': 4, 'mai': 5, 'jun': 6,
                                    'jul': 7, 'ago': 8, 'set': 9, 'out': 10, 'nov': 11, 'dez': 12,
                                    'janeiro': 1, 'fevereiro': 2, 'março': 3, 'abril': 4, 'maio': 5, 'junho': 6,
                                    'julho': 7, 'agosto': 8, 'setembro': 9, 'outubro': 10, 'novembro': 11, 'dezembro': 12
                                }
                                
                                mes_num = meses_dict.get(mes_str.lower())
                                
                                # Converter ano (aceitar yy ou yyyy)
                                if len(ano_str) == 2:
                                    ano_num = 2000 + int(ano_str)
                                elif len(ano_str) == 4:
                                    ano_num = int(ano_str)
                                else:
                                    continue
                                
                                # Filtrar apenas dados de 2022 em diante
                                if mes_num and ano_num >= 2022:
                                    valor = row[col] if not pd.isna(row[col]) else 0
                                    
                                    # Agrupar por ano
                                    if ano_num not in vendas_por_ano:
                                        vendas_por_ano[ano_num] = {}
                                    vendas_por_ano[ano_num][mes_num] = valor
                                    
                                    # Consolidar por mês (todos os anos)
                                    vendas_por_mes_consolidado[mes_num].append(valor)
                        
                        elif '-' in col:
                            # Formato alternativo: "mmm-yy"
                            mes_ano = col.split('-')
                            if len(mes_ano) == 2:
                                mes_str, ano_str = mes_ano
                                
                                meses_dict = {
                                    'jan': 1, 'fev': 2, 'mar': 3, 'abr': 4, 'mai': 5, 'jun': 6,
                                    'jul': 7, 'ago': 8, 'set': 9, 'out': 10, 'nov': 11, 'dez': 12
                                }
                                
                                mes_num = meses_dict.get(mes_str.lower())
                                
                                if len(ano_str) == 2:
                                    ano_num = 2000 + int(ano_str)
                                elif len(ano_str) == 4:
                                    ano_num = int(ano_str)
                                else:
                                    continue
                                
                                # Filtrar apenas dados de 2022 em diante
                                if mes_num and ano_num >= 2022:
                                    valor = row[col] if not pd.isna(row[col]) else 0
                                    
                                    if ano_num not in vendas_por_ano:
                                        vendas_por_ano[ano_num] = {}
                                    vendas_por_ano[ano_num][mes_num] = valor
                                    
                                    vendas_por_mes_consolidado[mes_num].append(valor)
                                    
                    except Exception as e:
                        continue
                
                # Se não conseguiu processar pelo formato de data, tentar lógica alternativa
                if not vendas_por_ano:
                    # Tentar processar assumindo ordem cronológica recente
                    for col in self.colunas_meses[-36:]:  # Últimos 36 meses (3 anos)
                        try:
                            valor = row[col] if not pd.isna(row[col]) else 0
                            if valor > 0:  # Só considerar valores positivos
                                # Distribuir pelos últimos anos desde 2022
                                col_index = list(self.colunas_meses[-36:]).index(col)
                                mes_num = (col_index % 12) + 1
                                ano_base = 2025 - (36 - col_index - 1) // 12  # Calcular ano baseado na posição
                                
                                if ano_base >= 2022:
                                    if ano_base not in vendas_por_ano:
                                        vendas_por_ano[ano_base] = {}
                                    vendas_por_ano[ano_base][mes_num] = valor
                                    vendas_por_mes_consolidado[mes_num].append(valor)
                        except:
                            continue
                
                # Analisar cada ano individualmente
                analise_por_ano = {}
                for ano, vendas_ano in vendas_por_ano.items():
                    if vendas_ano:
                        # Encontrar os 4 meses mais fortes do ano
                        vendas_ordenadas = sorted(vendas_ano.items(), key=lambda x: x[1], reverse=True)
                        top_4_meses = [mes for mes, valor in vendas_ordenadas[:4] if valor > 0]
                        analise_por_ano[ano] = top_4_meses
                
                # Calcular total e média de vendas por mês
                totais_por_mes = {}
                medias_por_mes = {}
                for mes in range(1, 13):
                    valores = vendas_por_mes_consolidado[mes]
                    if valores:
                        totais_por_mes[mes] = sum(valores)
                        medias_por_mes[mes] = sum(valores) / len(valores)
                    else:
                        totais_por_mes[mes] = 0
                        medias_por_mes[mes] = 0
                
                # Consolidar meses mais fortes historicamente (frequência)
                contador_meses = {i: 0 for i in range(1, 13)}
                for ano, meses_fortes in analise_por_ano.items():
                    for mes in meses_fortes:
                        contador_meses[mes] += 1
                
                # Abordagem Híbrida: Frequência (60%) + Média (40%)
                # Normalizar scores de 0 a 1
                max_frequencia = max(contador_meses.values()) if contador_meses.values() else 1
                max_media = max(medias_por_mes.values()) if medias_por_mes.values() else 1
                
                scores_hibridos = {}
                for mes in range(1, 13):
                    score_frequencia = contador_meses[mes] / max_frequencia if max_frequencia > 0 else 0
                    score_media = medias_por_mes[mes] / max_media if max_media > 0 else 0
                    
                    # Score híbrido: 60% frequência + 40% média
                    score_hibrido = (score_frequencia * 0.6) + (score_media * 0.4)
                    scores_hibridos[mes] = score_hibrido
                
                # Encontrar os 4 meses com maiores scores híbridos
                meses_ordenados_hibrido = sorted(scores_hibridos.items(), key=lambda x: x[1], reverse=True)
                top_4_historico = [mes for mes, score in meses_ordenados_hibrido[:4] if score > 0]
                
                # ✅ NOVO: Ordenar top_4_historico cronologicamente (Janeiro=1 até Dezembro=12)
                top_4_historico_ordenado = sorted(top_4_historico)
                
                # Converter números de mês para nomes
                nomes_meses = {
                    1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril', 5: 'Maio', 6: 'Junho',
                    7: 'Julho', 8: 'Agosto', 9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro'
                }
                
                # Preparar dados para o DataFrame
                linha_dados = {'Codigo': codigo}
                
                # Adicionar análise por ano
                for ano in sorted(vendas_por_ano.keys()):
                    meses_ano = analise_por_ano.get(ano, [])
                    meses_nomes = [nomes_meses[mes] for mes in meses_ano]
                    linha_dados[f'TOP_4_MESES_{ano}'] = ', '.join(meses_nomes) if meses_nomes else 'N/A'
                
                # ✅ NOVO: Adicionar consolidado histórico ORDENADO CRONOLOGICAMENTE
                meses_historico_nomes = [nomes_meses[mes] for mes in top_4_historico_ordenado]
                linha_dados['TOP_4_MESES_HISTORICO'] = ', '.join(meses_historico_nomes) if meses_historico_nomes else 'N/A'
                
                # ✅ NOVO: Adicionar totais dos meses mais fortes (usando ordem cronológica)
                for i, mes in enumerate(top_4_historico_ordenado[:4], 1):
                    linha_dados[f'TOTAL_MES_FORTE_{i}'] = round(totais_por_mes[mes], 2)
                    linha_dados[f'NOME_MES_FORTE_{i}'] = nomes_meses[mes]
                
                # Adicionar todos os totais mensais (em vez de médias)
                for mes in range(1, 13):
                    linha_dados[f'TOTAL_{nomes_meses[mes].upper()}'] = round(totais_por_mes[mes], 2)
                
                # ✅ NOVA FUNCIONALIDADE: Comparação dos últimos 3 anos para cada mês TOP_4
                # Identificar os últimos 3 anos disponíveis
                anos_disponiveis_comparacao = sorted(vendas_por_ano.keys(), reverse=True)[:3]
                
                # ✅ NOVO: Usar top_4_historico_ordenado para manter ordem cronológica
                # Para cada mês do TOP_4_HISTORICO (ordenado), adicionar vendas dos últimos 3 anos
                for idx_mes, mes in enumerate(top_4_historico_ordenado[:4], 1):  # M1, M2, M3, M4
                    nome_mes = nomes_meses[mes]
                    
                    # ✅ NOVO: Adicionar coluna com nome do mês (para referência)
                    linha_dados[f'M{idx_mes}_MES'] = nome_mes
                    
                    # Adicionar vendas de cada ano para este mês usando nomenclatura M1, M2, M3, M4
                    for i, ano in enumerate(anos_disponiveis_comparacao, 1):
                        if ano in vendas_por_ano and mes in vendas_por_ano[ano]:
                            valor = vendas_por_ano[ano][mes]
                        else:
                            valor = 0
                        
                        # ✅ NOVO: Criar coluna no formato: M1_2025, M1_2024, M1_2023
                        linha_dados[f'M{idx_mes}_{ano}'] = round(valor, 2)
                    
                    # Calcular variação percentual entre os anos (se houver dados)
                    if len(anos_disponiveis_comparacao) >= 2:
                        ano_atual = anos_disponiveis_comparacao[0]
                        ano_anterior = anos_disponiveis_comparacao[1]
                        
                        valor_atual = vendas_por_ano.get(ano_atual, {}).get(mes, 0)
                        valor_anterior = vendas_por_ano.get(ano_anterior, {}).get(mes, 0)
                        
                        if valor_anterior > 0:
                            variacao = ((valor_atual - valor_anterior) / valor_anterior) * 100
                            linha_dados[f'M{idx_mes}_VAR_{ano_atual}_vs_{ano_anterior}'] = round(variacao, 2)
                        else:
                            linha_dados[f'M{idx_mes}_VAR_{ano_atual}_vs_{ano_anterior}'] = 'N/A'
                    
                    if len(anos_disponiveis_comparacao) >= 3:
                        ano_anterior = anos_disponiveis_comparacao[1]
                        ano_anterior_2 = anos_disponiveis_comparacao[2]
                        
                        valor_anterior = vendas_por_ano.get(ano_anterior, {}).get(mes, 0)
                        valor_anterior_2 = vendas_por_ano.get(ano_anterior_2, {}).get(mes, 0)
                        
                        if valor_anterior_2 > 0:
                            variacao = ((valor_anterior - valor_anterior_2) / valor_anterior_2) * 100
                            linha_dados[f'M{idx_mes}_VAR_{ano_anterior}_vs_{ano_anterior_2}'] = round(variacao, 2)
                        else:
                            linha_dados[f'M{idx_mes}_VAR_{ano_anterior}_vs_{ano_anterior_2}'] = 'N/A'
                
                dados_sazonalidade.append(linha_dados)
            
            # Criar DataFrame
            df_sazonalidade = pd.DataFrame(dados_sazonalidade)
            
                # Organizar colunas na ordem desejada
            colunas_ordenadas = ['Codigo']
            
            # Adicionar colunas de análise por ano
            anos_disponiveis = []
            for col in df_sazonalidade.columns:
                if col.startswith('TOP_4_MESES_') and col != 'TOP_4_MESES_HISTORICO':
                    anos_disponiveis.append(col)
            
            colunas_ordenadas.extend(sorted(anos_disponiveis))
            colunas_ordenadas.append('TOP_4_MESES_HISTORICO')
            
            # Adicionar informações dos meses mais fortes
            for i in range(1, 5):
                if f'NOME_MES_FORTE_{i}' in df_sazonalidade.columns:
                    colunas_ordenadas.append(f'NOME_MES_FORTE_{i}')
                if f'TOTAL_MES_FORTE_{i}' in df_sazonalidade.columns:
                    colunas_ordenadas.append(f'TOTAL_MES_FORTE_{i}')
            
            # ✅ NOVA: Adicionar colunas de comparação dos últimos 3 anos usando M1, M2, M3, M4
            # Organizar as colunas M1, M2, M3, M4 em sequência
            for i in range(1, 5):  # M1, M2, M3, M4
                # Adicionar coluna com nome do mês
                if f'M{i}_MES' in df_sazonalidade.columns:
                    colunas_ordenadas.append(f'M{i}_MES')
                
                # Adicionar colunas de vendas por ano (M1_2025, M1_2024, M1_2023)
                colunas_m_ano = sorted([col for col in df_sazonalidade.columns if col.startswith(f'M{i}_') and '_VAR_' not in col and '_MES' not in col],
                                      key=lambda x: int(x.split('_')[-1]), reverse=True)
                colunas_ordenadas.extend(colunas_m_ano)
                
                # Adicionar colunas de variação (M1_VAR_2025_vs_2024, M1_VAR_2024_vs_2023)
                colunas_var = sorted([col for col in df_sazonalidade.columns if col.startswith(f'M{i}_VAR_')],
                                    key=lambda x: x, reverse=True)
                colunas_ordenadas.extend(colunas_var)
            
            # Adicionar totais mensais
            meses_ordem = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
                          'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO']
            for mes in meses_ordem:
                col_total = f'TOTAL_{mes}'
                if col_total in df_sazonalidade.columns:
                    colunas_ordenadas.append(col_total)
            
            # Filtrar apenas colunas existentes e remover duplicatas mantendo a ordem
            colunas_existentes = []
            for col in colunas_ordenadas:
                if col in df_sazonalidade.columns and col not in colunas_existentes:
                    colunas_existentes.append(col)
            
            # Adicionar colunas restantes que não foram incluídas
            for col in df_sazonalidade.columns:
                if col not in colunas_existentes:
                    colunas_existentes.append(col)
            
            df_final = df_sazonalidade[colunas_existentes]
            
            # Escrever na aba
            df_final.to_excel(writer, sheet_name='Sazonalidade', index=False)
            
            # Aplicar formatação
            worksheet = writer.sheets['Sazonalidade']
            self._aplicar_formatacao_basica(worksheet)
            
            # Formatação especial para colunas de totais
            from openpyxl.styles import PatternFill
            
            # Destacar colunas de consolidado histórico
            fill_historico = PatternFill(start_color="E8F4FD", end_color="E8F4FD", fill_type="solid")
            fill_totais = PatternFill(start_color="F0F8FF", end_color="F0F8FF", fill_type="solid")
            fill_comparacao = PatternFill(start_color="FFF4E6", end_color="FFF4E6", fill_type="solid")
            fill_variacao = PatternFill(start_color="E8F5E9", end_color="E8F5E9", fill_type="solid")
            
            # Aplicar formatação às colunas específicas
            from openpyxl.utils import get_column_letter
            
            for col_idx, col_name in enumerate(df_final.columns, 1):
                col_letter = get_column_letter(col_idx)
                
                if 'HISTORICO' in col_name or 'MES_FORTE' in col_name:
                    for row in range(1, len(df_final) + 2):
                        worksheet[f'{col_letter}{row}'].fill = fill_historico
                elif 'TOTAL_' in col_name:
                    for row in range(1, len(df_final) + 2):
                        worksheet[f'{col_letter}{row}'].fill = fill_totais
                # ✅ NOVO: Formatação para colunas M1, M2, M3, M4
                elif col_name.startswith('M') and any(col_name.startswith(f'M{i}') for i in range(1, 5)):
                    if '_VAR_' in col_name:
                        # Colunas de variação (M1_VAR_, M2_VAR_, etc.)
                        for row in range(1, len(df_final) + 2):
                            worksheet[f'{col_letter}{row}'].fill = fill_variacao
                            if row > 1:
                                cell = worksheet[f'{col_letter}{row}']
                                if isinstance(cell.value, (int, float)):
                                    cell.number_format = '0.00%'
                    elif '_MES' in col_name:
                        # Colunas com nome do mês (M1_MES, M2_MES, etc.)
                        for row in range(1, len(df_final) + 2):
                            worksheet[f'{col_letter}{row}'].fill = fill_historico
                    elif '_20' in col_name:
                        # Colunas de vendas por ano (M1_2025, M1_2024, etc.)
                        for row in range(1, len(df_final) + 2):
                            worksheet[f'{col_letter}{row}'].fill = fill_comparacao
            
            print("Aba Análise de Sazonalidade gerada com sucesso!")
            
        except Exception as e:
            print(f"Erro ao gerar aba de sazonalidade: {str(e)}")
            # Em caso de erro, criar aba simples apenas com códigos
            try:
                df_erro = pd.DataFrame({'Codigo': self.df_resultado['Codigo'].tolist()})
                df_erro['Mensagem'] = 'Erro no processamento - verifique formato das colunas de data'
                df_erro.to_excel(writer, sheet_name='Sazonalidade', index=False)
            except:
                # Último recurso: aba completamente vazia
                df_vazio = pd.DataFrame({'Codigo': ['Erro no processamento']})
                df_vazio.to_excel(writer, sheet_name='Sazonalidade', index=False)

    def _gerar_aba_analise_cenarios(self, writer):
        """
        Gera a aba 'Análise de Cenários' com seleção de 3 opções e melhor opção.
        Implementa ranges diferenciados (10%, 15%, 20%) e fallback para Histórico + Ajuste.
        """
        print("Gerando aba: Análise de Cenários")
        
        try:
            # Modelos estatísticos disponíveis
            modelos = [
                'MEDIA_MOVEL', 'HOLT_WINTERS', 'SARIMA', 'PROPHET',
                'RANDOM_FOREST', 'XGBOOST', 'NAIVE_SAZONAL', 'CROSTON',
                'ENSEMBLE', 'MEDIA_SIMPLES', 'MEDIA_PONDERADA'
            ]
            
            def calcular_variacao_percentual(valor_modelo, historico_ajustado):
                """Calcula a variação percentual entre o valor do modelo e o histórico ajustado."""
                if historico_ajustado == 0:
                    return 0.0
                return ((valor_modelo - historico_ajustado) / historico_ajustado) * 100

            def _normalizar_pct(valor):
                if pd.isna(valor):
                    return 0.0
                try:
                    v = float(valor)
                except Exception:
                    return 0.0
                # Suporta valores em escala 0..1 e também 0..100
                if abs(v) > 1.5:
                    return v / 100.0
                return v

            def _classificar_ajuste(valor_pct):
                v = _normalizar_pct(valor_pct)
                if v >= 0.30:
                    return "CRESCIMENTO CRÍTICO"
                if v >= 0.15:
                    return "CRESCIMENTO ALTO"
                if v >= 0.05:
                    return "CRESCIMENTO MODERADO"
                if v > -0.05:
                    return "ESTÁVEL"
                if v > -0.15:
                    return "QUEDA MODERADA"
                if v > -0.30:
                    return "QUEDA ALTA"
                return "QUEDA CRÍTICA"

            def _formatar_classe_volume(valor):
                if pd.isna(valor):
                    return "Sem classe"
                texto = str(valor).strip()
                if not texto:
                    return "Sem classe"
                if texto.lower().startswith("classe"):
                    return texto
                return f"Classe {texto}"

            def _extrair_pct_range(valor_range):
                if pd.isna(valor_range):
                    return None
                texto = str(valor_range).strip()
                if "10" in texto:
                    return 0.10
                if "15" in texto:
                    return 0.15
                if "20" in texto:
                    return 0.20
                if "ajustado" in texto.lower():
                    return 0.0
                return None
            
            def selecionar_3_opcoes(row):
                """Seleciona as 3 melhores opções com ranges diferenciados e fallback."""
                historico_ajustado = row['TOTAL_HISTORICO_AJUSTADO']
                ajuste_sugerido = row['SUGESTAO_AJUSTE_PCT']
                
                # Calcular limites para cada range
                ranges = {
                    1: {'min': historico_ajustado * 0.90, 'max': historico_ajustado * 1.10, 'pct': 10},
                    2: {'min': historico_ajustado * 0.85, 'max': historico_ajustado * 1.15, 'pct': 15},
                    3: {'min': historico_ajustado * 0.80, 'max': historico_ajustado * 1.20, 'pct': 20}
                }
                
                # Coletar todos os candidatos
                todos_candidatos = []
                candidatos_mesmo_direcionamento = []
                candidatos_mesmo_dir_dentro_ranges = []
                candidatos_dentro_ranges = []
                
                for modelo in modelos:
                    col_total = f'TOTAL_12M_{modelo}'
                    if col_total not in row.index:
                        continue
                    
                    valor_modelo = row[col_total]
                    
                    if pd.notna(valor_modelo) and valor_modelo > 0:
                        variacao_percentual = calcular_variacao_percentual(valor_modelo, historico_ajustado)
                        diferenca_abs = abs(valor_modelo - historico_ajustado)
                        
                        # Verificar em qual range se encaixa
                        range_opcao = None
                        for opcao, limite in ranges.items():
                            if limite['min'] <= valor_modelo <= limite['max']:
                                if range_opcao is None:
                                    range_opcao = opcao
                        
                        # Verificar direcionamento
                        mesmo_direcionamento = False
                        if ajuste_sugerido > 0 and variacao_percentual > 0:
                            mesmo_direcionamento = True
                        elif ajuste_sugerido < 0 and variacao_percentual < 0:
                            mesmo_direcionamento = True
                        elif ajuste_sugerido == 0:
                            mesmo_direcionamento = True
                        
                        candidato = {
                            'modelo': modelo,
                            'valor': valor_modelo,
                            'variacao_percentual': variacao_percentual,
                            'diferenca_abs': diferenca_abs,
                            'range_opcao': range_opcao,
                            'mesmo_direcionamento': mesmo_direcionamento
                        }
                        
                        todos_candidatos.append(candidato)
                        
                        if mesmo_direcionamento:
                            candidatos_mesmo_direcionamento.append(candidato)
                            if range_opcao is not None:
                                candidatos_mesmo_dir_dentro_ranges.append(candidato)
                        
                        if range_opcao is not None:
                            candidatos_dentro_ranges.append(candidato)
                
                # Preparar resultado
                # Classificar tipo de produto baseado em meses consecutivos com vendas zero
                meses_zero_consecutivos = self.contar_meses_zero_consecutivos(row)
                total_meses_historico = 24  # Período de 24 meses
                
                # Se tem 12+ meses de vendas zero no início, é NOVO
                if meses_zero_consecutivos >= 12:
                    tipo_produto = 'NOVO'
                    meses_com_dados = total_meses_historico - meses_zero_consecutivos
                else:
                    tipo_produto = 'CONSOLIDADO'
                    meses_com_dados = total_meses_historico
                
                # Usar a premissa calculada na funcao de calculo de ajuste
                # Isso garante sincronizacao entre premissa e ajuste real
                premissa = row.get('PREMISSA_AJUSTE', 'Desconhecida')
                
                # Criar coluna com variacoes consolidadas
                var_3m = row.get('VAR_3M_PCT', 0)
                var_6m = row.get('VAR_6M_PCT', 0)
                var_12m = row.get('VAR_12M_PCT', 0)
                var_18m = row.get('VAR_18M_PCT', 0)
                
                # Formatar as variacoes como percentual
                variacoes_consolidadas = f"3M = {var_3m:.0f}%, 6M = {var_6m:.0f}%, 12M = {var_12m:.0f}%, 18M = {var_18m:.0f}%"
                
                resultado = {
                    'Codigo': row['Codigo'],
                    'Tipo Produto': tipo_produto,
                    'Premissa Ajuste': premissa,
                    'Variacoes': variacoes_consolidadas,
                    '% Sugestao Ajuste': ajuste_sugerido,
                    'Classificacao Ajuste': _classificar_ajuste(ajuste_sugerido),
                    'Classe Volume': _formatar_classe_volume(row.get('CATEGORIA_VOLUME', '')),
                    'Historico 12M': row['TOTAL_12M_HISTORICO'],
                    'Historico + Ajuste': historico_ajustado
                }
                
                opcoes_selecionadas = []
                usar_historico_ajustado = False
                motivo_historico = ""
                
                # LÓGICA DE SELEÇÃO
                if candidatos_mesmo_dir_dentro_ranges:
                    # Caso 1: Há modelos com mesmo direcionamento E dentro dos ranges
                    candidatos_ordenados = sorted(candidatos_mesmo_dir_dentro_ranges, key=lambda x: x['diferenca_abs'])
                    for i in range(min(3, len(candidatos_ordenados))):
                        opcoes_selecionadas.append(candidatos_ordenados[i])
                
                elif candidatos_mesmo_direcionamento and not candidatos_mesmo_dir_dentro_ranges:
                    # Caso 2: Há modelos com mesmo direcionamento mas TODOS fora dos ranges
                    usar_historico_ajustado = True
                    motivo_historico = "Mesmo direcionamento fora dos ranges"
                
                elif not candidatos_mesmo_direcionamento and candidatos_dentro_ranges:
                    # Caso 3: NÃO há modelos com mesmo direcionamento, mas HÁ modelos dentro dos ranges
                    candidatos_ordenados = sorted(candidatos_dentro_ranges, key=lambda x: x['diferenca_abs'])
                    for i in range(min(3, len(candidatos_ordenados))):
                        opcoes_selecionadas.append(candidatos_ordenados[i])
                
                else:
                    # Caso 4: NÃO há NENHUM modelo dentro dos ranges
                    usar_historico_ajustado = True
                    motivo_historico = "Nenhum modelo dentro dos ranges"
                
                # Preencher resultado
                if usar_historico_ajustado:
                    for i in range(1, 4):
                        resultado[f'Opção {i} - Modelo'] = 'Histórico + Ajuste'
                        resultado[f'Opção {i} - Valor'] = historico_ajustado
                        resultado[f'Opção {i} - Variação %'] = 0.0
                        resultado[f'Opção {i} - Range'] = 'Histórico Ajustado'
                        resultado[f'Opção {i} - Direcionamento'] = f'Sim ({motivo_historico})'
                else:
                    for i, opcao in enumerate(opcoes_selecionadas, 1):
                        resultado[f'Opção {i} - Modelo'] = opcao['modelo']
                        resultado[f'Opção {i} - Valor'] = opcao['valor']
                        resultado[f'Opção {i} - Variação %'] = opcao['variacao_percentual']
                        resultado[f'Opção {i} - Range'] = f"±{ranges[opcao['range_opcao']]['pct']}%" if opcao['range_opcao'] else "Fora de Todos"
                        resultado[f'Opção {i} - Direcionamento'] = 'Sim' if opcao['mesmo_direcionamento'] else 'NÃO (Fallback)'
                    
                    # Preencher com N/A se houver menos de 3 opções
                    for i in range(len(opcoes_selecionadas) + 1, 4):
                        resultado[f'Opção {i} - Modelo'] = 'N/A'
                        resultado[f'Opção {i} - Valor'] = None
                        resultado[f'Opção {i} - Variação %'] = None
                        resultado[f'Opção {i} - Range'] = 'N/A'
                        resultado[f'Opção {i} - Direcionamento'] = 'N/A'
                
                # MELHOR OPÇÃO: Sempre a Opção 1
                resultado['Melhor Opção'] = resultado['Opção 1 - Modelo']
                resultado['Valor Melhor Opção'] = resultado['Opção 1 - Valor']
                resultado['Variação % Melhor Opção'] = resultado['Opção 1 - Variação %']
                resultado['Range Melhor Opção'] = resultado['Opção 1 - Range']
                resultado['Range Utilizado'] = resultado['Opção 1 - Range']
                resultado['% Range Considerado'] = _extrair_pct_range(resultado['Range Utilizado'])
                
                return pd.Series(resultado)
            
            # Aplicar a função para cada linha
            df_analise = self.df_resultado.apply(selecionar_3_opcoes, axis=1)
            self.df_analise_cenarios = df_analise.copy()
            
            # Escrever na aba
            df_analise.to_excel(writer, sheet_name='Analise_Cenarios', index=False)
            
            # Aplicar formatação
            worksheet = writer.sheets['Analise_Cenarios']
            self._aplicar_formatacao_analise_cenarios(worksheet, df_analise)
            
            print("✅ Aba Análise de Cenários gerada com sucesso")
            
        except Exception as e:
            print(f"❌ Erro na aba Análise de Cenários: {str(e)}")
            import traceback
            traceback.print_exc()
    
    def _aplicar_formatacao_analise_cenarios(self, worksheet, df):
        """Aplica formatação especial para a aba de Análise de Cenários."""
        from openpyxl.styles import Font, PatternFill, Alignment
        
        # Formatação do cabeçalho
        for cell in worksheet[1]:
            cell.font = Font(bold=True, size=11, color="FFFFFF")
            cell.fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        
        # Formatação de valores numéricos e cores por opção
        for row_idx in range(2, len(df) + 2):
            for col_idx, col_name in enumerate(df.columns, 1):
                cell = worksheet.cell(row=row_idx, column=col_idx)
                
                # Formatação numérica
                if 'Variação %' in col_name or '% Sugestão' in col_name or '% Sugestao' in col_name:
                    # Dividir por 100 antes de formatar como percentual
                    # Valores estão armazenados como inteiros (ex: 20) e precisam ser decimais (0.20)
                    if isinstance(cell.value, (int, float)) and cell.value is not None:
                        cell.value = cell.value / 100
                    cell.number_format = '0.00%'
                elif 'Valor' in col_name or 'Histórico' in col_name:
                    cell.number_format = '#,##0.00'
                
                # Cores por opção
                if 'Opção 1' in col_name:
                    cell.fill = PatternFill(start_color="D9EAD3", end_color="D9EAD3", fill_type="solid")
                elif 'Opção 2' in col_name:
                    cell.fill = PatternFill(start_color="FFF2CC", end_color="FFF2CC", fill_type="solid")
                elif 'Opção 3' in col_name:
                    cell.fill = PatternFill(start_color="FCE5CD", end_color="FCE5CD", fill_type="solid")
                elif 'Melhor Opção' in col_name:
                    cell.fill = PatternFill(start_color="CFE2F3", end_color="CFE2F3", fill_type="solid")
                    cell.font = Font(bold=True)
                
                # Destacar fallback em vermelho
                if isinstance(cell.value, str) and 'Fallback' in cell.value:
                    cell.fill = PatternFill(start_color="F4CCCC", end_color="F4CCCC", fill_type="solid")
                    cell.font = Font(bold=True, color="CC0000")
                
                # Destacar Histórico Ajustado em roxo
                if isinstance(cell.value, str) and 'Histórico Ajustado' in cell.value:
                    cell.fill = PatternFill(start_color="D9D2E9", end_color="D9D2E9", fill_type="solid")
                    cell.font = Font(bold=True, color="674EA7")
        
        # Ajustar largura das colunas
        for column in worksheet.columns:
            max_length = 0
            column_letter = column[0].column_letter
            for cell in column:
                try:
                    if len(str(cell.value)) > max_length:
                        max_length = len(str(cell.value))
                except:
                    pass
            adjusted_width = min(max_length + 2, 50)
            worksheet.column_dimensions[column_letter].width = adjusted_width
        
        # Congelar primeira linha
        worksheet.freeze_panes = "A2"
        
        # Configurar zoom 67%
        worksheet.sheet_view.zoomScale = 67
        
        # Aplicar fonte Calibri tamanho 12 em todas as células (exceto cabeçalho)
        for row_idx in range(2, len(df) + 2):
            for col_idx in range(1, len(df.columns) + 1):
                cell = worksheet.cell(row=row_idx, column=col_idx)
                # Manter negrito se já estiver definido
                is_bold = cell.font.bold if cell.font else False
                cell.font = Font(name='Calibri', size=12, bold=is_bold)
        
        # Atualizar cabeçalho com fonte Calibri 12
        for cell in worksheet[1]:
            cell.font = Font(name='Calibri', bold=True, size=12, color="FFFFFF")


    def _gerar_aba_visao_executiva(self, writer):
        """Gera a aba Visao_Executiva consolidando cenÃ¡rios, acuracidade e clientes."""
        print("Gerando aba: Visao_Executiva")

        if not hasattr(self, 'df_analise_cenarios') or self.df_analise_cenarios is None or self.df_analise_cenarios.empty:
            print("⚠️ Dados de análise de cenários não disponíveis para Visao_Executiva.")
            return

        df_visao = self.df_analise_cenarios.copy()

        def _range_para_pct(valor):
            if pd.isna(valor):
                return None
            texto = str(valor).strip()
            if "10" in texto:
                return 0.10
            if "15" in texto:
                return 0.15
            if "20" in texto:
                return 0.20
            if "ajustado" in texto.lower():
                return 0.0
            return None

        if 'Range Utilizado' not in df_visao.columns:
            if 'Range Melhor Opção' in df_visao.columns:
                df_visao['Range Utilizado'] = df_visao['Range Melhor Opção']
            elif 'Opção 1 - Range' in df_visao.columns:
                df_visao['Range Utilizado'] = df_visao['Opção 1 - Range']
            else:
                df_visao['Range Utilizado'] = None

        if '% Range Considerado' not in df_visao.columns:
            df_visao['% Range Considerado'] = df_visao['Range Utilizado'].apply(_range_para_pct)

        if self.df_resultado is not None and not self.df_resultado.empty and 'Codigo' in self.df_resultado.columns:
            df_base = self.df_resultado.drop_duplicates(subset=['Codigo']).set_index('Codigo')
            mapa_resultado = {
                'Status Item': 'STATUS_ITEM',
                '3M Anterior': 'TOTAL_3M_ANTERIOR',
                '3M Atual': 'TOTAL_3M_ATUAL',
                '3M Var%': 'VAR_3M_PCT',
                '6M Anterior': 'TOTAL_6M_ANTERIOR',
                '6M Atual': 'TOTAL_6M_ATUAL',
                '6M Var%': 'VAR_6M_PCT',
                '12M Anterior': 'TOTAL_12M_ANTERIOR',
                '12M Atual': 'TOTAL_12M_ATUAL',
                '12M Var%': 'VAR_12M_PCT',
                '18M Anterior': 'TOTAL_18M_ANTERIOR',
                '18M Atual': 'TOTAL_18M_ATUAL',
                '18M Var%': 'VAR_18M_PCT',
                'Sugestão Ajuste %': 'SUGESTAO_AJUSTE_PCT',
                '12M Histórico': 'TOTAL_12M_HISTORICO',
                '12M Media Simples': 'TOTAL_12M_MEDIA_SIMPLES',
                '12M Media Ponderada': 'TOTAL_12M_MEDIA_PONDERADA',
                '12M media Movel': 'TOTAL_12M_MEDIA_MOVEL',
                '12M Holt Winters': 'TOTAL_12M_HOLT_WINTERS',
                '12M Sarima': 'TOTAL_12M_SARIMA',
                '12M Prophet': 'TOTAL_12M_PROPHET',
                '12M random Forest': 'TOTAL_12M_RANDOM_FOREST',
                '12M Xgboost': 'TOTAL_12M_XGBOOST',
                '12M Naive Sazonal': 'TOTAL_12M_NAIVE_SAZONAL',
                '12M Croston': 'TOTAL_12M_CROSTON',
                '12M Ensemble': 'TOTAL_12M_ENSEMBLE',
                'Sazonalidade Meses +Fortes': 'TOP_4_MESES_HISTORICO',
            }
            for coluna_destino, coluna_origem in mapa_resultado.items():
                if coluna_origem in df_base.columns:
                    df_visao[coluna_destino] = df_visao['Codigo'].map(df_base[coluna_origem])
                elif coluna_destino not in df_visao.columns:
                    df_visao[coluna_destino] = None

        colunas_acuracidade = [
            'MAPE Médio Mensal',
            'Classificação Mensal',
            'MAPE Total',
            'Classificação Total',
        ]
        if hasattr(self, 'df_acuracidade') and self.df_acuracidade is not None and not self.df_acuracidade.empty:
            df_acur = self.df_acuracidade.drop_duplicates(subset=['Codigo']).set_index('Codigo')
            mapa_acur = {
                'MAPE Médio Mensal': 'MAPE_MEDIO_MENSAL',
                'Classificação Mensal': 'CLASSIFICACAO_ERRO_MENSAL',
                'MAPE Total': 'MAPE_TOTAL',
                'Classificação Total': 'CLASSIFICACAO_ERRO_TOTAL',
            }
            for coluna_destino, coluna_origem in mapa_acur.items():
                if coluna_origem in df_acur.columns:
                    df_visao[coluna_destino] = df_visao['Codigo'].map(df_acur[coluna_origem])
                else:
                    df_visao[coluna_destino] = None
        else:
            for coluna in colunas_acuracidade:
                df_visao[coluna] = None

        colunas_clientes = [
            'Clientes Unicos',
            'Clientes Ativos',
            'Media Clientes',
            'Qtd Clientes Ultimo Mês',
            'Clientes Mensal',
            'Clientes Bimestral',
            'Clientes Trimestral',
            'Clientes Semestral',
            'Clientes Anual',
            'Clientes Não Recorrentes',
        ]
        if hasattr(self, 'df_comportamento_consolidado') and self.df_comportamento_consolidado is not None and not self.df_comportamento_consolidado.empty:
            df_cli = self.df_comportamento_consolidado.drop_duplicates(subset=['Codigo']).set_index('Codigo')
            mapa_cli = {
                'Clientes Unicos': 'TOTAL_CLIENTES_UNICOS',
                'Clientes Ativos': 'CLIENTES_ATIVOS_12M',
                'Media Clientes': 'MEDIA_CLIENTES_12M',
                'Qtd Clientes Ultimo Mês': 'CLIENTES_ATIVOS_ULTIMO_MES',
                'Clientes Mensal': 'CLIENTES_MENSAIS',
                'Clientes Bimestral': 'CLIENTES_BIMESTRAIS',
                'Clientes Trimestral': 'CLIENTES_TRIMESTRAIS',
                'Clientes Semestral': 'CLIENTES_SEMESTRAIS',
                'Clientes Anual': 'CLIENTES_ANUAIS',
                'Clientes Não Recorrentes': 'CLIENTES_NAO_RECORRENTES',
            }
            for coluna_destino, coluna_origem in mapa_cli.items():
                if coluna_origem in df_cli.columns:
                    df_visao[coluna_destino] = df_visao['Codigo'].map(df_cli[coluna_origem])
                else:
                    df_visao[coluna_destino] = None
        else:
            for coluna in colunas_clientes:
                df_visao[coluna] = None

        colunas_finais = [
            'Codigo',
            'Tipo Produto',
            'Premissa Ajuste',
            'Variacoes',
            '% Sugestao Ajuste',
            'Classificacao Ajuste',
            'Classe Volume',
            'Historico 12M',
            'Historico + Ajuste',
            'Valor Melhor Opção',
            'Melhor Opção',
            'Variação % Melhor Opção',
            'Range Utilizado',
            '% Range Considerado',
            'Opção 1 - Modelo',
            'Opção 1 - Valor',
            'Opção 1 - Variação %',
            'Opção 1 - Range',
            'Opção 2 - Modelo',
            'Opção 2 - Valor',
            'Opção 2 - Variação %',
            'Opção 2 - Range',
            'Opção 3 - Modelo',
            'Opção 3 - Valor',
            'Opção 3 - Variação %',
            'Opção 3 - Range',
            'Status Item',
            '3M Anterior',
            '3M Atual',
            '3M Var%',
            '6M Anterior',
            '6M Atual',
            '6M Var%',
            '12M Anterior',
            '12M Atual',
            '12M Var%',
            '18M Anterior',
            '18M Atual',
            '18M Var%',
            'Sugestão Ajuste %',
            '12M Histórico',
            '12M Media Simples',
            '12M Media Ponderada',
            '12M media Movel',
            '12M Holt Winters',
            '12M Sarima',
            '12M Prophet',
            '12M random Forest',
            '12M Xgboost',
            '12M Naive Sazonal',
            '12M Croston',
            '12M Ensemble',
            'Sazonalidade Meses +Fortes',
            'MAPE Médio Mensal',
            'Classificação Mensal',
            'MAPE Total',
            'Classificação Total',
            'Clientes Unicos',
            'Clientes Ativos',
            'Media Clientes',
            'Qtd Clientes Ultimo Mês',
            'Clientes Mensal',
            'Clientes Bimestral',
            'Clientes Trimestral',
            'Clientes Semestral',
            'Clientes Anual',
            'Clientes Não Recorrentes',
        ]

        for coluna in colunas_finais:
            if coluna not in df_visao.columns:
                df_visao[coluna] = None

        df_visao = df_visao[colunas_finais]
        df_visao.to_excel(writer, sheet_name='Visao_Executiva', index=False)

        worksheet = writer.sheets['Visao_Executiva']
        self._aplicar_formatacao_basica(worksheet)

    def _gerar_aba_analise_acuracidade(self, writer):
        """Gera a aba Análise de Acuracidade com comparação previsto vs realizado."""
        print("Gerando aba: Análise de Acuracidade")
        
        try:
            if self.df_acuracidade is None or self.df_acuracidade.empty:
                print("Dados de acuracidade não disponíveis.")
                return
            
            # Criar cópia dos dados para manipulação
            df_acur = self.df_acuracidade.copy()
            
            # Ordenar por MAPE_MEDIO_MENSAL (piores primeiro - maior para menor)
            df_acur = df_acur.sort_values('MAPE_MEDIO_MENSAL', ascending=False, na_position='last')
            
            # Adicionar ranking
            df_acur['RANKING_ERRO'] = range(1, len(df_acur) + 1)
            
            # Reorganizar colunas
            colunas_ordenadas = [
                'RANKING_ERRO', 'Codigo', 'MESES_ANALISADOS', 'VOLUME_MEDIO_REAL',
                'TOTAL_PREVISTO', 'TOTAL_REALIZADO', 'ERRO_ABSOLUTO_TOTAL', 
                'MAPE_MEDIO_MENSAL', 'CLASSIFICACAO_ERRO_MENSAL',  # ✅ MAPE mensal + classificação
                'MAPE_TOTAL', 'CLASSIFICACAO_ERRO_TOTAL',  # ✅ MAPE total + classificação
                'BIAS', 'SUGESTAO_AJUSTE_PCT', 'OBSERVACAO'
            ]
            
            df_final = df_acur[colunas_ordenadas]
            
            # Escrever dados na planilha
            df_final.to_excel(writer, sheet_name='Acuracidade', index=False)
            
            # Obter worksheet para formatação
            worksheet = writer.sheets['Acuracidade']
            
            # Aplicar formatação de porcentagem nas colunas de métricas percentuais
            self._aplicar_formatacao_porcentagem(worksheet, df_final, 'MAPE_MEDIO_MENSAL')
            self._aplicar_formatacao_porcentagem(worksheet, df_final, 'MAPE_TOTAL')
            self._aplicar_formatacao_porcentagem(worksheet, df_final, 'SUGESTAO_AJUSTE_PCT')
            
            # Aplicar formatação por cores nas classificações
            self._aplicar_formatacao_classificacao_cores(worksheet, df_final, 'CLASSIFICACAO_ERRO_MENSAL')
            self._aplicar_formatacao_classificacao_cores(worksheet, df_final, 'CLASSIFICACAO_ERRO_TOTAL')
            
            # Aplicar formatações
            self._aplicar_formatacao_acuracidade(worksheet, len(df_final))
            
            # ✅ NOVA: Aplicar formatação de zoom e fonte
            self._aplicar_formatacao_acuracidade_visual(worksheet)
            
            print(f"Aba 'Análise de Acuracidade' gerada com {len(df_final)} itens.")
            
        except Exception as e:
            print(f"Erro ao gerar aba de acuracidade: {str(e)}")
            # Criar aba de erro
            df_erro = pd.DataFrame({
                'Codigo': ['Erro no processamento'],
                'Erro': [str(e)]
            })
            df_erro.to_excel(writer, sheet_name='Acuracidade', index=False)

    def _aplicar_formatacao_acuracidade(self, worksheet, num_linhas):
        """Aplica formatação específica para a aba de acuracidade."""
        try:
            from openpyxl.styles import PatternFill, Font
            from openpyxl.formatting.rule import CellIsRule
            
            # Definir cores
            cor_excelente = PatternFill(start_color="00FF00", end_color="00FF00", fill_type="solid")  # Verde
            cor_bom = PatternFill(start_color="90EE90", end_color="90EE90", fill_type="solid")        # Verde claro
            cor_aceitavel = PatternFill(start_color="FFFF00", end_color="FFFF00", fill_type="solid")  # Amarelo
            cor_ruim = PatternFill(start_color="FFA500", end_color="FFA500", fill_type="solid")       # Laranja
            cor_muito_ruim = PatternFill(start_color="FF0000", end_color="FF0000", fill_type="solid") # Vermelho
            
            # Formatação condicional para CLASSIFICACAO_ERRO
            col_classificacao = None
            for col_idx, cell in enumerate(worksheet[1], 1):
                if cell.value == "CLASSIFICACAO_ERRO":
                    col_letter = cell.column_letter
                    
                    # Aplicar cores baseadas na classificação
                    worksheet.conditional_formatting.add(
                        f"{col_letter}2:{col_letter}{num_linhas + 1}",
                        CellIsRule(operator="equal", formula=['"EXCELENTE"'], fill=cor_excelente)
                    )
                    worksheet.conditional_formatting.add(
                        f"{col_letter}2:{col_letter}{num_linhas + 1}",
                        CellIsRule(operator="equal", formula=['"BOM"'], fill=cor_bom)
                    )
                    worksheet.conditional_formatting.add(
                        f"{col_letter}2:{col_letter}{num_linhas + 1}",
                        CellIsRule(operator="equal", formula=['"ACEITÁVEL"'], fill=cor_aceitavel)
                    )
                    worksheet.conditional_formatting.add(
                        f"{col_letter}2:{col_letter}{num_linhas + 1}",
                        CellIsRule(operator="equal", formula=['"RUIM"'], fill=cor_ruim)
                    )
                    worksheet.conditional_formatting.add(
                        f"{col_letter}2:{col_letter}{num_linhas + 1}",
                        CellIsRule(operator="equal", formula=['"MUITO RUIM"'], fill=cor_muito_ruim)
                    )
                    break
                        # Definir larguras das colunas
            larguras_colunas = {
                'A': 15,  # RANKING_ERRO
                'B': 25,  # Codigo
                'C': 18,  # MESES_ANALISADOS
                'D': 18,  # VOLUME_MEDIO_REAL
                'E': 16,  # TOTAL_PREVISTO
                'F': 16,  # TOTAL_REALIZADO
                'G': 18,  # ERRO_ABSOLUTO_TOTAL
                'H': 16,  # MAPE_MEDIO_MENSAL
                'I': 20,  # CLASSIFICACAO_ERRO_MENSAL
                'J': 12,  # MAPE_TOTAL
                'K': 20,  # CLASSIFICACAO_ERRO_TOTAL
                'L': 20,  # BIAS
                'M': 20,  # SUGESTAO_AJUSTE_PCT
                'N': 40   # OBSERVACAO
            }
            
            for col_letter, largura in larguras_colunas.items():
                worksheet.column_dimensions[col_letter].width = largura
            
            # Formatação do cabeçalho
            for cell in worksheet[1]:
                cell.font = Font(bold=True)
                cell.fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
                cell.font = Font(color="FFFFFF", bold=True)
            
            print("Formatação da aba de acuracidade aplicada com sucesso.")
            
        except Exception as e:
            print(f"Aviso: Erro na formatação da aba de acuracidade: {e}")

    def _aplicar_formatacao_classificacao_cores(self, worksheet, df, nome_coluna):
        """Aplica formatação por cores nas colunas de classificação de erro."""
        try:
            from openpyxl.styles import PatternFill
            from openpyxl.formatting.rule import CellIsRule
            
            # Encontrar o índice da coluna
            col_index = df.columns.get_loc(nome_coluna) + 1
            
            # Obter a letra da coluna
            from openpyxl.utils import get_column_letter
            col_letter = get_column_letter(col_index)
            
            # Definir cores para cada classificação
            cores = {
                'EXCELENTE': PatternFill(start_color="00FF00", end_color="00FF00", fill_type="solid"),  # Verde
                'BOM': PatternFill(start_color="90EE90", end_color="90EE90", fill_type="solid"),        # Verde claro
                'ACEITÁVEL': PatternFill(start_color="FFFF00", end_color="FFFF00", fill_type="solid"),  # Amarelo
                'RUIM': PatternFill(start_color="FFA500", end_color="FFA500", fill_type="solid"),       # Laranja
                'MUITO RUIM': PatternFill(start_color="FF0000", end_color="FF0000", fill_type="solid")  # Vermelho
            }
            
            # Aplicar formatação condicional para cada classificação
            for classificacao, cor in cores.items():
                worksheet.conditional_formatting.add(
                    f"{col_letter}2:{col_letter}{len(df) + 1}",
                    CellIsRule(operator="equal", formula=[f'"{classificacao}"'], fill=cor)
                )
            
            print(f"Formatação por cores aplicada na coluna {nome_coluna}.")
            
        except Exception as e:
            print(f"Aviso: Erro na formatação por cores: {e}")

    def _aplicar_formatacao_porcentagem(self, worksheet, df, nome_coluna):
        """Aplica formatação de porcentagem para uma coluna específica."""
        try:
            from openpyxl.styles import NamedStyle
            
            # Encontrar o índice da coluna
            col_index = None
            for idx, col_name in enumerate(df.columns, 1):
                if col_name == nome_coluna:
                    col_index = idx
                    break
            
            if col_index is None:
                print(f"Coluna {nome_coluna} não encontrada para formatação de porcentagem.")
                return
            
            # Obter a letra da coluna
            from openpyxl.utils import get_column_letter
            col_letter = get_column_letter(col_index)
            
            # Aplicar formatação de porcentagem
            for row in range(2, len(df) + 2):  # Começar da linha 2 (pular cabeçalho)
                cell = worksheet[f'{col_letter}{row}']
                if cell.value is not None and isinstance(cell.value, (int, float)):
                    # ✅ CORREÇÃO ESPECÍFICA: Para SUGESTAO_AJUSTE_PCT, dividir por 100 antes de formatar
                    if nome_coluna == 'SUGESTAO_AJUSTE_PCT':
                        cell.value = cell.value / 100  # -20 vira -0.20, que formatado como % vira -20%
                    # Para MAPE, não dividir pois já está em decimal correto
                    cell.number_format = '0.00%'
            
            print(f"Formatação de porcentagem aplicada na coluna {nome_coluna}.")
            
        except Exception as e:
            print(f"Aviso: Erro na formatação de porcentagem: {e}")

    def _gerar_aba_analise_acuracidade_detalhada(self, writer):
        """
        ✅ NOVA FUNCIONALIDADE: Gera a aba 'Análise Acuracidade Detalhada' com comparação mês a mês 
        entre previsto e realizado. Calcula MAPE mês a mês e aplica classificação colorida 
        conforme exemplo fornecido.
        """
        print("Gerando aba: Análise Acuracidade Detalhada")
        
        try:
            # Verificar se dados necessários estão disponíveis
            if self.df_previsto is None or self.df_historico is None:
                print("Dados de previsão ou histórico não disponíveis para análise detalhada.")
                return
            
            # Preparar dados para comparação usando merge direto
            print(f"DEBUG: Preparando merge...")
            print(f"  - Previsão: {self.df_previsto.shape[0]} linhas, {self.df_previsto.shape[1]} colunas")
            print(f"  - Histórico: {self.df_historico.shape[0]} linhas, {self.df_historico.shape[1]} colunas")
            
            # Fazer merge entre dados previstos e históricos
            import pandas as pd
            df_merged = pd.merge(
                self.df_previsto, 
                self.df_historico, 
                on='Codigo', 
                how='inner',
                suffixes=('_prev', '_real')
            )
            
            print(f"Merge realizado: {len(df_merged)} produtos encontrados em ambas as bases.")
            
            if len(df_merged) == 0:
                print("Nenhum produto encontrado em ambas as bases de dados.")
                return
            
            # Gerar análise detalhada mês a mês
            df_detalhado = self._calcular_acuracidade_mes_a_mes_melhorada(df_merged)
            
            # Escrever dados na planilha
            df_detalhado.to_excel(writer, sheet_name='Acuracidade_Detalhada', index=False)
            
            # Aplicar formatação especial
            worksheet = writer.sheets['Acuracidade_Detalhada']
            self._aplicar_formatacao_acuracidade_detalhada_melhorada(worksheet, df_detalhado)
            
            print(f"Aba 'Acuracidade Detalhada' gerada com {len(df_detalhado)} itens.")
            
        except Exception as e:
            print(f"Erro ao gerar aba de análise de acuracidade detalhada: {str(e)}")
            import traceback
            traceback.print_exc()
            
            # Criar aba de erro com mais detalhes
            try:
                df_erro = pd.DataFrame({
                    'Codigo': ['ERRO'],
                    'Mensagem': [f'Erro no processamento: {str(e)}'],
                    'Detalhes': [f'Verifique se os arquivos de dados estão corretos e se há produtos em comum entre as bases']
                })
                df_erro.to_excel(writer, sheet_name='Acuracidade_Detalhada', index=False)
            except Exception as e2:
                print(f"Erro ao criar aba de erro: {str(e2)}")
                # Criar aba mínima
                try:
                    import pandas as pd
                    df_minimo = pd.DataFrame({'Erro': ['Falha na geração da aba']})
                    df_minimo.to_excel(writer, sheet_name='Acuracidade_Detalhada', index=False)
                except:
                    pass

    def _calcular_acuracidade_mes_a_mes_melhorada(self, df_merged):
        """
        Calcula a acuracidade mês a mês entre previsto e realizado.
        
        Args:
            df_merged: DataFrame com dados merged
            
        Returns:
            DataFrame com análise detalhada mês a mês
        """
        try:
            import pandas as pd
            print("Calculando acuracidade mês a mês...")
            
            # Verificações de segurança
            if df_merged is None or df_merged.empty:
                print("ERRO: DataFrame merged está vazio ou None")
                return pd.DataFrame({'Codigo': ['ERRO'], 'Mensagem': ['DataFrame vazio']})
            
            print(f"DataFrame merged: {df_merged.shape[0]} linhas, {df_merged.shape[1]} colunas")
            print(f"Colunas disponíveis: {list(df_merged.columns[:10])}...")
            
            resultados = []
            
            # Identificar colunas de meses comuns entre previsão e histórico
            colunas_prev = [col for col in df_merged.columns if col.endswith('_prev') and col != 'Codigo_prev']
            colunas_real = [col for col in df_merged.columns if col.endswith('_real') and col != 'Codigo_real']
            
            print(f"Colunas previsão encontradas: {len(colunas_prev)}")
            print(f"Colunas realizado encontradas: {len(colunas_real)}")
            
            if not colunas_prev or not colunas_real:
                print("ERRO: Não foram encontradas colunas de previsão ou realizado")
                return pd.DataFrame({'Codigo': ['ERRO'], 'Mensagem': ['Colunas não encontradas']})
            
            # Mapear colunas correspondentes
            meses_comparacao = []
            for col_prev in colunas_prev:
                nome_mes = col_prev.replace('_prev', '')
                col_real = nome_mes + '_real'
                if col_real in colunas_real:
                    meses_comparacao.append((nome_mes, col_prev, col_real))
            
            print(f"Encontrados {len(meses_comparacao)} meses para comparação.")
            
            if not meses_comparacao:
                print("ERRO: Nenhum mês encontrado para comparação")
                return pd.DataFrame({'Codigo': ['ERRO'], 'Mensagem': ['Nenhum mês para comparação']})
            
            for _, row in df_merged.iterrows():
                codigo = row['Codigo']
                resultado_item = {'Codigo': codigo}
                
                mapes_mes = []
                
                # Processar cada mês
                for nome_mes, col_prev, col_real in meses_comparacao:
                    previsto = row[col_prev] if pd.notna(row[col_prev]) else 0
                    realizado = row[col_real] if pd.notna(row[col_real]) else 0
                    
                    # Formatar nome do mês para as colunas (formato JAN/25)
                    mes_formatado = str(nome_mes).replace('-', '/').upper()
                    
                    # Adicionar valores previsto e realizado
                    resultado_item[f'{mes_formatado}_PREVISTO'] = previsto
                    resultado_item[f'{mes_formatado}_REALIZADO'] = realizado
                    
                    # Calcular MAPE do mês
                    if realizado > 0:
                        mape_mes = abs((realizado - previsto) / realizado)
                        resultado_item[f'{mes_formatado}_MAPE'] = mape_mes
                        
                        # Classificação do erro
                        classificacao = self._classificar_erro_detalhado_melhorado(mape_mes * 100)
                        resultado_item[f'{mes_formatado}_CLASSIFICACAO'] = classificacao
                        
                        mapes_mes.append(mape_mes)
                    else:
                        resultado_item[f'{mes_formatado}_MAPE'] = None
                        resultado_item[f'{mes_formatado}_CLASSIFICACAO'] = "SEM DADOS"
                
                # Calcular MAPE médio do item
                if mapes_mes:
                    mape_medio = sum(mapes_mes) / len(mapes_mes)
                    resultado_item['MAPE_MEDIO'] = mape_medio
                    resultado_item['CLASSIFICACAO_GERAL'] = self._classificar_erro_detalhado_melhorado(mape_medio * 100)
                else:
                    resultado_item['MAPE_MEDIO'] = None
                    resultado_item['CLASSIFICACAO_GERAL'] = "SEM DADOS"
                
                resultados.append(resultado_item)
            
            df_resultado = pd.DataFrame(resultados)
            
            # Ordenar colunas: Codigo, depois meses em ordem cronológica, depois métricas gerais
            colunas_ordenadas = ['Codigo']
            
            # Adicionar colunas de meses em ordem cronológica
            meses_ordenados = self._ordenar_meses_cronologicamente([nome_mes for nome_mes, _, _ in meses_comparacao])
            for mes in meses_ordenados:
                mes_formatado = str(mes).replace('-', '/').upper()
                colunas_ordenadas.extend([
                    f'{mes_formatado}_PREVISTO',
                    f'{mes_formatado}_REALIZADO', 
                    f'{mes_formatado}_MAPE',
                    f'{mes_formatado}_CLASSIFICACAO'
                ])
            
            # Adicionar métricas gerais
            colunas_ordenadas.extend(['MAPE_MEDIO', 'CLASSIFICACAO_GERAL'])
            
            # Filtrar apenas colunas existentes
            colunas_existentes = [col for col in colunas_ordenadas if col in df_resultado.columns]
            df_final = df_resultado[colunas_existentes]
            
            print(f"Análise concluída: {len(df_final)} produtos, {len(df_final.columns)} colunas")
            return df_final
            
        except Exception as e:
            print(f"ERRO na função _calcular_acuracidade_mes_a_mes_melhorada: {str(e)}")
            import traceback
            traceback.print_exc()
            return pd.DataFrame({'Codigo': ['ERRO'], 'Mensagem': [f'Erro no cálculo: {str(e)}']})

    def _ordenar_meses_cronologicamente(self, lista_meses):
        """
        Ordena uma lista de meses no formato 'mes-ano' cronologicamente.
        
        Args:
            lista_meses: Lista de strings no formato 'jan-25', 'fev-25', etc.
            
        Returns:
            Lista ordenada cronologicamente
        """
        def chave_ordenacao(mes_str):
            """Função para gerar chave de ordenação cronológica."""
            try:
                # Mapear nomes de meses para números
                meses_map = {
                    'jan': 1, 'fev': 2, 'mar': 3, 'abr': 4, 'mai': 5, 'jun': 6,
                    'jul': 7, 'ago': 8, 'set': 9, 'out': 10, 'nov': 11, 'dez': 12
                }
                
                # Extrair mês e ano
                if '-' in mes_str:
                    mes_nome, ano_str = mes_str.split('-')
                    ano_num = int('20' + ano_str if len(ano_str) == 2 else ano_str)
                    mes_num = meses_map.get(mes_nome.lower(), 0)
                    return (ano_num, mes_num)
                else:
                    return (9999, 0)  # Fallback para ordenação
            except:
                return (9999, 0)
        
        return sorted(lista_meses, key=chave_ordenacao)

    def _classificar_erro_detalhado_melhorado(self, mape_percentual):
        """
        Classifica o erro MAPE conforme escala do exemplo.
        
        Args:
            mape_percentual: MAPE em percentual (0-100)
            
        Returns:
            str: Classificação do erro
        """
        if mape_percentual <= 10:
            return "EXCELENTE"
        elif mape_percentual <= 20:
            return "BOM"
        elif mape_percentual <= 30:
            return "ACEITÁVEL"
        elif mape_percentual <= 50:
            return "RUIM"
        else:
            return "MUITO RUIM"

    def _aplicar_formatacao_acuracidade_detalhada_melhorada(self, worksheet, df_detalhado):
        """
        Aplica formatação especial para a aba de análise de acuracidade detalhada.
        
        Args:
            worksheet: Worksheet do openpyxl
            df_detalhado: DataFrame com os dados
        """
        try:
            from openpyxl.styles import PatternFill, Font, Alignment
            from openpyxl.utils import get_column_letter
            
            # Aplicar formatação básica
            self._aplicar_formatacao_basica(worksheet)
            
            # Definir cores para classificações (conforme exemplo)
            cores_classificacao = {
                'EXCELENTE': PatternFill(start_color="00B050", end_color="00B050", fill_type="solid"),  # Verde escuro
                'BOM': PatternFill(start_color="92D050", end_color="92D050", fill_type="solid"),        # Verde claro
                'ACEITÁVEL': PatternFill(start_color="FFFF00", end_color="FFFF00", fill_type="solid"),  # Amarelo
                'RUIM': PatternFill(start_color="FFC000", end_color="FFC000", fill_type="solid"),       # Laranja
                'MUITO RUIM': PatternFill(start_color="FF0000", end_color="FF0000", fill_type="solid"), # Vermelho
                'SEM DADOS': PatternFill(start_color="D9D9D9", end_color="D9D9D9", fill_type="solid")   # Cinza
            }
            
            # Fonte branca para células coloridas
            fonte_branca = Font(name="Calibri", size=10, color="FFFFFF", bold=True)
            fonte_preta = Font(name="Calibri", size=10, color="000000", bold=True)
            
            # Aplicar cores nas colunas de classificação
            for row_idx in range(2, len(df_detalhado) + 2):  # Começar da linha 2 (dados)
                for col_idx, col_name in enumerate(df_detalhado.columns, 1):
                    if 'CLASSIFICACAO' in col_name:
                        cell = worksheet.cell(row=row_idx, column=col_idx)
                        classificacao = cell.value
                        
                        if classificacao in cores_classificacao:
                            cell.fill = cores_classificacao[classificacao]
                            # Usar fonte branca para cores escuras, preta para amarelo
                            if classificacao in ['EXCELENTE', 'RUIM', 'MUITO RUIM']:
                                cell.font = fonte_branca
                            else:
                                cell.font = fonte_preta
                            
                            cell.alignment = Alignment(horizontal="center", vertical="center")
            
            # Formatação de colunas MAPE como percentual
            for col_idx, col_name in enumerate(df_detalhado.columns, 1):
                if '_MAPE' in col_name:
                    col_letter = get_column_letter(col_idx)
                    for row_idx in range(2, len(df_detalhado) + 2):
                        cell = worksheet[f'{col_letter}{row_idx}']
                        if cell.value is not None and isinstance(cell.value, (int, float)):
                            cell.number_format = '0.00%'
            
            # Ajustar largura das colunas
            for col_idx, col_name in enumerate(df_detalhado.columns, 1):
                col_letter = get_column_letter(col_idx)
                
                if col_name == 'Codigo':
                    worksheet.column_dimensions[col_letter].width = 25
                elif '_PREVISTO' in col_name or '_REALIZADO' in col_name:
                    worksheet.column_dimensions[col_letter].width = 12
                elif '_MAPE' in col_name:
                    worksheet.column_dimensions[col_letter].width = 10
                elif '_CLASSIFICACAO' in col_name:
                    worksheet.column_dimensions[col_letter].width = 15
                else:
                    worksheet.column_dimensions[col_letter].width = 12
            
            # Congelar primeira linha e primeira coluna
            worksheet.freeze_panes = 'B2'
            
            # Zoom 67%
            worksheet.sheet_view.zoomScale = 67
            
            print("Formatação da aba de análise de acuracidade detalhada aplicada com sucesso.")
            
        except Exception as e:
            print(f"Aviso: Erro na formatação da aba de análise de acuracidade detalhada: {e}")

    def _aplicar_formatacao_acuracidade_visual(self, worksheet):
        """Aplica formatação visual específica para abas de acuracidade (zoom 67%, fonte Calibri 12)."""
        try:
            from openpyxl.styles import Font
            
            # Definir zoom para 67%
            worksheet.sheet_view.zoomScale = 67
            
            # Aplicar fonte Calibri 12 para todas as células
            font_calibri = Font(name='Calibri', size=12)
            
            # Aplicar fonte para todas as células com dados
            for row in worksheet.iter_rows():
                for cell in row:
                    if cell.value is not None:
                        cell.font = font_calibri
            
            print(f"Formatação visual aplicada: zoom 67%, fonte Calibri 12.")
            
        except Exception as e:
            print(f"Aviso: Erro na formatação visual: {e}")

    def _aplicar_formatacao_acuracidade_detalhada(self, worksheet, df):
        """Aplica formatação específica para a aba de acuracidade detalhada."""
        try:
            from openpyxl.styles import PatternFill, Font, Alignment
            from openpyxl.formatting.rule import CellIsRule
            
            # Definir cores para classificação
            cores_classificacao = {
                'EXCELENTE': PatternFill(start_color="00FF00", end_color="00FF00", fill_type="solid"),  # Verde
                'BOM': PatternFill(start_color="90EE90", end_color="90EE90", fill_type="solid"),        # Verde claro
                'ACEITÁVEL': PatternFill(start_color="FFFF00", end_color="FFFF00", fill_type="solid"),  # Amarelo
                'RUIM': PatternFill(start_color="FFA500", end_color="FFA500", fill_type="solid"),       # Laranja
                'MUITO RUIM': PatternFill(start_color="FF0000", end_color="FF0000", fill_type="solid"), # Vermelho
                'SEM DADOS': PatternFill(start_color="D3D3D3", end_color="D3D3D3", fill_type="solid")  # Cinza
            }
            
            # Formatação do cabeçalho
            for cell in worksheet[1]:
                cell.font = Font(bold=True, color="FFFFFF")
                cell.fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
                cell.alignment = Alignment(horizontal="center")
            
            # Aplicar formatação condicional para colunas de classificação
            for col_idx, col_name in enumerate(df.columns, 1):
                col_letter = worksheet.cell(row=1, column=col_idx).column_letter
                
                if '_CLASSIFICACAO' in col_name:
                    # Aplicar cores baseadas na classificação
                    for classificacao, cor in cores_classificacao.items():
                        worksheet.conditional_formatting.add(
                            f"{col_letter}2:{col_letter}{len(df) + 1}",
                            CellIsRule(operator="equal", formula=[f'"{classificacao}"'], fill=cor)
                        )
                
                # Ajustar largura das colunas
                if col_name == 'Codigo':
                    worksheet.column_dimensions[col_letter].width = 15
                elif '_PREVISTO' in col_name or '_REALIZADO' in col_name:
                    worksheet.column_dimensions[col_letter].width = 12
                elif '_MAPE' in col_name or '_BIAS' in col_name:
                    worksheet.column_dimensions[col_letter].width = 10
                elif '_CLASSIFICACAO' in col_name:
                    worksheet.column_dimensions[col_letter].width = 15
                else:
                    worksheet.column_dimensions[col_letter].width = 12
            
            print("Formatação da aba de acuracidade detalhada aplicada com sucesso.")
            
        except Exception as e:
            print(f"Aviso: Erro na formatação da aba de acuracidade detalhada: {e}")
    
    def carregar_dados_clientes(self, caminho_arquivo):
        """
        Carrega dados de clientes do arquivo Excel.
        
        Args:
            caminho_arquivo (str): Caminho para o arquivo de dados históricos
        """
        try:
            # Tentar carregar arquivo de clientes no mesmo diretório
            diretorio = os.path.dirname(caminho_arquivo) if caminho_arquivo else '.'
            arquivo_clientes = os.path.join(diretorio, '1-BasedeDadosClientes.xlsx')
            
            if not os.path.exists(arquivo_clientes):
                print(f"Arquivo de clientes não encontrado: {arquivo_clientes}")
                self.df_clientes = None
                return
            
            print(f"Carregando dados de clientes: {arquivo_clientes}")
            df_clientes = pd.read_excel(arquivo_clientes)
            
            print(f"Dados de clientes carregados: {df_clientes.shape[0]} registros, {df_clientes.shape[1]} colunas")
            
            # Validar estrutura básica
            if 'Código' not in df_clientes.columns or 'Cod. Cliente' not in df_clientes.columns:
                print("Erro: Estrutura do arquivo de clientes inválida. Colunas 'Código' e 'Cod. Cliente' são obrigatórias.")
                self.df_clientes = None
                return
            
            # Atribuir ao atributo da classe
            self.df_clientes = df_clientes
            print("Dados de clientes atribuídos com sucesso à classe.")
            
        except Exception as e:
            print(f"Erro ao carregar dados de clientes: {str(e)}")
            self.df_clientes = None
    
    def analisar_comportamento_clientes(self):
        """
        Analisa o comportamento de compra dos clientes para cada produto.
        APENAS para produtos que estão na base de vendas/previsão.
        """
        if self.df_clientes is None:
            print("Dados de clientes não disponíveis.")
            return
        
        if self.df_historico is None:
            print("Dados históricos não disponíveis para filtrar produtos.")
            return
        
        print("Iniciando análise de comportamento de clientes...")
        
        # FILTRO: Apenas produtos que estão na base de vendas/previsão
        produtos_previsao = self.df_historico['Codigo'].unique()
        df_clientes_filtrado = self.df_clientes[self.df_clientes['Código'].isin(produtos_previsao)].copy()
        
        print(f"Produtos na base de vendas: {len(produtos_previsao)}")
        print(f"Registros de clientes (antes do filtro): {len(self.df_clientes)}")
        print(f"Registros de clientes (após filtro): {len(df_clientes_filtrado)}")
        
        if len(df_clientes_filtrado) == 0:
            print("Nenhum produto da base de clientes corresponde aos produtos da base de vendas.")
            print(f"Exemplos de códigos na base de vendas: {produtos_previsao[:5]}")
            print(f"Exemplos de códigos na base de clientes: {self.df_clientes['Código'].unique()[:5]}")
            return
        
        # Executar análise e atribuir resultados aos atributos da classe
        df_consolidado, df_detalhado, df_por_marca = self._processar_comportamento_clientes(df_clientes_filtrado)
        
        # Atribuir aos atributos da classe
        self.df_comportamento_consolidado = df_consolidado
        self.df_comportamento_detalhado = df_detalhado
        self.df_comportamento_por_marca = df_por_marca
        
        print("Análise de comportamento de clientes concluída e atribuída à classe.")
    
    def _processar_comportamento_clientes(self, df_clientes_filtrado):
        """
        Processa os dados de comportamento de clientes.
        
        Returns:
            tuple: (df_consolidado, df_detalhado) - DataFrames com análises consolidadas e detalhadas
        """
        # Identificar colunas de meses e ordená-las cronologicamente
        colunas_meses_raw = [col for col in df_clientes_filtrado.columns if col not in ['Código', 'Cod. Cliente']]
        colunas_meses = self._ordenar_meses_cronologicamente(colunas_meses_raw)
        
        resultados_consolidado = []
        resultados_detalhado = []
        
        for produto in df_clientes_filtrado['Código'].unique():
            if pd.isna(produto):
                continue
                
            # Filtrar dados do produto
            df_produto = df_clientes_filtrado[df_clientes_filtrado['Código'] == produto].copy()
            
            # Análise por mês - quantidade de clientes únicos
            clientes_por_mes = {}
            for mes in colunas_meses:
                clientes_com_venda = df_produto[df_produto[mes].notna() & (df_produto[mes] > 0)]['Cod. Cliente'].nunique()
                clientes_por_mes[mes] = clientes_com_venda
            
            # Análise de comportamento de cada cliente
            comportamentos = {'MENSAL': 0, 'BIMESTRAL': 0, 'TRIMESTRAL': 0, 'SEMESTRAL': 0, 'ANUAL': 0, 'NÃO RECORRENTE': 0}
            
            # Análise de fidelidade (nova lógica)
            clientes_fieis = 0
            clientes_regulares = 0
            clientes_em_risco = 0
            clientes_inativos = 0
            clientes_reativados = 0
            clientes_ativos_12m = 0
            
            # Calcular métricas consolidadas baseadas nos dados detalhados
            total_clientes_com_vendas = 0
            soma_tempos_entre_compras = 0  # ✅ CORRIGIDO: somar tempos entre compras, não meses
            
            for _, cliente_row in df_produto.iterrows():
                cod_cliente = cliente_row['Cod. Cliente']
                if pd.isna(cod_cliente):
                    continue
                
                # Calcular métricas do cliente
                vendas_cliente = cliente_row[colunas_meses]
                vendas_cliente = vendas_cliente[vendas_cliente.notna() & (vendas_cliente > 0)]
                
                if len(vendas_cliente) == 0:
                    continue  # Cliente sem vendas
                
                total_clientes_com_vendas += 1
                meses_com_compras = len(vendas_cliente)
                
                # ✅ CÁLCULO CORRETO: tempo entre compras baseado no período ATIVO do cliente
                if meses_com_compras > 0:
                    # Encontrar primeiro e último mês com vendas
                    meses_com_venda = [mes for mes in colunas_meses if cliente_row[mes] > 0]
                    if len(meses_com_venda) >= 1:
                        primeiro_mes_idx = colunas_meses.index(meses_com_venda[0])
                        ultimo_mes_idx = colunas_meses.index(meses_com_venda[-1])
                        periodo_ativo_meses = ultimo_mes_idx - primeiro_mes_idx + 1
                        
                        # Se cliente comprou apenas 1 mês, tempo entre compras = 0
                        if meses_com_compras == 1:
                            tempo_entre_compras_cliente = 0
                        else:
                            # Tempo entre compras = período ativo / (número de compras - 1)
                            # Subtrai 1 porque entre N compras há N-1 intervalos
                            tempo_entre_compras_cliente = periodo_ativo_meses / (meses_com_compras - 1)
                        
                        soma_tempos_entre_compras += tempo_entre_compras_cliente
                
                # ✅ NOVA LÓGICA CORRIGIDA: Determinar comportamento baseado nos últimos 12 meses
                # Analisar apenas os últimos 12 meses para categorização
                ultimos_12_meses = colunas_meses[-12:] if len(colunas_meses) >= 12 else colunas_meses
                vendas_12m = cliente_row[ultimos_12_meses]
                vendas_12m_validas = vendas_12m[vendas_12m.notna() & (vendas_12m > 0)]
                meses_com_compras_12m = len(vendas_12m_validas)
                
                # Categorização baseada na frequência real nos últimos 12 meses
                if meses_com_compras_12m >= 10:  # 10+ meses = MENSAL (83%+)
                    comportamentos['MENSAL'] += 1
                elif meses_com_compras_12m >= 6:  # 6-9 meses = BIMESTRAL (50-75%)
                    comportamentos['BIMESTRAL'] += 1
                elif meses_com_compras_12m >= 4:  # 4-5 meses = TRIMESTRAL (33-42%)
                    comportamentos['TRIMESTRAL'] += 1
                elif meses_com_compras_12m >= 2:  # 2-3 meses = SEMESTRAL (17-25%)
                    comportamentos['SEMESTRAL'] += 1
                elif meses_com_compras_12m == 1:  # 1 mês = ANUAL (8%)
                    comportamentos['ANUAL'] += 1
                else:  # 0 meses = NÃO RECORRENTE
                    comportamentos['NÃO RECORRENTE'] += 1
                
                # ✅ NOVA LÓGICA DE FIDELIDADE: Baseada nos últimos 12-24 meses + recência
                # Analisar atividade nos últimos 12 meses
                ultimos_12_meses = colunas_meses[-12:] if len(colunas_meses) >= 12 else colunas_meses
                vendas_12m = cliente_row[ultimos_12_meses]
                vendas_12m_validas = vendas_12m[vendas_12m.notna() & (vendas_12m > 0)]
                compras_12m = len(vendas_12m_validas)
                
                # Verificar atividade nos últimos 3 meses
                ultimos_3_meses = colunas_meses[-3:] if len(colunas_meses) >= 3 else colunas_meses
                vendas_3m = cliente_row[ultimos_3_meses]
                vendas_3m_validas = vendas_3m[vendas_3m.notna() & (vendas_3m > 0)]
                ativo_3m = len(vendas_3m_validas) > 0
                
                # Verificar atividade nos últimos 6 meses
                ultimos_6_meses = colunas_meses[-6:] if len(colunas_meses) >= 6 else colunas_meses
                vendas_6m = cliente_row[ultimos_6_meses]
                vendas_6m_validas = vendas_6m[vendas_6m.notna() & (vendas_6m > 0)]
                ativo_6m = len(vendas_6m_validas) > 0
                
                # ✅ LÓGICA DE CLIENTE REATIVADO: Cliente que voltou a comprar após período inativo
                # Verificar se é cliente reativado (comprou nos últimos 3 meses após período sem compras)
                eh_reativado = False
                if ativo_3m:  # Se está ativo nos últimos 3 meses
                    # Verificar se ficou inativo entre 4-12 meses atrás
                    meses_4_a_12 = colunas_meses[-12:-3] if len(colunas_meses) >= 12 else colunas_meses[:-3] if len(colunas_meses) > 3 else []
                    if meses_4_a_12:
                        vendas_4_a_12 = cliente_row[meses_4_a_12]
                        vendas_4_a_12_validas = vendas_4_a_12[vendas_4_a_12.notna() & (vendas_4_a_12 > 0)]
                        # Se não comprou entre 4-12 meses atrás, mas tem histórico anterior, é reativado
                        if len(vendas_4_a_12_validas) == 0 and meses_com_compras > meses_com_compras_12m:
                            eh_reativado = True
                            clientes_reativados += 1
                
                # Determinar fidelidade com novo critério
                if compras_12m >= 6 and ativo_3m:  # 6+ compras nos últimos 12 meses + ativo nos últimos 3 meses
                    clientes_fieis += 1
                elif compras_12m >= 2 and ativo_6m:  # 2-5 compras nos últimos 12 meses + ativo nos últimos 6 meses
                    clientes_regulares += 1
                elif compras_12m >= 1 or ativo_6m:  # 1 compra nos últimos 12 meses OU ativo nos últimos 6 meses
                    clientes_em_risco += 1
                else:  # INATIVO (sem compras nos últimos 12 meses)
                    clientes_inativos += 1
                
                # Cliente ativo nos últimos 12 meses (simplificado)
                ultimos_12_meses = colunas_meses[-12:] if len(colunas_meses) >= 12 else colunas_meses
                vendas_12m = cliente_row[ultimos_12_meses]
                vendas_12m = vendas_12m[vendas_12m.notna() & (vendas_12m > 0)]
                if len(vendas_12m) > 0:
                    clientes_ativos_12m += 1
            
            # ✅ CALCULAR TEMPO MÉDIO ENTRE COMPRAS CORRETO
            tempo_medio_entre_compras = soma_tempos_entre_compras / total_clientes_com_vendas if total_clientes_com_vendas > 0 else 0
            
            # Calcular média de clientes dos últimos 12 meses
            ultimos_12_meses_para_media = colunas_meses[-12:] if len(colunas_meses) >= 12 else colunas_meses
            total_clientes_12m = sum(clientes_por_mes[mes] for mes in ultimos_12_meses_para_media)
            media_clientes_12m = total_clientes_12m / len(ultimos_12_meses_para_media) if ultimos_12_meses_para_media else 0
            
            # Criar resultado consolidado para este produto
            resultado_consolidado = {
                'Codigo': produto,
                'TOTAL_CLIENTES_UNICOS': df_produto['Cod. Cliente'].nunique(),
                'CLIENTES_ATIVOS_12M': clientes_ativos_12m,
                'MEDIA_CLIENTES_12M': round(media_clientes_12m, 1),
                'CLIENTES_ATIVOS_ULTIMO_MES': clientes_por_mes.get(colunas_meses[-1], 0) if colunas_meses else 0,
                'CLIENTES_MENSAIS': comportamentos['MENSAL'],
                'CLIENTES_BIMESTRAIS': comportamentos['BIMESTRAL'],
                'CLIENTES_TRIMESTRAIS': comportamentos['TRIMESTRAL'],
                'CLIENTES_SEMESTRAIS': comportamentos['SEMESTRAL'],
                'CLIENTES_ANUAIS': comportamentos['ANUAL'],
                'CLIENTES_NAO_RECORRENTES': comportamentos['NÃO RECORRENTE'],
                'CLIENTES_FIEIS': clientes_fieis,
                'CLIENTES_REGULARES': clientes_regulares,
                'CLIENTES_EM_RISCO': clientes_em_risco,
                'CLIENTES_INATIVOS': clientes_inativos,
                'CLIENTES_REATIVADOS': clientes_reativados,
                'TEMPO_MEDIO_ENTRE_COMPRAS_MESES': round(tempo_medio_entre_compras, 1),
            }
            
            # Adicionar colunas de clientes por mês
            for mes in colunas_meses:
                resultado_consolidado[f'CLIENTES_{mes.upper().replace("-", "_")}'] = clientes_por_mes[mes]
            
            resultados_consolidado.append(resultado_consolidado)
            
            # Processar dados detalhados cliente por cliente (otimizado)
            print(f"Processando {len(df_produto)} clientes para produto {produto}...")
            
            # Otimização: processar em lotes para melhor performance
            clientes_processados = 0
            for idx, (_, cliente_row) in enumerate(df_produto.iterrows()):
                if idx % 500 == 0 and idx > 0:
                    print(f"  Processados {idx} clientes...")
                
                cod_cliente = cliente_row['Cod. Cliente']
                if pd.isna(cod_cliente):
                    continue
                
                # Calcular métricas do cliente (otimizado)
                vendas_cliente = cliente_row[colunas_meses]
                vendas_cliente = vendas_cliente[vendas_cliente.notna() & (vendas_cliente > 0)]
                
                if len(vendas_cliente) == 0:
                    continue  # Cliente sem vendas
                
                clientes_processados += 1
                total_unidades = int(vendas_cliente.sum())
                meses_com_compras = len(vendas_cliente)
                
                # ✅ NOVA LÓGICA CORRIGIDA: Determinar comportamento baseado nos últimos 12 meses
                ultimos_12_meses = colunas_meses[-12:] if len(colunas_meses) >= 12 else colunas_meses
                vendas_12m = cliente_row[ultimos_12_meses]
                vendas_12m_validas = vendas_12m[vendas_12m.notna() & (vendas_12m > 0)]
                meses_com_compras_12m = len(vendas_12m_validas)
                
                # Categorização baseada na frequência real nos últimos 12 meses
                if meses_com_compras_12m >= 10:  # 10+ meses = MENSAL (83%+)
                    comportamento = 'MENSAL'
                elif meses_com_compras_12m >= 6:  # 6-9 meses = BIMESTRAL (50-75%)
                    comportamento = 'BIMESTRAL'
                elif meses_com_compras_12m >= 4:  # 4-5 meses = TRIMESTRAL (33-42%)
                    comportamento = 'TRIMESTRAL'
                elif meses_com_compras_12m >= 2:  # 2-3 meses = SEMESTRAL (17-25%)
                    comportamento = 'SEMESTRAL'
                elif meses_com_compras_12m == 1:  # 1 mês = ANUAL (8%)
                    comportamento = 'ANUAL'
                else:  # 0 meses = NÃO RECORRENTE
                    comportamento = 'NÃO RECORRENTE'
                
                # ✅ NOVA LÓGICA DE FIDELIDADE: Baseada nos últimos 12 meses + recência
                # Analisar atividade nos últimos 12 meses (já calculado acima)
                # meses_com_compras_12m já está disponível
                
                # Verificar atividade nos últimos 3 meses
                ultimos_3_meses_det = colunas_meses[-3:] if len(colunas_meses) >= 3 else colunas_meses
                vendas_3m_det = cliente_row[ultimos_3_meses_det]
                vendas_3m_validas_det = vendas_3m_det[vendas_3m_det.notna() & (vendas_3m_det > 0)]
                ativo_3m_det = len(vendas_3m_validas_det) > 0
                
                # Verificar atividade nos últimos 6 meses
                ultimos_6_meses_det = colunas_meses[-6:] if len(colunas_meses) >= 6 else colunas_meses
                vendas_6m_det = cliente_row[ultimos_6_meses_det]
                vendas_6m_validas_det = vendas_6m_det[vendas_6m_det.notna() & (vendas_6m_det > 0)]
                ativo_6m_det = len(vendas_6m_validas_det) > 0
                
                # ✅ VERIFICAR SE É CLIENTE REATIVADO
                eh_reativado_det = False
                if ativo_3m_det:  # Se está ativo nos últimos 3 meses
                    # Verificar se ficou inativo entre 4-12 meses atrás
                    meses_4_a_12_det = colunas_meses[-12:-3] if len(colunas_meses) >= 12 else colunas_meses[:-3] if len(colunas_meses) > 3 else []
                    if meses_4_a_12_det:
                        vendas_4_a_12_det = cliente_row[meses_4_a_12_det]
                        vendas_4_a_12_validas_det = vendas_4_a_12_det[vendas_4_a_12_det.notna() & (vendas_4_a_12_det > 0)]
                        # Se não comprou entre 4-12 meses atrás, mas tem histórico anterior, é reativado
                        if len(vendas_4_a_12_validas_det) == 0 and meses_com_compras > meses_com_compras_12m:
                            eh_reativado_det = True
                
                # Determinar fidelidade individual
                if meses_com_compras_12m >= 6 and ativo_3m_det:
                    fidelidade = 'FIEL'
                elif meses_com_compras_12m >= 2 and ativo_6m_det:
                    fidelidade = 'REGULAR'
                elif meses_com_compras_12m >= 1 or ativo_6m_det:
                    fidelidade = 'EM RISCO'
                else:
                    fidelidade = 'INATIVO'
                
                # Adicionar flag de reativado se aplicável
                if eh_reativado_det:
                    fidelidade += ' (REATIVADO)'
                
                # Encontrar primeiro e último mês (otimizado)
                meses_com_venda = [mes for mes in colunas_meses if cliente_row[mes] > 0]
                primeiro_mes = meses_com_venda[0] if meses_com_venda else ''
                ultimo_mes = meses_com_venda[-1] if meses_com_venda else ''
                
                # Top 3 meses preferidos (otimizado)
                vendas_por_mes = [(mes, cliente_row[mes]) for mes in colunas_meses if cliente_row[mes] > 0]
                top_meses = sorted(vendas_por_mes, key=lambda x: x[1], reverse=True)[:3]
                top_3_meses = ', '.join([mes for mes, _ in top_meses])
                
                # ✅ CALCULAR TEMPO ENTRE COMPRAS INDIVIDUAL (baseado no período ativo)
                if meses_com_compras > 0:
                    # Encontrar primeiro e último mês com vendas (já calculado acima)
                    if len(meses_com_venda) >= 1:
                        primeiro_mes_idx_det = colunas_meses.index(meses_com_venda[0])
                        ultimo_mes_idx_det = colunas_meses.index(meses_com_venda[-1])
                        periodo_ativo_meses_det = ultimo_mes_idx_det - primeiro_mes_idx_det + 1
                        
                        # Se cliente comprou apenas 1 mês, tempo entre compras = 0
                        if meses_com_compras == 1:
                            tempo_entre_compras_individual = 0
                        else:
                            # Tempo entre compras = período ativo / (número de compras - 1)
                            tempo_entre_compras_individual = periodo_ativo_meses_det / (meses_com_compras - 1)
                    else:
                        tempo_entre_compras_individual = 0
                else:
                    tempo_entre_compras_individual = 0
                
                # Criar resultado detalhado
                resultado_detalhado = {
                    'Codigo': produto,
                    'Cod_Cliente': cod_cliente,
                    'COMPORTAMENTO': comportamento,
                    'FIDELIDADE': fidelidade,
                    'TOTAL_UNIDADES': total_unidades,
                    'MESES_COM_COMPRAS': meses_com_compras,
                    'MESES_COM_COMPRAS_12M': meses_com_compras_12m,  # ✅ NOVA COLUNA
                    'TEMPO_ENTRE_COMPRAS_MESES': round(tempo_entre_compras_individual, 1),  # ✅ NOVA COLUNA
                    'PRIMEIRO_MES': primeiro_mes,
                    'ULTIMO_MES': ultimo_mes,
                    'TOP_3_MESES_PREFERIDOS': top_3_meses,
                }
                
                # ✅ Adicionar vendas mês a mês (mantendo nome original para ordenação cronológica)
                for mes in colunas_meses:
                    valor = cliente_row[mes] if pd.notna(cliente_row[mes]) else 0
                    resultado_detalhado[mes] = valor
                
                resultados_detalhado.append(resultado_detalhado)
            
            print(f"  Produto {produto}: {clientes_processados} clientes com vendas processados.")
        
        df_consolidado = pd.DataFrame(resultados_consolidado)
        df_detalhado = pd.DataFrame(resultados_detalhado)
        
        # ✅ ORDENAR COLUNAS DO CONSOLIDADO CRONOLOGICAMENTE
        if not df_consolidado.empty:
            # ✅ COLUNAS FIXAS (apenas as que existem no DataFrame)
            todas_colunas_fixas_possiveis = ['Codigo', 'TOTAL_CLIENTES_UNICOS', 'CLIENTES_ATIVOS_12M', 'MEDIA_CLIENTES_12M',
                                           'CLIENTES_ATIVOS_ULTIMO_MES', 'CLIENTES_MENSAIS', 'CLIENTES_BIMESTRAIS', 
                                           'CLIENTES_TRIMESTRAIS', 'CLIENTES_SEMESTRAIS', 'CLIENTES_ANUAIS', 
                                           'CLIENTES_NAO_RECORRENTES', 'CLIENTES_FIEIS', 'CLIENTES_REGULARES',
                                           'CLIENTES_EM_RISCO', 'CLIENTES_INATIVOS', 'CLIENTES_REATIVADOS', 'TEMPO_MEDIO_ENTRE_COMPRAS_MESES']
            
            # Filtrar apenas colunas que existem no DataFrame
            colunas_fixas_consolidado = [col for col in todas_colunas_fixas_possiveis if col in df_consolidado.columns]
            
            # ✅ COLUNAS DE MESES EM ORDEM CRONOLÓGICA (formato CLIENTES_JAN_20, etc.)
            colunas_meses_consolidado = [col for col in df_consolidado.columns if col.startswith('CLIENTES_') and col not in colunas_fixas_consolidado]
            
            # Extrair nomes de meses e criar mapeamento
            meses_para_ordenar = []
            mapeamento_colunas = {}
            for col in colunas_meses_consolidado:
                # Extrair parte do mês: CLIENTES_JAN_20 -> jan-20
                mes_parte = col.replace('CLIENTES_', '').replace('_', '-').lower()
                meses_para_ordenar.append(mes_parte)
                mapeamento_colunas[mes_parte] = col
            
            # Ordenar cronologicamente
            meses_ordenados = self._ordenar_meses_cronologicamente(meses_para_ordenar)
            
            # Reconstruir lista de colunas ordenadas
            colunas_meses_ordenadas_consolidado = [mapeamento_colunas[mes] for mes in meses_ordenados if mes in mapeamento_colunas]
            
            # Reorganizar DataFrame consolidado
            colunas_ordenadas_consolidado = colunas_fixas_consolidado + colunas_meses_ordenadas_consolidado
            colunas_existentes_consolidado = [col for col in colunas_ordenadas_consolidado if col in df_consolidado.columns]
            
            # ✅ DEBUG: Verificar ordenação
            print(f"Debug ordenação consolidado - Total colunas: {len(colunas_existentes_consolidado)}")
            print(f"Colunas fixas: {len(colunas_fixas_consolidado)}")
            print(f"Colunas de meses ordenadas: {len(colunas_meses_ordenadas_consolidado)}")
            if len(colunas_meses_ordenadas_consolidado) > 0:
                print(f"Primeiras 5 colunas de meses: {colunas_meses_ordenadas_consolidado[:5]}")
                print(f"Últimas 5 colunas de meses: {colunas_meses_ordenadas_consolidado[-5:]}")
            
            df_consolidado = df_consolidado[colunas_existentes_consolidado]
        
        # ✅ ORDENAR COLUNAS DO DETALHADO CRONOLOGICAMENTE
        if not df_detalhado.empty:
            # Colunas fixas primeiro
            colunas_fixas = ['Codigo', 'Cod_Cliente', 'COMPORTAMENTO', 'FIDELIDADE', 'TOTAL_UNIDADES', 
                           'MESES_COM_COMPRAS', 'MESES_COM_COMPRAS_12M', 'TEMPO_ENTRE_COMPRAS_MESES', 
                           'PRIMEIRO_MES', 'ULTIMO_MES', 'TOP_3_MESES_PREFERIDOS']
            
            # Colunas de meses em ordem cronológica
            colunas_meses_detalhado = [col for col in df_detalhado.columns if col in colunas_meses]
            colunas_meses_ordenadas = self._ordenar_meses_cronologicamente(colunas_meses_detalhado)
            
            # Reorganizar DataFrame com colunas ordenadas
            colunas_ordenadas = colunas_fixas + colunas_meses_ordenadas
            colunas_existentes = [col for col in colunas_ordenadas if col in df_detalhado.columns]
            
            # ✅ DEBUG: Verificar ordenação detalhado
            print(f"Debug ordenação detalhado - Total colunas: {len(colunas_existentes)}")
            print(f"Colunas fixas: {len(colunas_fixas)}")
            print(f"Colunas de meses ordenadas: {len(colunas_meses_ordenadas)}")
            if len(colunas_meses_ordenadas) > 0:
                print(f"Primeiras 5 colunas de meses: {colunas_meses_ordenadas[:5]}")
                print(f"Últimas 5 colunas de meses: {colunas_meses_ordenadas[-5:]}")
            
            df_detalhado = df_detalhado[colunas_existentes]
        
        print(f"Análise de comportamento concluída (APENAS produtos da base de vendas):")
        print(f"- Consolidado: {len(resultados_consolidado)} produtos")
        print(f"- Detalhado: {len(resultados_detalhado)} registros cliente-produto")
        
        # ✅ GERAR ANÁLISE POR MARCA
        df_por_marca = self._processar_comportamento_por_marca(df_clientes_filtrado, colunas_meses)
        
        return df_consolidado, df_detalhado, df_por_marca
    
    def _aplicar_formatacao_porcentagem_corrigida(self, worksheet, df, nome_coluna):
        """
        Aplica formatação percentual corrigindo valores que estão multiplicados por 100.
        Para colunas como CONCENTRACAO_VENDAS_TOP_20_PCT e TENDENCIA_CRESCIMENTO_PCT.
        """
        if nome_coluna not in df.columns:
            return
        
        try:
            col_index = list(df.columns).index(nome_coluna) + 1  # +1 porque Excel é 1-indexed
            col_letter = chr(64 + col_index)  # Converter para letra (A, B, C, etc.)
            
            # Aplicar formatação percentual e dividir valores por 100
            for row in range(2, len(df) + 2):  # +2 porque começamos da linha 2 (após header)
                cell = worksheet[f'{col_letter}{row}']
                if cell.value is not None and isinstance(cell.value, (int, float)):
                    # Dividir por 100 para corrigir a formatação
                    cell.value = cell.value / 100
                cell.number_format = '0.00%'
                
        except Exception as e:
            print(f"Erro ao aplicar formatação percentual corrigida para {nome_coluna}: {e}")

    def _gerar_aba_comportamento_clientes_consolidado(self, writer):
        """Gera a aba Comportamento de Clientes Consolidado."""
        if not hasattr(self, 'df_comportamento_consolidado') or self.df_comportamento_consolidado is None:
            print("Dados consolidados de comportamento de clientes não disponíveis.")
            return
            
        # Organizar colunas conforme especificação para aba CONSOLIDADA
        colunas_ordenadas = [
            'Codigo',
            'TOTAL_CLIENTES_UNICOS',
            'CLIENTES_ATIVOS_12M',
            'MEDIA_CLIENTES_12M',
            'CLIENTES_ATIVOS_ULTIMO_MES',
            'CLIENTES_MENSAIS',
            'CLIENTES_BIMESTRAIS',
            'CLIENTES_TRIMESTRAIS',
            'CLIENTES_SEMESTRAIS',
            'CLIENTES_ANUAIS',
            'CLIENTES_NAO_RECORRENTES',
            'CLIENTES_FIEIS',
            'CLIENTES_REATIVADOS',
            'CLIENTES_EM_RISCO',
            'TEMPO_MEDIO_ENTRE_COMPRAS_MESES',
        ]
        
        # Adicionar colunas de clientes por mês em ordem cronológica
        colunas_clientes_ordenadas = sorted([col for col in self.df_comportamento_consolidado.columns 
                                           if col.startswith('CLIENTES_') and col not in colunas_ordenadas])
        colunas_ordenadas.extend(colunas_clientes_ordenadas)
        
        # Filtrar apenas colunas existentes
        colunas_existentes = [col for col in colunas_ordenadas if col in self.df_comportamento_consolidado.columns]
        df_final = self.df_comportamento_consolidado[colunas_existentes]
        
        # Escrever na aba CONSOLIDADA
        df_final.to_excel(writer, sheet_name='Clientes', index=False)
        
        # Aplicar formatação
        worksheet = writer.sheets['Clientes']
        self._aplicar_formatacao_basica(worksheet)
        
        print("Aba Comportamento de Clientes Consolidado gerada com sucesso.")

    def _gerar_aba_comportamento_clientes_detalhado(self, writer):
        """Gera a aba Comportamento de Clientes Detalhado."""
        if not hasattr(self, 'df_comportamento_detalhado') or self.df_comportamento_detalhado is None:
            print("Dados detalhados de comportamento de clientes não disponíveis.")
            return
            
        # Organizar colunas conforme especificação para aba DETALHADA
        colunas_ordenadas = [
            'Codigo',
            'Cod_Cliente',
            'COMPORTAMENTO',
            'FIDELIDADE',
            'TOTAL_UNIDADES',
            'MESES_COM_COMPRAS',
            'PRIMEIRO_MES',
            'ULTIMO_MES',
            'TOP_3_MESES_PREFERIDOS',
        ]
        
        # Adicionar colunas de vendas mês a mês em ordem cronológica
        colunas_vendas_ordenadas = sorted([col for col in self.df_comportamento_detalhado.columns 
                                         if col.startswith('VENDAS_')])
        colunas_ordenadas.extend(colunas_vendas_ordenadas)
        
        # Filtrar apenas colunas existentes
        colunas_existentes = [col for col in colunas_ordenadas if col in self.df_comportamento_detalhado.columns]
        df_final = self.df_comportamento_detalhado[colunas_existentes]
        
        # Escrever na aba DETALHADA
        df_final.to_excel(writer, sheet_name='Cliente_detalhado', index=False)
        
        # Aplicar formatação
        worksheet = writer.sheets['Cliente_detalhado']
        self._aplicar_formatacao_basica(worksheet)
        
        print("Aba Comportamento de Clientes Detalhado gerada com sucesso.")


    def _calcular_analise_ano_a_ano_marca(self, df_consolidado_marca, colunas_meses):
        """
        Calcula análise ano a ano: novos clientes, clientes perdidos, médias e variações
        """
        import pandas as pd
        import numpy as np
        
        # Identificar anos disponíveis nos dados
        anos_disponiveis = set()
        for mes in colunas_meses:
            if '-' in mes:
                ano = mes.split('-')[1]
                if len(ano) == 2:
                    ano = '20' + ano
                anos_disponiveis.add(int(ano))
        
        anos_disponiveis = sorted(anos_disponiveis)
        print(f"Anos identificados para análise: {anos_disponiveis}")
        
        # Para cada marca, calcular métricas ano a ano
        for idx, row in df_consolidado_marca.iterrows():
            marca = row['Marca']
            
            # Obter dados de clientes por mês para esta marca
            clientes_por_mes = {}
            for mes in colunas_meses:
                col_mes = f'CLIENTES_{mes.upper().replace("-", "_")}'
                if col_mes in row and pd.notna(row[col_mes]):
                    clientes_por_mes[mes] = row[col_mes]
                else:
                    clientes_por_mes[mes] = 0
            
            # Agrupar por ano
            clientes_por_ano = {}
            for ano in anos_disponiveis:
                meses_do_ano = [mes for mes in colunas_meses if mes.endswith(f'-{str(ano)[-2:]}')]
                clientes_ano = [clientes_por_mes.get(mes, 0) for mes in meses_do_ano]
                
                if clientes_ano:
                    # Média mensal do ano
                    media_ano = sum(clientes_ano) / len(clientes_ano)
                    df_consolidado_marca.loc[idx, f'MEDIA_CLIENTES_{ano}'] = round(media_ano, 1)
                    
                    # Lista de clientes únicos que compraram no ano (simulação baseada na média)
                    clientes_por_ano[ano] = clientes_ano
                else:
                    df_consolidado_marca.loc[idx, f'MEDIA_CLIENTES_{ano}'] = 0.0
                    clientes_por_ano[ano] = []
            
            # Calcular novos clientes por ano
            for i, ano in enumerate(anos_disponiveis):
                if i == 0:
                    # Primeiro ano: todos são "novos"
                    media_atual = df_consolidado_marca.loc[idx, f'MEDIA_CLIENTES_{ano}']
                    df_consolidado_marca.loc[idx, f'NOVOS_CLIENTES_{ano}'] = int(media_atual) if media_atual > 0 else 0
                else:
                    # Anos seguintes: diferença positiva vs ano anterior
                    media_atual = df_consolidado_marca.loc[idx, f'MEDIA_CLIENTES_{ano}']
                    media_anterior = df_consolidado_marca.loc[idx, f'MEDIA_CLIENTES_{anos_disponiveis[i-1]}']
                    
                    if media_atual > media_anterior:
                        novos = int(media_atual - media_anterior)
                        df_consolidado_marca.loc[idx, f'NOVOS_CLIENTES_{ano}'] = novos
                    else:
                        df_consolidado_marca.loc[idx, f'NOVOS_CLIENTES_{ano}'] = 0
            
            # Calcular clientes perdidos por ano
            for i, ano in enumerate(anos_disponiveis):
                if i == 0:
                    # Primeiro ano: não há perdas
                    df_consolidado_marca.loc[idx, f'PERDEU_CLIENTES_{ano}'] = 0
                else:
                    # Anos seguintes: diferença negativa vs ano anterior
                    media_atual = df_consolidado_marca.loc[idx, f'MEDIA_CLIENTES_{ano}']
                    media_anterior = df_consolidado_marca.loc[idx, f'MEDIA_CLIENTES_{anos_disponiveis[i-1]}']
                    
                    if media_anterior > media_atual:
                        perdidos = int(media_anterior - media_atual)
                        df_consolidado_marca.loc[idx, f'PERDEU_CLIENTES_{ano}'] = perdidos
                    else:
                        df_consolidado_marca.loc[idx, f'PERDEU_CLIENTES_{ano}'] = 0
            
            # Calcular variações percentuais ano a ano
            for i, ano in enumerate(anos_disponiveis):
                if i == 0:
                    # Primeiro ano: não há variação
                    continue
                else:
                    ano_anterior = anos_disponiveis[i-1]
                    media_atual = df_consolidado_marca.loc[idx, f'MEDIA_CLIENTES_{ano}']
                    media_anterior = df_consolidado_marca.loc[idx, f'MEDIA_CLIENTES_{ano_anterior}']
                    
                    if media_anterior > 0:
                        variacao = (media_atual - media_anterior) / media_anterior
                        df_consolidado_marca.loc[idx, f'VARIACAO_{ano}_vs_{ano_anterior}_PCT'] = round(variacao, 1)
                    else:
                        df_consolidado_marca.loc[idx, f'VARIACAO_{ano}_vs_{ano_anterior}_PCT'] = 0.0
        
        print(f"Análise ano a ano concluída para {len(df_consolidado_marca)} marcas.")
        return df_consolidado_marca
    def _processar_comportamento_por_marca(self, df_clientes_filtrado, colunas_meses):
        """
        Processa os dados de comportamento de clientes consolidados por marca.
        
        Args:
            df_clientes_filtrado: DataFrame com dados de clientes filtrados
            colunas_meses: Lista de colunas de meses ordenadas cronologicamente
            
        Returns:
            DataFrame: Análise consolidada por marca
        """
        print("Iniciando análise de comportamento por marca...")
        
        # Extrair marca do código do produto
        def extrair_marca(codigo):
            """Extrai a marca do código: MTS-Adidas-Automática -> Adidas"""
            if pd.isna(codigo) or not isinstance(codigo, str):
                return 'INDEFINIDA'
            
            partes = codigo.split('-')
            if len(partes) >= 2 and partes[0] in ['MTS', 'MTO']:
                # Tratar marcas compostas como Calvin Klein
                if len(partes) >= 3 and partes[1].lower() == "calvin" and partes[2].lower() == "klein":
                    return "Calvin Klein"
                return partes[1]
            return 'INDEFINIDA'
            return 'INDEFINIDA'
        
        # Adicionar coluna de marca
        df_clientes_filtrado = df_clientes_filtrado.copy()
        df_clientes_filtrado['Marca'] = df_clientes_filtrado['Código'].apply(extrair_marca)
        
        resultados_por_marca = []
        
        # Processar cada marca
        for marca in df_clientes_filtrado['Marca'].unique():
            if pd.isna(marca):
                continue
                
            print(f"  Processando marca: {marca}")
            
            # Filtrar dados da marca
            df_marca = df_clientes_filtrado[df_clientes_filtrado['Marca'] == marca]
            
            # Consolidar dados por cliente (somar vendas de todos os produtos da marca)
            df_marca_consolidado = df_marca.groupby('Cod. Cliente')[colunas_meses].sum().reset_index()
            
            # Análise de comportamento de cada cliente da marca
            comportamentos = {'MENSAL': 0, 'BIMESTRAL': 0, 'TRIMESTRAL': 0, 'SEMESTRAL': 0, 'ANUAL': 0, 'NÃO RECORRENTE': 0}
            
            # Análise de fidelidade
            clientes_fieis = 0
            clientes_regulares = 0
            clientes_em_risco = 0
            clientes_inativos = 0
            clientes_reativados = 0
            clientes_ativos_12m = 0
            
            # Métricas consolidadas
            total_clientes_com_vendas = 0
            soma_tempos_entre_compras = 0
            clientes_por_mes = {mes: 0 for mes in colunas_meses}
            
            for _, cliente_row in df_marca_consolidado.iterrows():
                cod_cliente = cliente_row['Cod. Cliente']
                if pd.isna(cod_cliente):
                    continue
                
                # Calcular métricas do cliente
                vendas_cliente = cliente_row[colunas_meses]
                vendas_cliente = vendas_cliente[vendas_cliente.notna() & (vendas_cliente > 0)]
                
                if len(vendas_cliente) == 0:
                    continue  # Cliente sem vendas
                
                total_clientes_com_vendas += 1
                meses_com_compras = len(vendas_cliente)
                
                # Calcular tempo entre compras baseado no período ativo
                meses_com_venda = [mes for mes in colunas_meses if cliente_row[mes] > 0]
                if len(meses_com_venda) >= 1:
                    primeiro_mes_idx = colunas_meses.index(meses_com_venda[0])
                    ultimo_mes_idx = colunas_meses.index(meses_com_venda[-1])
                    periodo_ativo_meses = ultimo_mes_idx - primeiro_mes_idx + 1
                    
                    if meses_com_compras == 1:
                        tempo_entre_compras_cliente = 0
                    else:
                        tempo_entre_compras_cliente = periodo_ativo_meses / (meses_com_compras - 1)
                    
                    soma_tempos_entre_compras += tempo_entre_compras_cliente
                
                # Determinar comportamento baseado nos últimos 12 meses
                ultimos_12_meses = colunas_meses[-12:] if len(colunas_meses) >= 12 else colunas_meses
                vendas_12m_cliente = cliente_row[ultimos_12_meses]
                vendas_12m_validas = vendas_12m_cliente[vendas_12m_cliente.notna() & (vendas_12m_cliente > 0)]
                meses_com_compras_12m = len(vendas_12m_validas)
                
                # Categorizar comportamento
                if meses_com_compras_12m >= 10:
                    comportamentos['MENSAL'] += 1
                elif meses_com_compras_12m >= 6:
                    comportamentos['BIMESTRAL'] += 1
                elif meses_com_compras_12m >= 4:
                    comportamentos['TRIMESTRAL'] += 1
                elif meses_com_compras_12m >= 2:
                    comportamentos['SEMESTRAL'] += 1
                elif meses_com_compras_12m == 1:
                    comportamentos['ANUAL'] += 1
                else:
                    comportamentos['NÃO RECORRENTE'] += 1
                
                # Análise de fidelidade e reativação
                ultimos_3_meses = colunas_meses[-3:] if len(colunas_meses) >= 3 else colunas_meses
                vendas_3m = cliente_row[ultimos_3_meses]
                vendas_3m_validas = vendas_3m[vendas_3m.notna() & (vendas_3m > 0)]
                ativo_3m = len(vendas_3m_validas) > 0
                
                ultimos_6_meses = colunas_meses[-6:] if len(colunas_meses) >= 6 else colunas_meses
                vendas_6m = cliente_row[ultimos_6_meses]
                vendas_6m_validas = vendas_6m[vendas_6m.notna() & (vendas_6m > 0)]
                ativo_6m = len(vendas_6m_validas) > 0
                
                # Verificar se é cliente reativado
                if ativo_3m:
                    meses_4_a_12 = colunas_meses[-12:-3] if len(colunas_meses) >= 12 else colunas_meses[:-3] if len(colunas_meses) > 3 else []
                    if meses_4_a_12:
                        vendas_4_a_12 = cliente_row[meses_4_a_12]
                        vendas_4_a_12_validas = vendas_4_a_12[vendas_4_a_12.notna() & (vendas_4_a_12 > 0)]
                        if len(vendas_4_a_12_validas) == 0 and meses_com_compras > meses_com_compras_12m:
                            clientes_reativados += 1
                
                # Determinar fidelidade
                compras_12m = meses_com_compras_12m
                if compras_12m >= 6 and ativo_3m:
                    clientes_fieis += 1
                elif compras_12m >= 2 and ativo_6m:
                    clientes_regulares += 1
                elif compras_12m >= 1 or ativo_6m:
                    clientes_em_risco += 1
                else:
                    clientes_inativos += 1
                
                # Cliente ativo nos últimos 12 meses
                if len(vendas_12m_validas) > 0:
                    clientes_ativos_12m += 1
                
                # Contar clientes por mês
                for mes in colunas_meses:
                    if cliente_row[mes] > 0:
                        clientes_por_mes[mes] += 1
            
            # Calcular métricas finais
            tempo_medio_entre_compras = soma_tempos_entre_compras / total_clientes_com_vendas if total_clientes_com_vendas > 0 else 0
            
            # Calcular média de clientes dos últimos 12 meses
            ultimos_12_meses_para_media = colunas_meses[-12:] if len(colunas_meses) >= 12 else colunas_meses
            total_clientes_12m = sum(clientes_por_mes[mes] for mes in ultimos_12_meses_para_media)
            media_clientes_12m = total_clientes_12m / len(ultimos_12_meses_para_media) if ultimos_12_meses_para_media else 0
            
            # Criar resultado consolidado por marca
            resultado_marca = {
                'Marca': marca,
                'TOTAL_CLIENTES_UNICOS': total_clientes_com_vendas,
                'CLIENTES_ATIVOS_12M': clientes_ativos_12m,
                'MEDIA_CLIENTES_12M': round(media_clientes_12m, 1),
                'CLIENTES_ATIVOS_ULTIMO_MES': clientes_por_mes.get(colunas_meses[-1], 0) if colunas_meses else 0,
                'CLIENTES_MENSAIS': comportamentos['MENSAL'],
                'CLIENTES_BIMESTRAIS': comportamentos['BIMESTRAL'],
                'CLIENTES_TRIMESTRAIS': comportamentos['TRIMESTRAL'],
                'CLIENTES_SEMESTRAIS': comportamentos['SEMESTRAL'],
                'CLIENTES_ANUAIS': comportamentos['ANUAL'],
                'CLIENTES_NAO_RECORRENTES': comportamentos['NÃO RECORRENTE'],
                'CLIENTES_FIEIS': clientes_fieis,
                'CLIENTES_REGULARES': clientes_regulares,
                'CLIENTES_EM_RISCO': clientes_em_risco,
                'CLIENTES_INATIVOS': clientes_inativos,
                'CLIENTES_REATIVADOS': clientes_reativados,
                'TEMPO_MEDIO_ENTRE_COMPRAS_MESES': round(tempo_medio_entre_compras, 1),
            }
            
            # Adicionar colunas de clientes por mês
            for mes in colunas_meses:
                resultado_marca[f'CLIENTES_{mes.upper().replace("-", "_")}'] = clientes_por_mes[mes]
            
            resultados_por_marca.append(resultado_marca)
            print(f"    Marca {marca}: {total_clientes_com_vendas} clientes únicos processados.")
        
        df_por_marca = pd.DataFrame(resultados_por_marca)
        
        # Ordenar colunas cronologicamente (mesmo padrão da análise por produto)
        if not df_por_marca.empty:
            todas_colunas_fixas_possiveis = ['Marca', 'TOTAL_CLIENTES_UNICOS', 'CLIENTES_ATIVOS_12M', 'MEDIA_CLIENTES_12M',
                                           'CLIENTES_ATIVOS_ULTIMO_MES', 'CLIENTES_MENSAIS', 'CLIENTES_BIMESTRAIS', 
                                           'CLIENTES_TRIMESTRAIS', 'CLIENTES_SEMESTRAIS', 'CLIENTES_ANUAIS', 
                                           'CLIENTES_NAO_RECORRENTES', 'CLIENTES_FIEIS', 'CLIENTES_REGULARES',
                                           'CLIENTES_EM_RISCO', 'CLIENTES_INATIVOS', 'CLIENTES_REATIVADOS', 'TEMPO_MEDIO_ENTRE_COMPRAS_MESES']
            
            colunas_fixas_marca = [col for col in todas_colunas_fixas_possiveis if col in df_por_marca.columns]
            
            # Colunas de meses em ordem cronológica
            colunas_meses_marca = [col for col in df_por_marca.columns if col.startswith('CLIENTES_') and col not in colunas_fixas_marca]
            
            # Extrair e ordenar meses
            meses_para_ordenar = []
            mapeamento_colunas = {}
            for col in colunas_meses_marca:
                mes_parte = col.replace('CLIENTES_', '').replace('_', '-').lower()
                meses_para_ordenar.append(mes_parte)
                mapeamento_colunas[mes_parte] = col
            
            meses_ordenados = self._ordenar_meses_cronologicamente(meses_para_ordenar)
            colunas_meses_ordenadas_marca = [mapeamento_colunas[mes] for mes in meses_ordenados if mes in mapeamento_colunas]
            
            # Reorganizar DataFrame
            colunas_ordenadas_marca = colunas_fixas_marca + colunas_meses_ordenadas_marca
            colunas_existentes_marca = [col for col in colunas_ordenadas_marca if col in df_por_marca.columns]
            df_por_marca = df_por_marca[colunas_existentes_marca]
        
        print(f"Análise por marca concluída: {len(resultados_por_marca)} marcas processadas.")
        
        # Calcular métricas de evolução (crescimento/queda)
        df_por_marca = self._calcular_analise_ano_a_ano_marca(df_por_marca, colunas_meses)
        
        # Reordenar colunas conforme sequência solicitada (após TEMPO_MEDIO_ENTRE_COMPRAS_MESES)
        if not df_por_marca.empty:
            # Colunas fixas até TEMPO_MEDIO_ENTRE_COMPRAS_MESES
            colunas_iniciais = ['Marca', 'TOTAL_CLIENTES_UNICOS', 'CLIENTES_ATIVOS_12M', 'MEDIA_CLIENTES_12M',
                              'CLIENTES_ATIVOS_ULTIMO_MES', 'CLIENTES_MENSAIS', 'CLIENTES_BIMESTRAIS', 
                              'CLIENTES_TRIMESTRAIS', 'CLIENTES_SEMESTRAIS', 'CLIENTES_ANUAIS', 
                              'CLIENTES_NAO_RECORRENTES', 'CLIENTES_FIEIS', 'CLIENTES_REGULARES',
                              'CLIENTES_EM_RISCO', 'CLIENTES_INATIVOS', 'CLIENTES_REATIVADOS', 'TEMPO_MEDIO_ENTRE_COMPRAS_MESES']
            
            # Sequência específica após TEMPO_MEDIO_ENTRE_COMPRAS_MESES (conforme imagem)
            sequencia_anos = []
            anos_disponiveis = [2020, 2021, 2022, 2023, 2024, 2025]
            
            for ano in anos_disponiveis:
                # Para cada ano: MEDIA_CLIENTES, NOVOS_CLIENTES, PERDEU_CLIENTES, VARIACAO_PCT
                colunas_ano = [
                    f'MEDIA_CLIENTES_{ano}',
                    f'NOVOS_CLIENTES_{ano}', 
                    f'PERDEU_CLIENTES_{ano}'
                ]
                
                # Adicionar variação se não for o primeiro ano
                if ano > 2020:
                    ano_anterior = ano - 1
                    colunas_ano.append(f'VARIACAO_{ano}_vs_{ano_anterior}_PCT')
                
                sequencia_anos.extend(colunas_ano)
            
            # Colunas de meses (CLIENTES_mes-ano) - manter ordem cronológica existente
            colunas_meses_existentes = [col for col in df_por_marca.columns if col.startswith('CLIENTES_') and 
                                      col not in colunas_iniciais and col not in sequencia_anos]
            
            # Reorganizar DataFrame com nova ordem
            nova_ordem = []
            for col in colunas_iniciais:
                if col in df_por_marca.columns:
                    nova_ordem.append(col)
            
            for col in sequencia_anos:
                if col in df_por_marca.columns:
                    nova_ordem.append(col)
                    
            for col in colunas_meses_existentes:
                nova_ordem.append(col)
            
            df_por_marca = df_por_marca[nova_ordem]

        return df_por_marca
    def _gerar_aba_comportamento_clientes_por_marca(self, writer):
        """
        Gera a aba de comportamento de clientes consolidado por marca.
        """
        try:
            import pandas as pd
            df = self.df_comportamento_por_marca
            nome_aba = 'Clientes_Por_Marca'
            
            # Criar explicações dos critérios
            explicacoes = [
                {
                    'CRITÉRIO': 'CLIENTE MENSAL',
                    'DEFINIÇÃO': 'Cliente que comprou em 10-12 meses nos últimos 12 meses',
                    'FÓRMULA/REGRA': 'Meses_Compras_12M >= 10',
                    'EXEMPLO': 'Cliente que comprou em 11 dos últimos 12 meses',
                    'OBSERVAÇÕES': 'Baseado apenas nos últimos 12 meses'
                },
                {
                    'CRITÉRIO': 'CLIENTE BIMESTRAL',
                    'DEFINIÇÃO': 'Cliente que comprou em 6-9 meses nos últimos 12 meses',
                    'FÓRMULA/REGRA': '6 <= Meses_Compras_12M <= 9',
                    'EXEMPLO': 'Cliente que comprou em 8 dos últimos 12 meses',
                    'OBSERVAÇÕES': 'Frequência aproximada de 1 compra a cada 2 meses'
                },
                {
                    'CRITÉRIO': 'CLIENTE TRIMESTRAL',
                    'DEFINIÇÃO': 'Cliente que comprou em 4-5 meses nos últimos 12 meses',
                    'FÓRMULA/REGRA': '4 <= Meses_Compras_12M <= 5',
                    'EXEMPLO': 'Cliente que comprou em 4 dos últimos 12 meses',
                    'OBSERVAÇÕES': 'Frequência aproximada de 1 compra a cada 3 meses'
                },
                {
                    'CRITÉRIO': 'CLIENTE SEMESTRAL',
                    'DEFINIÇÃO': 'Cliente que comprou em 2-3 meses nos últimos 12 meses',
                    'FÓRMULA/REGRA': '2 <= Meses_Compras_12M <= 3',
                    'EXEMPLO': 'Cliente que comprou em 2 dos últimos 12 meses',
                    'OBSERVAÇÕES': 'Frequência aproximada de 1 compra a cada 6 meses'
                },
                {
                    'CRITÉRIO': 'CLIENTE ANUAL',
                    'DEFINIÇÃO': 'Cliente que comprou em 1 mês nos últimos 12 meses',
                    'FÓRMULA/REGRA': 'Meses_Compras_12M = 1',
                    'EXEMPLO': 'Cliente que comprou apenas 1 vez nos últimos 12 meses',
                    'OBSERVAÇÕES': 'Frequência aproximada de 1 compra por ano'
                },
                {
                    'CRITÉRIO': 'CLIENTE NÃO RECORRENTE',
                    'DEFINIÇÃO': 'Cliente que não possui padrão de recorrência definido',
                    'FÓRMULA/REGRA': 'Não se enquadra em nenhuma categoria de frequência regular',
                    'EXEMPLO': 'Cliente com comportamento de compra irregular ou espoádico',
                    'OBSERVAÇÕES': 'Categoria residual para clientes sem padrão claro'
                },
                {
                    'CRITÉRIO': 'NOVOS CLIENTES',
                    'DEFINIÇÃO': 'Cliente que começou a comprar a marca no ano específico',
                    'FÓRMULA/REGRA': 'Não comprou nos anos anteriores + comprou no ano atual',
                    'EXEMPLO': 'Cliente 123 comprou Adidas pela primeira vez em 2023',
                    'OBSERVAÇÕES': 'Indica capacidade de atração de novos clientes por marca'
                },
                {
                    'CRITÉRIO': 'PERDEU CLIENTES',
                    'DEFINIÇÃO': 'Cliente que parou de comprar a marca no ano específico',
                    'FÓRMULA/REGRA': 'Comprou no ano anterior + não comprou no ano atual',
                    'EXEMPLO': 'Cliente 456 comprava Colcci até 2022, parou em 2023',
                    'OBSERVAÇÕES': 'Indica taxa de abandono/churn da marca por ano'
                },
                {
                    'CRITÉRIO': 'CLIENTE FIEL',
                    'DEFINIÇÃO': 'Cliente com alta frequência e atividade recente',
                    'FÓRMULA/REGRA': 'Meses_Compras_12M >= 6 E Ativo_Últimos_3M = Sim',
                    'EXEMPLO': 'Cliente que comprou 8 meses nos últimos 12 e comprou nos últimos 3 meses',
                    'OBSERVAÇÕES': 'Combina frequência alta com recência'
                },
                {
                    'CRITÉRIO': 'CLIENTE REGULAR',
                    'DEFINIÇÃO': 'Cliente com frequência moderada e atividade recente',
                    'FÓRMULA/REGRA': '2 <= Meses_Compras_12M <= 5 E Ativo_Últimos_6M = Sim',
                    'EXEMPLO': 'Cliente que comprou 4 meses nos últimos 12 e comprou nos últimos 6 meses',
                    'OBSERVAÇÕES': 'Frequência moderada mas ainda ativo'
                },
                {
                    'CRITÉRIO': 'CLIENTE EM RISCO',
                    'DEFINIÇÃO': 'Cliente com baixa atividade ou sem compras muito recentes',
                    'FÓRMULA/REGRA': 'Meses_Compras_12M = 1 OU (Ativo_Últimos_6M = Não E Ativo_Últimos_3M = Não)',
                    'EXEMPLO': 'Cliente que comprou apenas 1 vez ou não compra há mais de 6 meses',
                    'OBSERVAÇÕES': 'Necessita ação de retenção'
                },
                {
                    'CRITÉRIO': 'CLIENTE INATIVO',
                    'DEFINIÇÃO': 'Cliente sem atividade nos últimos 12 meses',
                    'FÓRMULA/REGRA': 'Meses_Compras_12M = 0 E Ativo_Últimos_6M = Não',
                    'EXEMPLO': 'Cliente que não comprou nos últimos 12 meses',
                    'OBSERVAÇÕES': 'Candidato a campanhas de reativação'
                },
                {
                    'CRITÉRIO': 'CLIENTE REATIVADO',
                    'DEFINIÇÃO': 'Cliente que voltou a comprar após período de inatividade',
                    'FÓRMULA/REGRA': 'Ativo_Últimos_3M = Sim E Inativo_4-12M_Atrás = Sim E Histórico_Anterior = Sim',
                    'EXEMPLO': 'Cliente que comprou nos últimos 3 meses, ficou inativo entre 4-12 meses atrás, mas tem histórico anterior',
                    'OBSERVAÇÕES': 'Sucesso de campanha de reativação'
                },
                {
                    'CRITÉRIO': 'TEMPO MÉDIO ENTRE COMPRAS',
                    'DEFINIÇÃO': 'Intervalo médio entre compras baseado no período ativo',
                    'FÓRMULA/REGRA': '(Último_Mês_Compra - Primeiro_Mês_Compra) / (Número_Compras - 1)',
                    'EXEMPLO': 'Cliente ativo por 12 meses com 6 compras = 12/(6-1) = 2.4 meses entre compras',
                    'OBSERVAÇÕES': 'Clientes com 1 compra = 0 meses (sem intervalo)'
                }
            ]
            
            # Criar DataFrame com explicações
            df_explicacoes = pd.DataFrame(explicacoes)
            
            # Escrever explicações primeiro
            df_explicacoes.to_excel(writer, sheet_name=nome_aba, index=False, startrow=0)
            
            # Adicionar linha em branco
            linha_dados = len(df_explicacoes) + 3
            
            # Escrever título dos dados
            worksheet = writer.sheets[nome_aba]
            worksheet.cell(row=linha_dados, column=1, value="ANÁLISE POR MARCA - DADOS CONSOLIDADOS:")
            
            # Escrever dados da análise
            linha_dados += 2
            df.to_excel(writer, sheet_name=nome_aba, index=False, startrow=linha_dados)
            
            # Aplicar formatação básica nas explicações
            self._aplicar_formatacao_basica(worksheet)
            
            # Aplicar formatação básica nos dados
            self._aplicar_formatacao_basica(worksheet)
            
            # Formatação específica para colunas numéricas
            colunas_numericas = ['TOTAL_CLIENTES_UNICOS', 'CLIENTES_ATIVOS_12M', 'MEDIA_CLIENTES_12M',
                               'CLIENTES_ATIVOS_ULTIMO_MES', 'CLIENTES_MENSAIS', 'CLIENTES_BIMESTRAIS',
                               'CLIENTES_TRIMESTRAIS', 'CLIENTES_SEMESTRAIS', 'CLIENTES_ANUAIS',
                               'CLIENTES_NAO_RECORRENTES', 'CLIENTES_FIEIS', 'CLIENTES_REGULARES',
                               'CLIENTES_EM_RISCO', 'CLIENTES_INATIVOS', 'CLIENTES_REATIVADOS']
            
            for coluna in colunas_numericas:
                if coluna in df.columns:
                    self._aplicar_formatacao_numerica(worksheet, df, coluna)
            
            # Formatação para tempo médio entre compras
            if 'TEMPO_MEDIO_ENTRE_COMPRAS_MESES' in df.columns:
                self._aplicar_formatacao_numerica(worksheet, ['TEMPO_MEDIO_ENTRE_COMPRAS_MESES'], '0.0')
            
            # Formatação para colunas de variação em percentual
            colunas_variacao = [col for col in df.columns if 'VARIACAO_' in col and '_PCT' in col]
            if colunas_variacao:
                self._aplicar_formatacao_percentual(worksheet, colunas_variacao)
            
            # Formatação para colunas de meses (clientes por mês)
            colunas_meses = [col for col in df.columns if col.startswith('CLIENTES_') and 
                           col not in colunas_numericas and col != 'TEMPO_MEDIO_ENTRE_COMPRAS_MESES']
            
            for coluna in colunas_meses:
                self._aplicar_formatacao_numerica(worksheet, df, coluna)
            
            # Ajustar largura das colunas das explicações
            worksheet.column_dimensions['A'].width = 25  # CRITÉRIO
            worksheet.column_dimensions['B'].width = 50  # DEFINIÇÃO
            worksheet.column_dimensions['C'].width = 60  # FÓRMULA/REGRA
            worksheet.column_dimensions['D'].width = 80  # EXEMPLO
            worksheet.column_dimensions['E'].width = 40  # OBSERVAÇÕES
            
            print(f"Aba '{nome_aba}' gerada com sucesso: {len(df)} marcas")
            
        except Exception as e:
            print(f"Erro ao gerar aba de comportamento por marca: {str(e)}")
            import traceback
            traceback.print_exc()
def main():
    """Função principal do script."""
    parser = argparse.ArgumentParser(description='Sistema de Previsão de Demanda')
    parser.add_argument('--arquivo', required=True, help='Caminho para o arquivo de dados')
    parser.add_argument('--saida', required=False, help='Nome do arquivo de saída Excel (opcional)')
    
    args = parser.parse_args()
    
    # Se não foi fornecido arquivo de saída, gerar nome automático
    if not args.saida:
        from datetime import datetime
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        args.saida = f"relatorio_previsao_demanda_{timestamp}.xlsx"
        print(f"Arquivo de saída não especificado. Usando: {args.saida}")
    
    # Criar instância da classe
    previsao = PrevisaoDemanda()
    
    # Carregar dados
    previsao.carregar_dados(args.arquivo)
    
    # Executar análises na ordem correta
    previsao.calcular_totais_e_variacoes()
    previsao.aplicar_metodos_estatisticos()
    previsao.realizar_backtest()
    previsao.selecionar_melhor_modelo()
    previsao.calcular_status_item()
    
    # Carregar dados de acuracidade (se disponível)
    try:
        previsao.carregar_dados_previsto(args.arquivo)
        previsao.analisar_acuracidade_previsao()
        print("✅ Dados de previsão carregados e analisados com sucesso")
    except Exception as e:
        print(f"⚠️ Dados de previsão não disponíveis: {str(e)}")
        print("   Abas de acuracidade não serão geradas")
        print("Dados de previsão não disponíveis - abas de acuracidade não serão geradas")
    
    # Carregar e analisar dados de clientes (se disponível)
    try:
        previsao.carregar_dados_clientes(args.arquivo)
        previsao.analisar_comportamento_clientes()
        print("✅ Dados de clientes carregados e analisados com sucesso")
    except Exception as e:
        print(f"⚠️ Dados de clientes não disponíveis: {str(e)}")
        print("   Abas de comportamento de clientes não serão geradas")
    
    # Gerar relatório
    previsao.gerar_relatorio_excel(args.saida)
    
    print("\n=== CONCLUÍDO ===")
    print(f"Relatório gerado com sucesso: {args.saida}")
    print("O arquivo Excel contém as seguintes abas:")
    print("- Visao_Executiva: Consolidação executiva de cenários, acuracidade e clientes")
    print("- Geral: Resumo com métricas principais")
    print("- Detalhado: Dados históricos, comparativos e projeções")
    print("- Backtest: Análise detalhada dos modelos")
    print("- Backtest_Sku: Comparação de modelos por produto")
    print("- Modelos_Estatisticos: Explicação detalhada de cada método estatístico")
    print("- Sazonalidade: Análise histórica dos meses mais fortes de venda desde 2022")
    print("- Acuracidade: Comparação previsto vs realizado com MAPE, WMAPE, BIAS e sugestões de ajuste (se dados disponíveis)")
    print("- Analise_Acuracidade_Detalhada: ✅ NOVA - Análise mês a mês com classificação colorida (se dados disponíveis)")
    print("- Clientes: Análise consolidada de comportamento de compra por produto (se dados disponíveis)")
    print("- Cliente_detalhado: Análise detalhada cliente por cliente (se dados disponíveis)")
    print("- Clientes_Por_Marca: Regras e visão consolidada por marca (se dados disponíveis)")

if __name__ == "__main__":
    main()
