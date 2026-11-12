const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const { spawn, execFile } = require('node:child_process');
const { existsSync, readFileSync } = require('node:fs');
const crypto = require('node:crypto');
const net = require('node:net');
const path = require('node:path');
const dotenv = require('dotenv');

const desktopDir = __dirname;
const projectDir = path.resolve(desktopDir, '..');
let launcherWindow;
let testCenterWindow;
let employeeWindow;
let devProcess;
let e2eProcess;

function report(message) {
  if (launcherWindow && !launcherWindow.isDestroyed()) {
    launcherWindow.webContents.send('launcher:log', message);
  }
}

function reportE2E(message) {
  const text = String(message || '').replace(/\s+$/, '');
  if (!text || !testCenterWindow || testCenterWindow.isDestroyed()) return;
  testCenterWindow.webContents.send('launcher:e2e-log', text);
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

function openEmployeeWindow(url) {
  const target = new URL(url);
  if (!['http:', 'https:'].includes(target.protocol)) {
    throw new Error('Địa chỉ đăng nhập nhân viên không hợp lệ.');
  }

  if (employeeWindow && !employeeWindow.isDestroyed()) {
    let currentOrigin;
    try {
      currentOrigin = new URL(employeeWindow.webContents.getURL()).origin;
    } catch {}

    if (currentOrigin === target.origin) {
      employeeWindow.show();
      employeeWindow.focus();
      if (employeeWindow.webContents.getURL() !== target.href) {
        employeeWindow.loadURL(target.href);
      }
      return employeeWindow;
    }

    employeeWindow.close();
    employeeWindow = undefined;
  }

  employeeWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 650,
    title: 'Hung Fashion — Khu vực nhân viên',
    backgroundColor: '#f4f4ef',
    webPreferences: {
      preload: path.join(desktopDir, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  employeeWindow.webContents.setWindowOpenHandler(({ url: requestedUrl }) => {
    try {
      const requested = new URL(requestedUrl);
      if (['http:', 'https:'].includes(requested.protocol)) {
        shell.openExternal(requested.href).catch(() => {});
      }
    } catch {}
    return { action: 'deny' };
  });

  employeeWindow.webContents.on('will-navigate', (event, requestedUrl) => {
    try {
      if (new URL(requestedUrl).origin !== target.origin) {
        event.preventDefault();
        shell.openExternal(requestedUrl).catch(() => {});
      }
    } catch {
      event.preventDefault();
    }
  });

  employeeWindow.on('closed', () => { employeeWindow = undefined; });
  employeeWindow.loadURL(target.href);
  return employeeWindow;
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

const STAFF_SECRET = 'store-admin-desktop-token-secret-2026';

function generateStaffToken() {
  const timestamp = Date.now();
  const signature = crypto.createHash('md5').update(`${timestamp}:${STAFF_SECRET}`).digest('hex');
  return `${timestamp}.${signature}`;
}

async function openLocal(target = 'employee') {
  try {
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

    const apiHost = environment.LOCAL_HOST || '127.0.0.1';
    const apiPort = Number(environment.PORT) || 5000;
    if (!apiHost || !Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535) {
      throw new Error('Cấu hình LOCAL_HOST hoặc PORT không hợp lệ trong server/.env.');
    }

    const isDatabaseViewer = target === 'database';
    const staffToken = generateStaffToken();
    const employeeLoginUrl = new URL(localBaseUrl);
    employeeLoginUrl.searchParams.set('staff_token', staffToken);
    employeeLoginUrl.hash = '/nhan-vien/login';
    const databaseViewerUrl = new URL('database.html', localBaseUrl).href;
    const targetUrl = isDatabaseViewer ? databaseViewerUrl : employeeLoginUrl.href;

    // Fast-path: Kiểm tra nhanh nếu frontend & API đã chạy sẵn -> Mở trình duyệt ngay trong tích tắc (< 0.2s)
    const [frontendReady, apiHealth] = await Promise.all([
      fetch(localBaseUrl).then((res) => res.ok).catch(() => false),
      getApiHealth(apiHost, apiPort),
    ]);

    if (frontendReady && apiHealth?.status === 'ok') {
      await openInBrowser(targetUrl);
      report(isDatabaseViewer
        ? 'Đã mở trang database trong trình duyệt.'
        : 'Đã mở trang đăng nhập nhân viên trong trình duyệt mặc định.');
      return { ok: true };
    }

    report('Đang khởi động PostgreSQL, Kafka và dịch vụ web...');
    try {
      await runCommand('docker', ['info', '--format', '{{.ServerVersion}}'], projectDir);
    } catch {
      throw new Error('Không kết nối được Docker Engine. Hãy mở Docker Desktop hoặc chạy `npm run dev` ở terminal rồi thử lại.');
    }

    // CI-only path: Playwright starts disposable PostgreSQL/Kafka and the local
    // API/Vite processes itself, then exercises this real Electron launcher button.
    // Normal desktop use always follows the Docker startup path below.
    if (process.env.E2E_ELECTRON_TEST_MODE === 'true') {
      if (target !== 'employee') throw new Error('Electron E2E mode only supports the employee login flow.');
      await Promise.all([waitForWeb(localBaseUrl), waitForApi(apiHost, apiPort, false)]);
      await openInBrowser(targetUrl);
      report('Electron E2E: đã mở trang đăng nhập nhân viên.');
      return { ok: true };
    }

    await runCommand('docker', ['compose', '--env-file', envFile, 'up', '-d', '--remove-orphans', 'postgres', 'kafka'], projectDir);
    await Promise.all([
      waitForPort(apiHost, Number(environment.POSTGRES_PORT)),
      waitForPort(apiHost, 9092),
    ]);

    const [freshFrontend, freshApi] = await Promise.all([
      fetch(localBaseUrl).then((response) => response.ok).catch(() => false),
      getApiHealth(apiHost, apiPort),
    ]);

    if (!freshApi && await isPortListening(apiHost, apiPort)) {
      throw new Error(`Cổng API ${apiHost}:${apiPort} đang bị một server cũ chiếm nhưng server đó không có health endpoint. Hãy dừng terminal/server cũ rồi bấm Xem database lại.`);
    }

    if (isDatabaseViewer && freshApi?.status === 'ok' && !freshApi.databaseBrowserEnabled) {
      throw new Error('API đang chạy nhưng quyền xem database đang tắt. Hãy dừng API đang chạy ngoài launcher rồi bấm Xem database lại.');
    }

    if (!freshFrontend || !freshApi) {
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
      : 'Đã mở trang đăng nhập nhân viên trong trình duyệt mặc định.');
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

function openTestCenter() {
  if (!testCenterWindow || testCenterWindow.isDestroyed()) {
    testCenterWindow = new BrowserWindow({
      width: 1080,
      height: 820,
      minWidth: 760,
      minHeight: 620,
      title: 'Store Admin — Trung tâm kiểm thử',
      backgroundColor: '#f4f4ef',
      parent: launcherWindow && !launcherWindow.isDestroyed() ? launcherWindow : undefined,
      webPreferences: {
        preload: path.join(desktopDir, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    testCenterWindow.loadFile(path.join(desktopDir, 'test-center.html'));
    testCenterWindow.on('closed', () => { testCenterWindow = undefined; });
  } else {
    testCenterWindow.show();
    testCenterWindow.focus();
  }
  return { ok: true };
}

function runE2ECommand(cliPath, args, label) {
  return new Promise((resolve) => {
    reportE2E(`\n> ${label}\n`);
    const runnerEnv = { ...process.env, CI: '', E2E_HEADLESS: 'false' };
    // Electron's process.execPath points to Electron.exe, not node.exe.
    // Keep Playwright in a plain Node process and avoid inheriting VS Code's inspector flags.
    delete runnerEnv.NODE_OPTIONS;
    delete runnerEnv.ELECTRON_RUN_AS_NODE;
    const child = spawn(process.env.npm_node_execpath || 'node', [cliPath, ...args], {
      cwd: projectDir,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: runnerEnv,
    });
    e2eProcess = child;
    child.stdout.on('data', chunk => reportE2E(chunk.toString()));
    child.stderr.on('data', chunk => reportE2E(chunk.toString()));
    child.once('error', error => {
      reportE2E(`Không khởi chạy được Playwright: ${error.message}`);
      e2eProcess = undefined;
      resolve(1);
    });
    child.once('close', code => {
      if (e2eProcess === child) e2eProcess = undefined;
      resolve(code ?? 1);
    });
  });
}

async function runE2E() {
  if (e2eProcess) return { ok: false, message: 'Một lượt E2E đang chạy.' };
  const playwrightCli = path.join(projectDir, 'node_modules', '@playwright', 'test', 'cli.js');
  if (!existsSync(playwrightCli)) {
    return {
      ok: false,
      message: 'Chưa cài Playwright trong dự án. Hãy chạy npm ci tại thư mục store-admin rồi mở lại Trung tâm kiểm thử.',
    };
  }

  reportE2E('Chuẩn bị Chromium cho Playwright. Lần đầu chạy có thể cần tải trình duyệt.');
  report('Đang chuẩn bị chạy Playwright E2E giao diện...');
  const installCode = await runE2ECommand(playwrightCli, ['install', 'chromium'], 'playwright install chromium');
  if (installCode !== 0) {
    report('Không cài được Chromium cho Playwright.');
    return { ok: false, message: 'Không cài được Chromium. Kiểm tra kết nối mạng và log trong Trung tâm kiểm thử.' };
  }

  reportE2E('\nChạy bộ E2E giao diện đăng nhập/đăng ký. API được mock; không thay đổi dữ liệu thật.');
  const testCode = await runE2ECommand(
    playwrightCli,
    ['test', '--config=playwright.auth.config.js', '--reporter=line'],
    'playwright test --config=playwright.auth.config.js',
  );
  const ok = testCode === 0;
  report(ok ? 'Playwright E2E hoàn tất: tất cả ca kiểm thử đều đạt.' : `Playwright E2E có lỗi (mã thoát ${testCode}).`);
  return { ok, message: ok ? 'Tất cả E2E giao diện đều đạt.' : `E2E thất bại (mã thoát ${testCode}). Xem log chi tiết bên dưới.` };
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
    const staffToken = generateStaffToken();
    parsedUrl.searchParams.set('staff_token', staffToken);
    parsedUrl.hash = '/nhan-vien/login';
    await openInBrowser(parsedUrl.href);
    report('Đã mở trang đăng nhập nhân viên / quản trị trong trình duyệt mặc định.');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error.message || 'Không thể mở địa chỉ website đã cấu hình.' };
  }
}

ipcMain.handle('launcher:open-local', () => openLocal());
ipcMain.handle('launcher:open-test-center', openTestCenter);
ipcMain.handle('launcher:run-e2e', runE2E);
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
  e2eProcess?.kill();
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
