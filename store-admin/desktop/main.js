const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const { spawn, execFile } = require('node:child_process');
const { existsSync, readFileSync } = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const dotenv = require('dotenv');

const desktopDir = __dirname;
const projectDir = path.resolve(desktopDir, '..');
const localUrl = 'http://localhost:5173';
const databaseViewerUrl = `${localUrl}/database.html`;
let launcherWindow;
let devProcess;

function report(message) {
  if (launcherWindow && !launcherWindow.isDestroyed()) {
    launcherWindow.webContents.send('launcher:log', message);
  }
}

function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: process.platform === 'win32',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';

    child.stdout.on('data', (chunk) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(output || `${command} exited with code ${code}`));
    });
  });
}

function waitForPort(host, port, timeoutMs = 120000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = net.createConnection({ host, port });
      socket.setTimeout(1000);
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        retry();
      });
      socket.once('timeout', () => {
        socket.destroy();
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error(`Timed out waiting for port ${port}`));
        return;
      }
      setTimeout(tryConnect, 1000);
    };

    tryConnect();
  });
}

function isPortListening(host, port, timeoutMs = 500) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (isListening) => {
      socket.destroy();
      resolve(isListening);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
  });
}

function waitForWeb(timeoutMs = 90000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const check = async () => {
      try {
        const response = await fetch(localUrl);
        if (response.ok) {
          resolve();
          return;
        }
      } catch {}

      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error('Frontend did not become ready at localhost:5173'));
        return;
      }
      setTimeout(check, 750);
    };

    check();
  });
}

async function getApiHealth(apiHost, apiPort) {
  try {
    const response = await fetch(`http://${apiHost}:${apiPort}/api/health`);
    return response.ok ? response.json() : undefined;
  } catch {
    return undefined;
  }
}

function waitForApi(apiHost, apiPort, requireDatabaseBrowser, timeoutMs = 120000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const check = async () => {
      const health = await getApiHealth(apiHost, apiPort);
      if (health?.status === 'ok') {
        if (requireDatabaseBrowser && !health.databaseBrowserEnabled) {
          reject(new Error('API đang chạy nhưng quyền xem database đang tắt. Hãy dừng API đang chạy ngoài launcher rồi bấm Xem database lại.'));
          return;
        }
        resolve();
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error(`API chưa sẵn sàng tại ${apiHost}:${apiPort}. Kiểm tra log khởi động server rồi thử lại.`));
        return;
      }
      setTimeout(check, 750);
    };

    check();
  });
}

async function openInBrowser(url) {
  await shell.openExternal(url);
}

async function openKafkaUi() {
  try {
    report('Đang khởi động Kafka và Kafka UI...');
    try {
      await runCommand('docker', ['info', '--format', '{{.ServerVersion}}'], projectDir);
    } catch {
      throw new Error('Không kết nối được Docker Engine. Hãy mở Docker Desktop rồi thử lại.');
    }

    const envFile = existsSync(path.join(projectDir, 'server', '.env'))
      ? 'server/.env'
      : 'server/.env.example';
    const environment = dotenv.parse(readFileSync(path.join(projectDir, envFile)));
    const host = environment.LOCAL_HOST;
    const uiPort = Number(environment.KAFKA_UI_PORT);
    if (!host || !Number.isInteger(uiPort) || uiPort < 1 || uiPort > 65535) {
      throw new Error('Cấu hình LOCAL_HOST hoặc KAFKA_UI_PORT không hợp lệ trong server/.env.');
    }

    await runCommand('docker', ['compose', '--env-file', envFile, 'up', '-d', 'kafka', 'kafka-ui'], projectDir);
    await waitForPort(host, uiPort);
    const url = `http://${host}:${uiPort}`;
    await openInBrowser(url);
    report(`Kafka UI đã mở tại ${url}.`);
    return { ok: true };
  } catch (error) {
    report(`Không mở được Kafka UI: ${error.message}`);
    return { ok: false, message: error.message };
  }
}

async function openLocal(targetUrl = localUrl) {
  try {
    report('Đang kiểm tra Docker và khởi động PostgreSQL, Kafka...');
    try {
      await runCommand('docker', ['info', '--format', '{{.ServerVersion}}'], projectDir);
    } catch {
      throw new Error('Không kết nối được Docker Engine. Hãy mở Docker Desktop, dùng Linux containers và chờ Engine khởi động xong rồi thử lại.');
    }

    const envFile = existsSync(path.join(projectDir, 'server', '.env'))
      ? 'server/.env'
      : 'server/.env.example';
    const environment = dotenv.parse(readFileSync(path.join(projectDir, envFile)));
    const apiHost = environment.LOCAL_HOST;
    const apiPort = Number(environment.PORT);
    if (!apiHost || !Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535) {
      throw new Error('Cấu hình LOCAL_HOST hoặc PORT không hợp lệ trong server/.env.');
    }
    await runCommand('docker', ['compose', '--env-file', envFile, 'up', '-d', '--remove-orphans', 'postgres', 'kafka'], projectDir);
    await Promise.all([
      waitForPort(apiHost, Number(environment.POSTGRES_PORT)),
      waitForPort(apiHost, 9092),
    ]);

    const isDatabaseViewer = targetUrl === databaseViewerUrl;
    const [frontendReady, apiHealth] = await Promise.all([
      fetch(localUrl).then((response) => response.ok).catch(() => false),
      getApiHealth(apiHost, apiPort),
    ]);

    if (!apiHealth && await isPortListening(apiHost, apiPort)) {
      throw new Error(`Cổng API ${apiHost}:${apiPort} đang bị một server cũ chiếm nhưng server đó không có health endpoint. Hãy dừng terminal/server cũ rồi bấm Xem database lại.`);
    }

    if (isDatabaseViewer && apiHealth?.status === 'ok' && !apiHealth.databaseBrowserEnabled) {
      throw new Error('API đang chạy nhưng quyền xem database đang tắt. Hãy dừng API đang chạy ngoài launcher rồi bấm Xem database lại.');
    }

    if (!frontendReady || !apiHealth) {
      if (!devProcess) {
        report('Đang chạy client và API...');
        devProcess = spawn('npm', ['run', 'dev'], {
          cwd: projectDir,
          shell: process.platform === 'win32',
          windowsHide: true,
          env: { ...process.env, ENABLE_DATABASE_BROWSER: 'true' },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        devProcess.stdout.on('data', (chunk) => report(chunk.toString().trim()));
        devProcess.stderr.on('data', (chunk) => report(chunk.toString().trim()));
        devProcess.once('error', (error) => report(`Không chạy được npm: ${error.message}`));
        devProcess.once('close', (code) => {
          report(`Tiến trình web đã dừng (mã ${code}).`);
          devProcess = undefined;
        });
      }
    } else {
      report('Đã tìm thấy frontend và API đang chạy sẵn.');
    }

    await Promise.all([waitForWeb(), waitForApi(apiHost, apiPort, isDatabaseViewer)]);
    await openInBrowser(targetUrl);
    report(targetUrl === localUrl
      ? 'Đã mở Store Admin trong trình duyệt.'
      : 'Đã mở trang database trong trình duyệt.');
    return { ok: true };
  } catch (error) {
    report(`Không mở được bản local: ${error.message}`);
    return { ok: false, message: error.message };
  }
}

function stopLocal() {
  if (!devProcess || devProcess.killed) {
    return { ok: true, message: 'Không có tiến trình web nào do launcher khởi động.' };
  }

  const pid = devProcess.pid;
  if (process.platform === 'win32' && pid) {
    execFile('taskkill', ['/pid', String(pid), '/T', '/F'], () => {});
  } else {
    devProcess.kill('SIGTERM');
  }
  devProcess = undefined;
  report('Đã dừng tiến trình web. PostgreSQL và Kafka vẫn chạy trong Docker.');
  return { ok: true, message: 'Đã dừng tiến trình web.' };
}

function createLauncherWindow() {
  launcherWindow = new BrowserWindow({
    width: 620,
    height: 690,
    minWidth: 520,
    minHeight: 620,
    title: 'Store Admin Launcher',
    backgroundColor: '#f4f4ef',
    webPreferences: {
      preload: path.join(desktopDir, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  launcherWindow.loadFile(path.join(desktopDir, 'launcher.html'));
  launcherWindow.on('closed', () => { launcherWindow = undefined; });
}

ipcMain.handle('launcher:open-local', () => openLocal());
ipcMain.handle('launcher:open-database', () => openLocal(databaseViewerUrl));
ipcMain.handle('launcher:open-kafka-ui', openKafkaUi);
ipcMain.handle('launcher:open-remote', async (_event, url) => {
  try {
    const parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('URL chỉ được dùng giao thức http hoặc https.');
    }
    await openInBrowser(parsedUrl.href);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error.message || 'URL không hợp lệ.' };
  }
});
ipcMain.handle('launcher:stop-local', stopLocal);

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'Launcher',
      submenu: [
        { label: 'Mở trang chọn', click: () => launcherWindow?.show() },
        { role: 'quit', label: 'Thoát' },
      ],
    },
    { label: 'Xem', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }] },
  ]));
  createLauncherWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createLauncherWindow();
  });
});

app.on('before-quit', () => {
  if (!devProcess?.pid) return;
  if (process.platform === 'win32') {
    execFile('taskkill', ['/pid', String(devProcess.pid), '/T', '/F'], () => {});
  } else {
    devProcess.kill('SIGTERM');
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});