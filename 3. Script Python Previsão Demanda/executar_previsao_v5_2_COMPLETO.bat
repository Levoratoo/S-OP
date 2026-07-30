@echo off
echo ========================================
echo   PREVISAO DE DEMANDA - VERSAO 5.2
echo   PRINTBAG - PERIODOS ROBUSTOS COMPLETO
echo ========================================
echo.

echo Verificando arquivos necessarios...
echo.

REM Verificar arquivo de vendas
if exist "1- Base de Dados Vendas.xlsx" (
    echo ✓ Arquivo de vendas encontrado: 1- Base de Dados Vendas.xlsx
) else (
    echo ✗ ERRO: Arquivo de vendas nao encontrado!
    echo   Procurando por: 1- Base de Dados Vendas.xlsx
    echo.
    echo Arquivos Excel na pasta:
    dir *.xlsx /b
    echo.
    pause
    exit /b 1
)

REM Verificar arquivo de projecao (opcional)
if exist "1-BasedeDadosPrevisto.xlsx" (
    echo ✓ Arquivo de projecao encontrado: 1-BasedeDadosPrevisto.xlsx
    echo   (Abas de acuracidade serao geradas)
) else (
    echo ! Arquivo de projecao nao encontrado (opcional): 1-BasedeDadosPrevisto.xlsx
    echo   (Abas de acuracidade nao serao geradas)
)

REM Verificar script Python
if exist "previsao_demanda_final_v5_2_COMPLETO.py" (
    echo ✓ Script Python encontrado: previsao_demanda_final_v5_2_COMPLETO.py
) else (
    echo ✗ ERRO: Script Python nao encontrado!
    echo   Procurando por: previsao_demanda_final_v5_2_COMPLETO.py
    pause
    exit /b 1
)

echo.
echo ========================================
echo   EXECUTANDO PREVISAO DE DEMANDA V5.2
echo ========================================
echo.
echo Arquivo de vendas: 1- Base de Dados Vendas.xlsx
echo Arquivo de projecao: 1-BasedeDadosPrevisto.xlsx (se existir)
echo.
echo PERIODOS DE BACK TEST ROBUSTOS V5.2:
echo - ≥30 meses: 10 meses de teste (validacao muito robusta)
echo - 24-29 meses: 8 meses de teste (alta robustez)
echo - 18-23 meses: 6 meses de teste (boa validacao)
echo - 12-17 meses: 4 meses de teste (minimo sazonal)
echo - ^<12 meses: 3 meses de teste (conservador)
echo.
echo Iniciando processamento...
echo.

REM Executar script
python previsao_demanda_final_v5_2_COMPLETO.py --arquivo "1- Base de Dados Vendas.xlsx"

REM Capturar resultado imediatamente
set RESULTADO=%errorlevel%

REM Verificar resultado
if %RESULTADO% equ 0 (
    echo.
    echo ========================================
    echo   PROCESSAMENTO CONCLUIDO COM SUCESSO!
    echo ========================================
    echo.
    echo Relatorio Excel gerado na pasta atual.
    echo Procure por arquivo com nome: relatorio_previsao_demanda_AAAAMMDD_HHMMSS.xlsx
    echo.
    echo VERSAO 5.2 - TODAS AS FUNCIONALIDADES INCLUIDAS:
    echo ✓ Periodos robustos de back test
    echo ✓ Todas as abas do relatorio original
    echo ✓ Analise de acuracidade (se arquivo de projecao existir)
    echo ✓ Formatacoes e calculos completos
    echo.
    echo O relatorio foi salvo na pasta atual.
    echo.
    echo [DEBUG] Codigo de retorno capturado: %RESULTADO%
    echo.
    echo Esta janela fechara automaticamente em 5 segundos...
    timeout /t 5 /nobreak >nul
    exit /b 0
) else (
    echo.
    echo ========================================
    echo   ERRO DURANTE O PROCESSAMENTO
    echo ========================================
    echo.
    echo Codigo de erro: %RESULTADO%
    echo Verifique as mensagens de erro acima.
    echo.
    echo [DEBUG] Codigo de retorno capturado: %RESULTADO%
)

echo.
pause

