const openLocalButton = document.querySelector('#open-local');
const openDatabaseButton = document.querySelector('#open-database');
const openKafkaUiButton = document.querySelector('#open-kafka-ui');
const stopLocalButton = document.querySelector('#stop-local');
const remoteForm = document.querySelector('#remote-form');
const remoteInput = document.querySelector('#remote-url');
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

remoteForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const url = remoteInput.value.trim();
  if (!url) {
    const message = 'Nhập địa chỉ website đã deploy trước khi mở.';
    log(message);
    await showError(message);
    remoteInput.focus();
    return;
  }
  try {
    const result = await window.storeAdminLauncher.openRemote(url);
    if (result.ok) {
      log(`Đang mở ${url} trong trình duyệt.`);
    } else {
      log(result.message);
      await showError(result.message);
    }
  } catch (error) {
    log(error.message);
    await showError(error.message);
  }
});

window.storeAdminLauncher.onLog(log);