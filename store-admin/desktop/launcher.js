const openLocalButton = document.querySelector('#open-local');
const openDatabaseButton = document.querySelector('#open-database');
const openKafkaUiButton = document.querySelector('#open-kafka-ui');
const stopLocalButton = document.querySelector('#stop-local');
const openDeployButton = document.querySelector('#open-deploy');\nconst openTestCenterButton = document.querySelector('#open-test-center');
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

openTestCenterButton.addEventListener('click', async () => {\n  openTestCenterButton.disabled = true;\n  try {\n    const result = await window.storeAdminLauncher.openTestCenter();\n    if (!result.ok) await showError(result.message || 'Không mở được trung tâm kiểm thử.');\n    else log('Đã mở trung tâm kiểm thử chức năng.');\n  } catch (error) {\n    log(error.message);\n    await showError(error.message);\n  } finally {\n    openTestCenterButton.disabled = false;\n  }\n});\n\nopenDeployButton.addEventListener('click', async () => {
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
