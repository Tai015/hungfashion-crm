import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPythonScript } from './python-process.mjs';

const storeAdminDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function scrapeCatalog({ force = false } = {}) {
  await runPythonScript('scrape_catalog.py', force ? ['--force'] : []);
  return path.join(storeAdminDir, 'data', 'raw', 'fashion-studio-products.json');
}

if (process.argv[1] && path.normalize(process.argv[1]).endsWith('scrape-catalog.mjs')) {
  scrapeCatalog({ force: process.argv.includes('--force') }).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
