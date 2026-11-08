const openLocalButton = document.querySelector('#open-local');
const openDatabaseButton = document.querySelector('#open-database');
const openKafkaUiButton = document.querySelector('#open-kafka-ui');
const stopLocalButton = document.querySelector('#stop-local');
const openDeployButton = document.querySelector('#open-deploy');
const activityLog = document.querySelector('#activity-log');

function log(message) {
  const timestamp = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  activityLog.textContent = `[${timestamp}] ${message}\n${activityLog.textContent}`.slice(0, 1600);
}

function showError(message) {
  return Swal.fire({
    icon: 'error',
    title: 'Không thể mở Store Admin',
    text: message,
    confirmButtonText: 'Đóng',
  });
}

openLocalButton.addEventListener('click', async () => {
  openLocalButton.disabled = true;
  log('Đang khởi động môi trường local...');
  try {
    const result = await window.storeAdminLauncher.openLocal();
    if (!result.ok) {
      log(result.message);
      await showError(result.message);
    }
  } catch (error) {
    log(error.message);
    await showError(error.message);
  } finally {
    openLocalButton.disabled = false;
  }
});

openDatabaseButton.addEventListener('click', async () => {
  openDatabaseButton.disabled = true;
  log('Đang khởi động PostgreSQL và mở database viewer...');
  try {
    const result = await window.storeAdminLauncher.openDatabase();
    if (!result.ok) {
      log(result.message);
      await showError(result.message);
    }
  } catch (error) {
    log(error.message);
    await showError(error.message);
  } finally {
    openDatabaseButton.disabled = false;
  }
});

openKafkaUiButton.addEventListener('click', async () => {
  openKafkaUiButton.disabled = true;
  log('Đang khởi động Kafka UI...');
  try {
    const result = await window.storeAdminLauncher.openKafkaUi();
    if (!result.ok) {
      log(result.message);
      await showError(result.message);
    }
  } catch (error) {
    log(error.message);
    await showError(error.message);
  } finally {
    openKafkaUiButton.disabled = false;
  }
});

stopLocalButton.addEventListener('click', async () => {
  try {
    const result = await window.storeAdminLauncher.stopLocal();
    log(result.message);
    if (!result.ok) await showError(result.message);
  } catch (error) {
    log(error.message);
    await showError(error.message);
  }
});

openDeployButton.addEventListener('click', async () => {
  openDeployButton.disabled = true;
  log('Đang mở trang đã triển khai...');
  try {
    const result = await window.storeAdminLauncher.openDeploy();
    if (result.ok) {
      log('Đã mở trang đăng nhập nhân viên / quản trị trong trình duyệt mặc định.');
    } else {
      log(result.message);
      await showError(result.message);
    }
  } catch (error) {
    log(error.message);
    await showError(error.message);
  } finally {
    openDeployButton.disabled = false;
  }
});

window.storeAdminLauncher.onLog(log);


const e2eTarget = document.querySelector('#e2e-target');
const runE2eButton = document.querySelector('#run-e2e');
const stopE2eButton = document.querySelector('#stop-e2e');
const openE2eReportButton = document.querySelector('#open-e2e-report');
const openGithubActionsButton = document.querySelector('#open-github-actions');

function setE2eRunning(running) {
  runE2eButton.disabled = running;
  e2eTarget.disabled = running;
  stopE2eButton.disabled = !running;
  runE2eButton.textContent = running ? 'Đang kiểm thử…' : '▶ Chạy E2E';
}

runE2eButton.addEventListener('click', async () => {
  setE2eRunning(true);
  log(`Đang chuẩn bị Playwright cho môi trường ${e2eTarget.value}...`);
  try {
    const result = await window.storeAdminLauncher.runE2e(e2eTarget.value);
    if (!result.ok) {
      setE2eRunning(false);
      log(result.message);
      await showError(result.message);
    }
  } catch (error) {
    setE2eRunning(false);
    log(error.message);
    await showError(error.message);
  }
});

stopE2eButton.addEventListener('click', async () => {
  stopE2eButton.disabled = true;
  try {
    const result = await window.storeAdminLauncher.stopE2e();
    log(result.message);
  } catch (error) {
    log(error.message);
    await showError(error.message);
  }
});

openE2eReportButton.addEventListener('click', async () => {
  const result = await window.storeAdminLauncher.openE2eReport();
  if (!result.ok) await showError(result.message);
  else log('Đã mở Playwright HTML report.');
});

openGithubActionsButton.addEventListener('click', async () => {
  const result = await window.storeAdminLauncher.openGithubActions();
  if (!result.ok) await showError(result.message);
  else log('Đã mở trang GitHub Actions. Chọn workflow và nhấn Run workflow để chạy trên GitHub.');
});

window.storeAdminLauncher.onE2eStatus((running) => setE2eRunning(running));
