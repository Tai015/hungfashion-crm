const runButton = document.querySelector('#run-e2e');
const status = document.querySelector('#run-status');
const output = document.querySelector('#e2e-output');

function appendOutput(message) {
  output.textContent += `${message}\n`;
  output.scrollTop = output.scrollHeight;
}

window.storeAdminLauncher.onE2ELog(appendOutput);

runButton.addEventListener('click', async () => {
  runButton.disabled = true;
  output.textContent = '';
  status.textContent = 'Đang chạy Playwright…';
  status.dataset.state = 'running';
  appendOutput('Bắt đầu lượt kiểm thử E2E.');
  try {
    const result = await window.storeAdminLauncher.runE2E();
    status.textContent = result.ok ? 'Đạt — tất cả ca E2E thành công.' : `Có lỗi — ${result.message}`;
    status.dataset.state = result.ok ? 'passed' : 'failed';
    appendOutput(result.message);
  } catch (error) {
    status.textContent = `Không chạy được E2E — ${error.message}`;
    status.dataset.state = 'failed';
    appendOutput(error.stack || error.message);
  } finally {
    runButton.disabled = false;
  }
});
