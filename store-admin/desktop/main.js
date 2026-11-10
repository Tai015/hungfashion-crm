const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const { spawn, execFile } = require('node:child_process');
const { existsSync, readFileSync } = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const dotenv = require('dotenv');

const desktopDir = __dirname;
const projectDir = path.resolve(desktopDir, '..');
let launcherWindow;
let devProcess;
let e2eProcess;
let e2eBusy = false;

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

function waitForWeb(localUrl, timeoutMs = 90000) {
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
        reject(new Error(`Frontend chưa sẵn sàng tại ${localUrl}.`));
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

function getDeployUrl() {
  const environmentDir = path.join(projectDir, 'server');
  const examplePath = path.join(environmentDir, '.env.example');
  const localPath = path.join(environmentDir, '.env');
  const packagedConfigPath = path.join(desktopDir, 'deploy-config.json');
  const exampleEnvironment = existsSync(examplePath)
    ? dotenv.parse(readFileSync(examplePath))
    : {};
  const localEnvironment = existsSync(localPath)
    ? dotenv.parse(readFileSync(localPath))
    : {};
  const packagedConfig = existsSync(packagedConfigPath)
    ? JSON.parse(readFileSync(packagedConfigPath, 'utf8'))
    : {};
  const deployUrl = String(localEnvironment.DEPLOY_URL || '').trim()
    || String(packagedConfig.DEPLOY_URL || '').trim()
    || String(exampleEnvironment.DEPLOY_URL || '').trim();
  if (!deployUrl) {
    throw new Error('Chưa có DEPLOY_URL. Hãy mở store-admin/server/.env, thêm DEPLOY_URL=https://địa-chỉ-website-của-bạn rồi mở lại ứng dụng.');
  }
  return deployUrl;
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

async function openLocal(target = 'employee') {
  try {
    report('Đang kiểm tra Docker và khởi động PostgreSQL, Kafka...');
    try {
      await runCommand('docker', ['info', '--format', '{{.ServerVersion}}'], projectDir);
    } catch {
      throw new Error('Không kết nối được Docker Engine. Hãy mở Docker Desktop, dùng Linux containers và chờ Engine khởi động xong rồi thử lại.');
    }

    const localEnvPath = path.join(projectDir, 'server', '.env');
    if (!existsSync(localEnvPath)) {
      throw new Error('Không tìm thấy store-admin/server/.env. Hãy tạo tệp này từ .env.example và điền LOCAL_URL.');
    }
    const environment = dotenv.parse(readFileSync(localEnvPath));
    const envFile = 'server/.env';
    if (!String(environment.LOCAL_URL || '').trim()) {
      throw new Error('LOCAL_URL đang thiếu trong store-admin/server/.env. Hãy thêm LOCAL_URL=http://localhost:5173 rồi thử lại.');
    }
    let localBaseUrl;
    try {
      const parsedLocalUrl = new URL(String(environment.LOCAL_URL).trim());
      if (!['http:', 'https:'].includes(parsedLocalUrl.protocol)) throw new Error('Giao thức phải là http hoặc https.');
      parsedLocalUrl.hash = '';
      parsedLocalUrl.search = '';
      localBaseUrl = `${parsedLocalUrl.href.replace(/\/+$/, '')}/`;
    } catch {
      throw new Error('LOCAL_URL trong server/.env không hợp lệ. Hãy dùng địa chỉ bắt đầu bằng http:// hoặc https://.');
    }
    const employeeLoginUrl = new URL(localBaseUrl);
    employeeLoginUrl.hash = '/nhan-vien/login';
    const databaseViewerUrl = new URL('database.html', localBaseUrl).href;
    const targetUrl = target === 'database' ? databaseViewerUrl : employeeLoginUrl.href;
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

    const isDatabaseViewer = target === 'database';
    const [frontendReady, apiHealth] = await Promise.all([
      fetch(localBaseUrl).then((response) => response.ok).catch(() => false),
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

    await Promise.all([waitForWeb(localBaseUrl), waitForApi(apiHost, apiPort, isDatabaseViewer)]);
    await openInBrowser(targetUrl);
    report(isDatabaseViewer
      ? 'Đã mở trang database trong trình duyệt.'
      : 'Đã mở trang đăng nhập nhân viên trong trình duyệt.');
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


function appendProcessOutput(chunk) {
  const lines = chunk.toString().split(/\r?\n/).filter(Boolean);
  for (const line of lines) report(`[E2E] ${line}`);
}

async function runE2e(target) {
  if (e2eBusy || e2eProcess) return { ok: false, message: 'E2E đang chạy. Hãy đợi hoặc dừng phiên hiện tại.' };
  if (!['local', 'render'].includes(target)) return { ok: false, message: 'Môi trường E2E không hợp lệ.' };

  e2eBusy = true;
  try {
    let baseUrl;
    if (target === 'render') {
      baseUrl = getDeployUrl();
    } else {
      const localEnvPath = path.join(projectDir, 'server', '.env');
      const localEnvironment = existsSync(localEnvPath) ? dotenv.parse(readFileSync(localEnvPath)) : {};
      baseUrl = String(localEnvironment.LOCAL_URL || 'http://localhost:5173').trim();
    }

    const parsedBaseUrl = new URL(baseUrl);
    if (!['http:', 'https:'].includes(parsedBaseUrl.protocol)) throw new Error('E2E_BASE_URL phải là địa chỉ HTTP hoặc HTTPS.');

    const e2eEnvPath = path.join(projectDir, '.env.e2e');
    const e2eEnvironment = existsSync(e2eEnvPath) ? dotenv.parse(readFileSync(e2eEnvPath)) : {};
    const environment = {
      ...process.env,
      E2E_BASE_URL: parsedBaseUrl.origin,
      E2E_HEADED: '1',
      E2E_CUSTOMER_IDENTIFIER: e2eEnvironment.E2E_CUSTOMER_IDENTIFIER || process.env.E2E_CUSTOMER_IDENTIFIER || '',
      E2E_CUSTOMER_PASSWORD: e2eEnvironment.E2E_CUSTOMER_PASSWORD || process.env.E2E_CUSTOMER_PASSWORD || '',
      E2E_STAFF_IDENTIFIER: e2eEnvironment.E2E_STAFF_IDENTIFIER || process.env.E2E_STAFF_IDENTIFIER || '',
      E2E_STAFF_PASSWORD: e2eEnvironment.E2E_STAFF_PASSWORD || process.env.E2E_STAFF_PASSWORD || '',
    };

    if (target === 'local') {
      const response = await fetch(parsedBaseUrl.origin, { signal: AbortSignal.timeout(5000) }).catch(() => null);
      if (!response?.ok) throw new Error(`Local website chưa phản hồi tại ${parsedBaseUrl.origin}. Hãy bấm “Mở bản local” trước, sau đó chạy lại E2E.`);
    }

    report('Đang chuẩn bị Playwright Test...');
    const testPackagePath = path.join(projectDir, 'node_modules', '@playwright', 'test');
    if (!existsSync(testPackagePath)) {
      await runCommand('npm', ['install', '--no-save', '--package-lock=false', '@playwright/test'], projectDir);
    }
    await runCommand('npx', ['playwright', 'install', 'chromium'], projectDir);

    report(`Bắt đầu E2E ${target === 'render' ? 'trên Render' : 'Local'}: ${parsedBaseUrl.origin}`);
    const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const testArgs = ['playwright', 'test', 'e2e/auth.spec.js', '--headed'];
    if (target === 'render') testArgs.push('--grep', 'màn hình đăng nhập');
    e2eProcess = spawn(command, testArgs, {
      cwd: projectDir,
      shell: process.platform === 'win32',
      windowsHide: false,
      detached: process.platform !== 'win32',
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    e2eProcess.stdout.on('data', appendProcessOutput);
    e2eProcess.stderr.on('data', appendProcessOutput);
    e2eProcess.once('error', (error) => {
      report(`Không khởi chạy được Playwright: ${error.message}`);
      e2eProcess = undefined;
      e2eBusy = false;
      if (launcherWindow && !launcherWindow.isDestroyed()) launcherWindow.webContents.send('launcher:e2e-status', false);
    });
    e2eProcess.once('close', (code, signal) => {
      report(signal ? `E2E đã dừng (${signal}).` : `E2E kết thúc với mã ${code} — ${code === 0 ? 'PASS' : 'FAIL'}.`);
      e2eProcess = undefined;
      e2eBusy = false;
      if (launcherWindow && !launcherWindow.isDestroyed()) launcherWindow.webContents.send('launcher:e2e-status', false);
    });
    if (launcherWindow && !launcherWindow.isDestroyed()) launcherWindow.webContents.send('launcher:e2e-status', true);
    return { ok: true, message: 'Playwright đã bắt đầu. Theo dõi log bên dưới.' };
  } catch (error) {
    e2eBusy = false;
    if (launcherWindow && !launcherWindow.isDestroyed()) launcherWindow.webContents.send('launcher:e2e-status', false);
    report(`Không thể chạy E2E: ${error.message}`);
    return { ok: false, message: error.message };
  }
}

function killProcessTree(child) {
  if (!child?.pid) return false;
  if (process.platform === 'win32') {
    execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], () => {});
  } else {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
  }
  return true;
}

function stopE2e() {
  if (!e2eProcess || !e2eBusy) return { ok: true, message: 'Không có phiên E2E nào đang chạy.' };
  killProcessTree(e2eProcess);
  report('Đã gửi yêu cầu dừng toàn bộ cây tiến trình Playwright/Chromium.');
  return { ok: true, message: 'Đang dừng Playwright và Chromium...' };
}

async function openE2eReport() {
  const reportPath = path.join(projectDir, 'playwright-report', 'index.html');
  if (!existsSync(reportPath)) return { ok: false, message: 'Chưa có HTML report. Hãy chạy E2E trước.' };
  const error = await shell.openPath(reportPath);
  return error ? { ok: false, message: error } : { ok: true };
}

async function openGithubActions() {
  try {
    await openInBrowser('https://github.com/Tai015/hungfashion-crm/actions/workflows/e2e-auth.yml');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error.message };
  }
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

function showLauncherWindow() {
  if (!launcherWindow || launcherWindow.isDestroyed()) createLauncherWindow();
  else launcherWindow.show();
}

async function openDeployUrl(url) {
  try {
    const parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('DEPLOY_URL chỉ được dùng giao thức http hoặc https.');
    }
    parsedUrl.hash = '/nhan-vien/login';
    await openInBrowser(parsedUrl.href);
    report('Đã mở trang đăng nhập nhân viên / quản trị trong trình duyệt mặc định.');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error.message || 'Không thể mở địa chỉ website đã cấu hình.' };
  }
}

ipcMain.handle('launcher:open-local', () => openLocal());
ipcMain.handle('launcher:open-database', () => openLocal('database'));
ipcMain.handle('launcher:open-kafka-ui', openKafkaUi);
ipcMain.handle('launcher:open-deploy', async () => {
  try {
    return await openDeployUrl(getDeployUrl());
  } catch (error) {
    return { ok: false, message: error.message || 'URL không hợp lệ.' };
  }
});
ipcMain.handle('launcher:stop-local', stopLocal);
ipcMain.handle('launcher:run-e2e', (_event, target) => runE2e(target));
ipcMain.handle('launcher:stop-e2e', stopE2e);
ipcMain.handle('launcher:open-e2e-report', openE2eReport);
ipcMain.handle('launcher:open-github-actions', openGithubActions);

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'Launcher',
      submenu: [
        { label: 'Mở trình khởi chạy', click: showLauncherWindow },
        { role: 'quit', label: 'Thoát' },
      ],
    },
    { label: 'Xem', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }] },
  ]));
  showLauncherWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) showLauncherWindow();
  });
});

app.on('before-quit', () => {
  if (e2eProcess?.pid) killProcessTree(e2eProcess);
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
