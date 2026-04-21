# GitHub MCP via Docker — repassa o PAT do ambiente sem o colocar em ficheiros.
# Aceita GITHUB_PERSONAL_ACCESS_TOKEN, ou GITHUB_TOKEN / GH_TOKEN (aliases).
$ErrorActionPreference = 'Stop'
if (-not $env:GITHUB_PERSONAL_ACCESS_TOKEN) {
  if ($env:GITHUB_TOKEN) { $env:GITHUB_PERSONAL_ACCESS_TOKEN = $env:GITHUB_TOKEN }
  elseif ($env:GH_TOKEN) { $env:GITHUB_PERSONAL_ACCESS_TOKEN = $env:GH_TOKEN }
}
if (-not $env:GITHUB_PERSONAL_ACCESS_TOKEN) {
  Write-Error 'Defina GITHUB_TOKEN, GH_TOKEN ou GITHUB_PERSONAL_ACCESS_TOKEN nas variáveis de ambiente do sistema (ou utilizador).'
  exit 1
}
$exe = Get-Command docker -ErrorAction SilentlyContinue
if (-not $exe) {
  Write-Error 'Docker não encontrado no PATH. Instale o Docker Desktop e garanta que está em execução.'
  exit 1
}
& docker run -i --rm -e GITHUB_PERSONAL_ACCESS_TOKEN ghcr.io/github/github-mcp-server
