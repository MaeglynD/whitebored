const { app, BrowserWindow, Menu, shell, protocol, net, dialog } = require('electron')
const path = require('node:path')
const { mkdirSync } = require('node:fs')
const { resolveProfile } = require('./profile.cjs')
const { pathToFileURL } = require('node:url')

// Retain the pre-rename origin so installed boards remain readable.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'folio',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
])
const testData = process.env.WHITEBORED_TEST_DATA || process.env.FOLIO_TEST_DATA
if (testData) app.setPath('userData', path.resolve(testData))
else {
  // Reuse an existing profile in place; never copy a live Chromium database.
  const profile = resolveProfile(app.getPath('appData'))
  mkdirSync(profile, { recursive: true })
  app.setPath('userData', profile)
}
const single = app.requestSingleInstanceLock()
if (!single) app.quit()
let mainWindow
app.on('second-instance', () => {
  mainWindow?.restore()
  mainWindow?.focus()
})
app.whenReady().then(() => {
  protocol.handle('folio', (request) => {
    const url = new URL(request.url)
    if (url.host !== 'app') return new Response('Not found', { status: 404 })
    const root = path.resolve(__dirname, '../dist')
    const file = path.resolve(
      root,
      '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname),
    )
    if (file !== root && !file.startsWith(root + path.sep))
      return new Response('Forbidden', { status: 403 })
    return net.fetch(pathToFileURL(file).toString())
  })
  function openWindow() {
    mainWindow = new BrowserWindow({
      width: 1440,
      height: 940,
      minWidth: 540,
      minHeight: 520,
      title: 'Whitebored',
      backgroundColor: '#fbfaf7',
      icon: path.join(__dirname, '../dist/icon-512.png'),
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        spellcheck: true,
      },
    })
    const external = (url) => {
      try {
        if (['https:', 'http:'].includes(new URL(url).protocol)) void shell.openExternal(url)
      } catch {}
    }
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      external(url)
      return { action: 'deny' }
    })
    mainWindow.webContents.on('will-navigate', (event, url) => {
      if (!url.startsWith('folio://app/')) {
        event.preventDefault()
        external(url)
      }
    })
    mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault())
    mainWindow.webContents.session.setPermissionRequestHandler((_contents, permission, callback) =>
      callback(permission === 'clipboard-sanitized-write'),
    )
    mainWindow.webContents.on('will-prevent-unload', async (event) => {
      const choice = dialog.showMessageBoxSync(mainWindow, {
        type: 'warning',
        buttons: ['Keep working', 'Close without saving'],
        defaultId: 0,
        cancelId: 0,
        message: 'Some changes have not finished saving.',
        detail: 'Keep this window open to retry saving or export a backup.',
      })
      if (choice === 1) event.preventDefault()
    })
    mainWindow.once('ready-to-show', () => {
      if (!testData) mainWindow.show()
    })
    void mainWindow.loadURL('folio://app/')
  }
  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }]),
      ],
    },
    { role: 'windowMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  openWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openWindow()
  })
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
