const { app, BrowserWindow, net, protocol } = require('electron');
const { resolve, sep } = require('node:path');
const { pathToFileURL } = require('node:url');

const SCHEME = 'perfect-field';
const origin = SCHEME + '://game';
const publicFiles = resolve(__dirname, '..', 'public');

app.setName('Perfect 2.5D');
protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

async function openWindow() {
  const window = new BrowserWindow({
    title: 'Perfect 2.5D · Prado da Vigília', width: 1370, height: 870,
    minWidth: 570, minHeight: 510, backgroundColor: '#344739', autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  window.webContents.on('will-navigate', (event, destination) => {
    const url = new URL(destination);
    if (url.protocol !== SCHEME + ':' || url.hostname !== 'game') event.preventDefault();
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  await window.loadURL(origin + '/?solo&desktop');
}

app.whenReady().then(async () => {
  protocol.handle(SCHEME, request => {
    const url = new URL(request.url);
    if (url.hostname !== 'game') return new Response('', { status: 404 });
    const path = resolve(publicFiles, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
    if (!path.startsWith(publicFiles + sep)) return new Response('', { status: 404 });
    return net.fetch(pathToFileURL(path).toString());
  });
  await openWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) void openWindow(); });
}).catch(error => { console.error(error); app.exit(1); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
