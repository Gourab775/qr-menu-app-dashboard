const { app, BrowserWindow, shell, net, ipcMain, session } = require('electron');
const path = require('path');

const APP_URL = 'https://qr-menu-app-dashboard.vercel.app/';
const CONNECTIVITY_CHECK_URL = 'https://clients3.google.com/generate_204';
const CONNECTIVITY_CHECK_INTERVAL = 3000;

let mainWindow = null;
let splashWindow = null;
let connectivityInterval = null;
let wasOffline = false;

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 600,
    height: 400,
    frame: false,
    transparent: true,
    resizable: false,
    center: true,
    show: true,
    title: 'QR Menu Dashboard',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.setAlwaysOnTop(true);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    center: true,
    show: false,
    title: 'QR Menu Dashboard',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadURL(APP_URL);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const isInternal = url.startsWith(APP_URL) || url.startsWith('http://localhost');
    if (!isInternal && (url.startsWith('https:') || url.startsWith('http:'))) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.webContents.on('did-finish-load', () => {
    wasOffline = false;
    stopConnectivityCheck();
    closeSplash();
    mainWindow.show();
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    const offlineErrors = [
      'ERR_INTERNET_DISCONNECTED',
      'ERR_NAME_NOT_RESOLVED',
      'ERR_CONNECTION_REFUSED',
      'ERR_CONNECTION_TIMED_OUT',
      'ERR_NETWORK_CHANGED',
      'ERR_NETWORK_IO_SUSPENDED',
      'ERR_ADDRESS_UNREACHABLE',
    ];

    if (offlineErrors.includes(errorDescription) && !wasOffline) {
      wasOffline = true;
      closeSplash();
      showOfflineScreen();
    }
  });

  mainWindow.webContents.on('certificate-error', (event, _url, _error, _certificate, callback) => {
    event.preventDefault();
    callback(false);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.setAlwaysOnTop(false);
    splashWindow.close();
    splashWindow = null;
  }
}

function showOfflineScreen() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  mainWindow.loadFile(path.join(__dirname, 'offline.html'));
  wasOffline = true;
  startConnectivityCheck();
}

function startConnectivityCheck() {
  stopConnectivityCheck();

  connectivityInterval = setInterval(() => {
    const request = net.request({
      method: 'HEAD',
      url: CONNECTIVITY_CHECK_URL,
    });

    request.on('response', () => {
      if (wasOffline && mainWindow && !mainWindow.isDestroyed()) {
        wasOffline = false;
        stopConnectivityCheck();
        mainWindow.loadURL(APP_URL);
      }
    });

    request.on('error', () => {});
    request.end();
  }, CONNECTIVITY_CHECK_INTERVAL);
}

function stopConnectivityCheck() {
  if (connectivityInterval) {
    clearInterval(connectivityInterval);
    connectivityInterval = null;
  }
}

app.whenReady().then(() => {
  createSplashWindow();
  createMainWindow();

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' https:; script-src 'self' https: 'unsafe-inline' 'unsafe-eval'; style-src 'self' https: 'unsafe-inline'; img-src 'self' https: data: blob:; connect-src 'self' https: wss:; font-src 'self' https: data:; frame-src 'self' https:;",
        ],
      },
    });
  });
});

app.on('session-created', (ses) => {
  ses.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ['clipboard-read', 'clipboard-sanitized-write'];
    callback(allowed.includes(permission));
  });
});

app.on('window-all-closed', () => {
  stopConnectivityCheck();
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createMainWindow();
  }
});
