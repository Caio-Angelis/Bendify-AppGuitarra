/**
 * Cria o repositório Bendify-AppGuitarra (se ainda não existir) e faz push da branch main.
 * Usa (por ordem) GITHUB_REPO_CREATE_TOKEN, depois GITHUB_TOKEN, GH_TOKEN ou
 * GITHUB_PERSONAL_ACCESS_TOKEN. O primeiro serve para ter um PAT só para criar
 * repo, sem mudar o token usado noutras ferramentas.
 *
 * Token fine-grained: Account permissions → "Repository creation".
 * Token classic: scope "repo" (repos privados).
 */
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
process.chdir(root)

const token =
  process.env.GITHUB_REPO_CREATE_TOKEN ||
  process.env.GITHUB_TOKEN ||
  process.env.GH_TOKEN ||
  process.env.GITHUB_PERSONAL_ACCESS_TOKEN

if (!token) {
  console.error(
    'Erro: defina GITHUB_TOKEN (ou GH_TOKEN / GITHUB_PERSONAL_ACCESS_TOKEN), ou GITHUB_REPO_CREATE_TOKEN.',
  )
  process.exit(1)
}

const REPO = 'Bendify-AppGuitarra'
const REMOTE = 'bendify-app'
const PRIVATE = true

function ghHeaders(extra = {}) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    ...extra,
  }
}

function sh(cmd) {
  execSync(cmd, { stdio: 'inherit', encoding: 'utf-8' })
}

const createRes = await fetch('https://api.github.com/user/repos', {
  method: 'POST',
  headers: ghHeaders({ 'Content-Type': 'application/json' }),
  body: JSON.stringify({
    name: REPO,
    private: PRIVATE,
    description:
      'Bendify (AppGuitarra) — app de prática de guitarra (React, Vite, Electron, Supabase)',
    auto_init: false,
  }),
})

const createBody = await createRes.text()

if (createRes.status === 201) {
  const j = JSON.parse(createBody)
  console.log('Repositório criado:', j.html_url)
} else if (createRes.status === 422) {
  if (
    /already exists|name already/i.test(createBody) ||
    createBody.includes('"resource":"Repository"')
  ) {
    console.log('Repositório já existe no GitHub; a continuar com push…')
  } else {
    console.error('GitHub 422:', createBody)
    process.exit(1)
  }
} else if (!createRes.ok) {
  console.error(`GitHub ${createRes.status}:`, createBody)
  if (createRes.status === 403 || createRes.status === 401) {
    console.error(
      '\nO token não tem permissão para criar repositórios. Fine-grained: em Account permissions ative "Repository creation". Classic: scope "repo".',
    )
  }
  process.exit(1)
}

const userRes = await fetch('https://api.github.com/user', {
  headers: ghHeaders(),
})
if (!userRes.ok) {
  console.error('Falha ao obter /user:', await userRes.text())
  process.exit(1)
}
const user = await userRes.json()
const remoteUrl = `https://github.com/${user.login}/${REPO}.git`

try {
  execSync(`git remote get-url ${REMOTE}`, { encoding: 'utf-8' })
  sh(`git remote set-url ${REMOTE} "${remoteUrl}"`)
} catch {
  sh(`git remote add ${REMOTE} "${remoteUrl}"`)
}

sh(`git push -u ${REMOTE} main`)
console.log('\nConcluído. Remoto:', remoteUrl)
