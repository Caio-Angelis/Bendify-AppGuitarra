# Bendify

Aplicação web de prática de guitarra (React, Vite, Tailwind) com build desktop opcional (Electron). Um único pacote na raiz — não é monorepo.

## Estrutura do repositório

| Pasta / ficheiro | Conteúdo |
|------------------|----------|
| `src/` | Código da aplicação (páginas, componentes, serviços, dados) |
| `electron/` | Processo principal Electron (`main.ts`; JS gerado não é versionado) |
| `public/` | Assets estáticos servidos pelo Vite |
| `scripts/` | Scripts Node (ex.: geração de `guitarDatabase.json`) |
| `skins/` | Imagens de skins / avatar |
| `.github/workflows/` | CI (auditoria de dependências, build Windows assinado) |
| `supabase_migrations*.sql` | SQL de referência para migrações Supabase |

## Requisitos

- Node.js LTS e npm

## Instalação e execução

```bash
npm install
```

Copie `.env.example` para `.env` ou `.env.local`, preencha as variáveis do Supabase e mantenha esse ficheiro só na máquina local (está excluído do Git no `.gitignore`).

```bash
npm run dev
```

- **Web:** abre o servidor de desenvolvimento Vite (porta habitual 5173).
- **Electron (dev):** use o fluxo do projeto com `dev:electron` / plugin Electron; em desenvolvimento pode ser necessário `VITE_DEV_SERVER_URL` (ver `.env.example`).

Outros comandos úteis:

```bash
npm run build          # build de produção (web)
npm run test           # testes (Vitest)
npm run lint           # ESLint
npm run preview        # pré-visualizar build
npm run dist:win       # instalador Windows (Electron Builder)
```

## Segurança de dependências

- `npm run audit:deps` — falha em vulnerabilidades `high` ou `critical`.
- `npm run audit:deps:critical` — falha apenas em `critical`.
- O workflow `.github/workflows/dependency-audit.yml` corre `audit:deps:critical` em PRs para `main` / `master`.

Se aparecer vulnerabilidade crítica: confirmar pacote com `npm audit`, aplicar `npm audit fix` ou atualização pontual, validar com `npm run build` e `npm test -- --run`, e documentar no PR o impacto e o plano se não houver patch imediato.

## Assinatura do instalador Windows

- Scripts: `npm run dist:win`, `npm run dist:win:ci` (`--publish never` para CI).
- Variáveis típicas: `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`, `CSC_IDENTITY_AUTO_DISCOVERY=false`.
- O workflow `.github/workflows/windows-signed-build.yml` usa secrets do repositório e publica o artefacto sem imprimir credenciais nos logs.
