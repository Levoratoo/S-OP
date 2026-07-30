param(
  [string]$PythonCmd = "python"
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$venvPath = Join-Path $root ".venv-previsao"
$requirementsPath = Join-Path $root "requirements-previsao-python.txt"

Write-Host "[previsao-python] Preparando ambiente virtual em $venvPath"
& $PythonCmd -m venv $venvPath

$venvPython = Join-Path $venvPath "Scripts\python.exe"
if (!(Test-Path $venvPython)) {
  throw "Python da venv nao encontrado em $venvPython"
}

Write-Host "[previsao-python] Atualizando pip..."
& $venvPython -m pip install --upgrade pip

Write-Host "[previsao-python] Instalando dependencias..."
& $venvPython -m pip install -r $requirementsPath

Write-Host ""
Write-Host "[previsao-python] Concluido."
Write-Host "[previsao-python] Defina PREVISAO_PYTHON_CMD para usar essa venv:"
Write-Host "  PREVISAO_PYTHON_CMD=$venvPython"
