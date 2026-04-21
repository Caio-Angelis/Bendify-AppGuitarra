import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

const useElectron = ['dev:electron', 'build:electron'].includes(
  process.env.npm_lifecycle_event ?? '',
)

const productionCspMetaTag =
  `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; ` +
  `base-uri 'self'; object-src 'none'; frame-ancestors 'self'; ` +
  `script-src 'self' blob:; style-src 'self'; style-src-attr 'unsafe-inline'; ` +
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co; ` +
  `img-src 'self' data: blob:; media-src 'self' blob: data: https://*.supabase.co; ` +
  `font-src 'self' data:; worker-src 'self' blob:;" />`

export default defineConfig(() => ({
  base: useElectron ? './' : '/',
  /** Evita tela branca por ficheiros JS/CSS em cache de sessões antigas do `vite` (chunks deixam de existir no disco). */
  server: {
    headers: {
      'Cache-Control': 'no-store',
    },
  },
  preview: {
    headers: {
      'Cache-Control': 'no-store',
    },
  },
  plugins: [
    react(),
    {
      name: 'inject-production-csp',
      transformIndexHtml(html, context) {
        if (context.server) {
          return html
        }
        return html.replace(
          '<!-- CSP de produção é injetada no build via vite.config.ts -->',
          productionCspMetaTag,
        )
      },
    },
    ...(useElectron
      ? [
          electron({
            entry: 'electron/main.ts',
          }),
          renderer(),
        ]
      : []),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
  },
}))
