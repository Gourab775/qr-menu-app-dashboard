const { app, BrowserWindow, globalShortcut, shell, net, session, Menu, ipcMain, Tray, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const APP_URL = 'https://qr-menu-app-dashboard.vercel.app/';
const CONNECTIVITY_CHECK_URL = 'https://clients3.google.com/generate_204';
const CONNECTIVITY_CHECK_INTERVAL = 3000;
const TOGGLE_COOLDOWN = 250;

let mainWindow = null;
let quickWindow = null;
let splashWindow = null;
let bubbleWindow = null;
let tray = null;
let connectivityInterval = null;
let wasOffline = false;

let popupState = 'closed';
let pendingOrderCount = 0;
let isQuitting = false;
let lastToggleTime = 0;

const BOUNDS_PATH = path.join(app.getPath('userData'), 'popup-bounds.json');
const BUBBLE_BOUNDS_PATH = path.join(app.getPath('userData'), 'bubble-bounds.json');

function logError(context, error) {
  console.error(`[Main][ERROR][${new Date().toISOString()}] ${context}:`, error?.message || error);
  if (error?.stack) console.error(`[Main][STACK]`, error.stack);
}

function ensureWindowVisible(win) {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  win.setAlwaysOnTop(true);
  win.setAlwaysOnTop(false);
}

function loadPopupBounds() {
  try {
    if (fs.existsSync(BOUNDS_PATH)) {
      return JSON.parse(fs.readFileSync(BOUNDS_PATH, 'utf-8'));
    }
  } catch (_) {}
  return null;
}

function savePopupBounds(bounds) {
  try {
    fs.writeFileSync(BOUNDS_PATH, JSON.stringify(bounds));
  } catch (_) {}
}

function loadBubbleBounds() {
  try {
    if (fs.existsSync(BUBBLE_BOUNDS_PATH)) {
      return JSON.parse(fs.readFileSync(BUBBLE_BOUNDS_PATH, 'utf-8'));
    }
  } catch (_) {}
  return { x: 0, y: 300 };
}

function saveBubbleBounds(bounds) {
  try {
    fs.writeFileSync(BUBBLE_BOUNDS_PATH, JSON.stringify(bounds));
  } catch (_) {}
}

function createTray() {
  try {
    const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
    let trayIcon;
    try {
      trayIcon = nativeImage.createFromPath(iconPath);
      trayIcon = trayIcon.resize({ width: 16, height: 16 });
    } catch {
      trayIcon = nativeImage.createEmpty();
    }

    tray = new Tray(trayIcon);
    tray.setToolTip('QR Menu Dashboard');

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open Popup',
        click: () => openOrFocusPopup(),
      },
      {
        label: 'Show Dashboard',
        click: () => {
          if (!mainWindow || mainWindow.isDestroyed()) {
            createMainWindow();
          } else {
            ensureWindowVisible(mainWindow);
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]);

    tray.setContextMenu(contextMenu);
    tray.on('click', () => openOrFocusPopup());
  } catch (err) {
    logError('createTray failed', err);
    tray = null;
  }
}

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
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      ensureWindowVisible(mainWindow);
      return;
    }

    mainWindow = new BrowserWindow({
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
    mainWindow.maximize();
    mainWindow.loadURL(APP_URL);

    mainWindow.webContents.setWindowOpenHandler(() => {
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
      ensureWindowVisible(mainWindow);
    });

    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
      const offlineErrors = [
        'ERR_INTERNET_DISCONNECTED', 'ERR_NAME_NOT_RESOLVED',
        'ERR_CONNECTION_REFUSED', 'ERR_CONNECTION_TIMED_OUT',
        'ERR_NETWORK_CHANGED', 'ERR_NETWORK_IO_SUSPENDED', 'ERR_ADDRESS_UNREACHABLE',
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

    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
        logError('Window visibility timeout', 'Window was not shown after 10s, forcing show');
        closeSplash();
        ensureWindowVisible(mainWindow);
      }
    }, 10000);
  } catch (err) {
    logError('createMainWindow failed', err);
    closeSplash();
    try {
      mainWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        center: true,
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
      mainWindow.webContents.on('did-finish-load', () => ensureWindowVisible(mainWindow));
      ensureWindowVisible(mainWindow);
    } catch (fallbackErr) {
      logError('Fallback window creation also failed', fallbackErr);
    }
  }
}

function createQuickWindow() {
  if (quickWindow && !quickWindow.isDestroyed()) return;
  const savedBounds = loadPopupBounds();

  quickWindow = new BrowserWindow({
    width: savedBounds?.width || 420,
    height: savedBounds?.height || 680,
    minWidth: 340,
    minHeight: 400,
    x: savedBounds?.x,
    y: savedBounds?.y,
    center: !savedBounds,
    alwaysOnTop: true,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    show: false,
    title: 'Live Orders',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const debouncedSaveBounds = (() => {
    let timer = null;
    return () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (quickWindow && !quickWindow.isDestroyed()) {
          savePopupBounds(quickWindow.getBounds());
        }
      }, 200);
    };
  })();

  quickWindow.on('resize', debouncedSaveBounds);
  quickWindow.on('move', debouncedSaveBounds);

  const popupUrl = new URL(APP_URL);
  popupUrl.searchParams.set('mode', 'popup-orders');
  quickWindow.loadURL(popupUrl.toString());

  quickWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  quickWindow.webContents.on('will-navigate', (event, url) => {
    const isInternal = url.startsWith(APP_URL) || url.startsWith('http://localhost');
    if (!isInternal && (url.startsWith('https:') || url.startsWith('http:'))) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  quickWindow.setAlwaysOnTop(true, 'pop-up-menu');

  quickWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    minimizePopupToBubble();
  });

  quickWindow.on('closed', () => {
    quickWindow = null;
  });
}

function createBubbleWindow() {
  if (bubbleWindow && !bubbleWindow.isDestroyed()) return;
  const savedBounds = loadBubbleBounds();

  bubbleWindow = new BrowserWindow({
    width: 80,
    height: 80,
    x: savedBounds.x,
    y: savedBounds.y,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    show: false,
    skipTaskbar: true,
    hasShadow: false,
    title: '',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  bubbleWindow.loadFile(path.join(__dirname, 'bubble.html'));
  bubbleWindow.setAlwaysOnTop(true, 'screen-saver');

  bubbleWindow.on('closed', () => {
    bubbleWindow = null;
  });
}

function showBubble() {
  if (!bubbleWindow || bubbleWindow.isDestroyed()) {
    createBubbleWindow();
  }
  const savedBounds = loadBubbleBounds();
  bubbleWindow.setPosition(savedBounds.x, savedBounds.y);
  bubbleWindow.setAlwaysOnTop(true, 'screen-saver');
  bubbleWindow.show();
  bubbleWindow.focus();
  bubbleWindow.webContents.send('order-count-changed', pendingOrderCount);
}

function hideBubble() {
  if (bubbleWindow && !bubbleWindow.isDestroyed()) {
    const pos = bubbleWindow.getPosition();
    saveBubbleBounds({ x: pos[0], y: pos[1] });
    bubbleWindow.hide();
  }
}

function openOrFocusPopup() {
  const now = Date.now();
  if (now - lastToggleTime < TOGGLE_COOLDOWN) return;
  lastToggleTime = now;

  const popupExists = quickWindow && !quickWindow.isDestroyed();
  const popupVisible = popupExists && quickWindow.isVisible();
  const bubbleExists = bubbleWindow && !bubbleWindow.isDestroyed();

  if (popupState === 'open' && popupVisible) {
    minimizePopupToBubble();
    return;
  }

  if (bubbleExists) hideBubble();
  if (!popupExists) createQuickWindow();
  quickWindow.setAlwaysOnTop(true, 'pop-up-menu');
  quickWindow.show();
  quickWindow.focus();
  popupState = 'open';
  quickWindow.webContents.send('focus-input');
}

function minimizePopupToBubble() {
  if (popupState === 'open' || (quickWindow && !quickWindow.isDestroyed())) {
    if (quickWindow && !quickWindow.isDestroyed()) {
      quickWindow.hide();
    }
    showBubble();
    popupState = 'bubble';
  }
}

function restoreFromBubble() {
  if (popupState === 'bubble') {
    hideBubble();
    if (!quickWindow || quickWindow.isDestroyed()) createQuickWindow();
    quickWindow.setAlwaysOnTop(true, 'pop-up-menu');
    quickWindow.show();
    quickWindow.focus();
    popupState = 'open';
    quickWindow.webContents.send('focus-input');
  }
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
    const request = net.request({ method: 'HEAD', url: CONNECTIVITY_CHECK_URL });
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

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.error('[Main] Another instance is already running — quitting this one.');
  app.quit();
} else {
  app.on('second-instance', () => {
    console.log('[Main] Second instance detected — focusing existing window');
    if (mainWindow && !mainWindow.isDestroyed()) {
      ensureWindowVisible(mainWindow);
    } else {
      createMainWindow();
    }
    if (tray && process.platform === 'darwin' && typeof tray.setHighlightMode === 'function') {
      try {
        tray.setHighlightMode('always');
        setTimeout(() => {
          if (tray && typeof tray.setHighlightMode === 'function') {
            try { tray.setHighlightMode('selection'); } catch {}
          }
        }, 2000);
      } catch {}
    }
  });

  app.whenReady().then(() => {
    try {
      Menu.setApplicationMenu(null);

      createTray();
      createSplashWindow();
      createMainWindow();

      const registered = globalShortcut.register('CommandOrControl+Space', openOrFocusPopup);
      if (!registered) {
        logError('Global shortcut', 'Failed to register CommandOrControl+Space');
      }

      ipcMain.on('show-popup', () => {
        openOrFocusPopup();
      });

      ipcMain.on('minimize-popup', () => {
        minimizePopupToBubble();
      });

      ipcMain.on('send-order-count', (_event, count) => {
        pendingOrderCount = count;
        if (bubbleWindow && !bubbleWindow.isDestroyed()) {
          bubbleWindow.webContents.send('order-count-changed', count);
        }
      });

      ipcMain.on('save-bubble-bounds', (_event, bounds) => {
        saveBubbleBounds(bounds);
      });

      ipcMain.on('bubble-clicked', () => {
        restoreFromBubble();
      });

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
    } catch (err) {
      logError('app.whenReady startup failed', err);
    }
  });
}

app.on('session-created', (ses) => {
  ses.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ['clipboard-read', 'clipboard-sanitized-write'];
    callback(allowed.includes(permission));
  });
});

ipcMain.handle('get-popup-bounds', () => loadPopupBounds());

ipcMain.on('save-popup-bounds', (_event, bounds) => {
  savePopupBounds(bounds);
});

app.on('window-all-closed', () => {
  // App stays alive in system tray; quit via tray menu or will-quit
});

app.on('will-quit', () => {
  isQuitting = true;
  globalShortcut.unregisterAll();
});

app.on('activate', () => {
  if (mainWindow === null || mainWindow.isDestroyed()) {
    createMainWindow();
  } else {
    ensureWindowVisible(mainWindow);
  }
});
