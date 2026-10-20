import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPythonScript } from './python-process.mjs';

const storeAdminDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function normalizeCatalog() {
  await runPythonScript('normalize_catalog.py');
  return path.join(storeAdminDir, 'data', 'clean', 'products.json');
}

if (process.argv[1] && path.normalize(process.argv[1]).endsWith('normalize-catalog.mjs')) {
  normalizeCatalog().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
