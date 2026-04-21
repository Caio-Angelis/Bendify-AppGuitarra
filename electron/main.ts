import { app, BrowserWindow, session, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const PRODUCTION_INDEX_HTML = path.join(__dirname, '../dist/index.html')

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('bendify', process.execPath, [
      path.resolve(process.argv[1]),
    ])
  }
} else {
  app.setAsDefaultProtocolClient('bendify')
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()

let mainWindow: BrowserWindow | null = null
let pendingDeepLink: string | null = null
let pendingAuthPayload: Record<string, string> | null = null

function findDeepLinkInArgv(argv: string[]): string | undefined {
  return argv.find((arg) => /^bendify:\/\//i.test(arg))
}

function handleAuthDeepLink(rawUrl: string): void {
  const trimmed = rawUrl.trim()
  if (!/^bendify:\/\//i.test(trimmed)) {
    return
  }
  if (!mainWindow) {
    return
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return
  }

  const params = new URLSearchParams(parsed.search)
  const fragment = parsed.hash ? parsed.hash.slice(1) : ''
  if (fragment && !fragment.startsWith('/')) {
    new URLSearchParams(fragment).forEach((value, key) => {
      params.set(key, value)
    })
  }

  const devUrl = process.env.VITE_DEV_SERVER_URL?.replace(/\/$/, '')
  const isDev = !app.isPackaged
  const baseHref =
    isDev && devUrl ? devUrl : pathToFileURL(PRODUCTION_INDEX_HTML).href
  const target = `${baseHref}#/auth`
  pendingAuthPayload = Object.fromEntries(params.entries())

  void mainWindow
    .loadURL(target)
    .then(() => {
      if (!mainWindow || !pendingAuthPayload) {
        return
      }
      const serializedPayload = JSON.stringify(pendingAuthPayload)
      pendingAuthPayload = null
      void mainWindow.webContents.executeJavaScript(
        `
          window.__BENDIFY_OAUTH_PAYLOAD__ = ${serializedPayload};
          window.dispatchEvent(new CustomEvent('bendify-oauth-deeplink', {
            detail: window.__BENDIFY_OAUTH_PAYLOAD__
          }));
        `,
        true,
      )
    })
    .catch((err) => {
      console.error('[electron] Failed to open OAuth callback route.', err)
    })
  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }
  mainWindow.focus()
}

function getAppContentRoot(): string {
  return path.normalize(path.resolve(__dirname, '..'))
}

function isPathInsideDir(dir: string, candidate: string): boolean {
  const relative = path.relative(dir, candidate)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function isAllowedRendererNavigation(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      const host = parsed.hostname
      return host === 'localhost' || host === '127.0.0.1'
    }
    if (parsed.protocol === 'file:') {
      const target = path.normalize(fileURLToPath(url))
      const root = getAppContentRoot()
      return isPathInsideDir(root, target)
    }
  } catch {
    return false
  }
  return false
}

function createWindow(): void {
  const isDev = !app.isPackaged

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#121212',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })

  if (isDev) {
    win.webContents.openDevTools({ mode: 'detach' })
  }

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true)
      return
    }
    callback(false)
  })

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => permission === 'media')

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedRendererNavigation(url)) {
      event.preventDefault()
      if (url.startsWith('http://') || url.startsWith('https://')) {
        void shell.openExternal(url)
      }
    }
  })

  mainWindow = win
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (isDev) {
    const devUrl = process.env.VITE_DEV_SERVER_URL
    if (devUrl) {
      void win.loadURL(devUrl)
    } else {
      console.error('[electron] VITE_DEV_SERVER_URL ausente em modo dev; não foi possível carregar o renderer.')
    }
  } else {
    void win.loadFile(PRODUCTION_INDEX_HTML).catch((err) => {
      console.error('[electron] loadFile failed:', err)
    })
  }
}

if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('open-url', (event, url) => {
    event.preventDefault()
    if (app.isReady()) {
      handleAuthDeepLink(url)
    } else {
      pendingDeepLink = url
    }
  })

  app.on('second-instance', (_event, argv) => {
    const url = findDeepLinkInArgv(argv)
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow.focus()
    }
    if (url) {
      handleAuthDeepLink(url)
    }
  })

  app
    .whenReady()
    .then(() => {
      createWindow()

      if (pendingDeepLink) {
        handleAuthDeepLink(pendingDeepLink)
        pendingDeepLink = null
      } else {
        const fromArgv = findDeepLinkInArgv(process.argv)
        if (fromArgv) {
          handleAuthDeepLink(fromArgv)
        }
      }

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          createWindow()
        }
      })
    })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
