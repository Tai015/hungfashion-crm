import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const storeAdminDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function pythonExecutable() {
  return process.env.PYTHON_EXECUTABLE?.trim()
    || (process.platform === 'win32' ? 'python' : 'python3');
}

export function runPythonScript(scriptName, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      pythonExecutable(),
      [path.join(storeAdminDir, 'scripts', scriptName), ...args],
      { cwd: storeAdminDir, env: process.env, stdio: 'inherit', windowsHide: true },
    );
    child.once('error', error => reject(new Error(
      `Không chạy được Python (${pythonExecutable()}): ${error.message}. Cấu hình PYTHON_EXECUTABLE nếu cần.`,
    )));
    child.once('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`${scriptName} thoát với mã ${code}.`));
    });
  });
}
