import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();
const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const storeAdminDir = path.resolve(serverDir, '..');
const cleanCatalogPath = path.join(storeAdminDir, 'data', 'clean', 'products.json');
const sourceName = 'Fashion Studio public HTML catalog';
const restoreEnabled = process.env.ENABLE_DATABASE_RESTORE === 'true';
const maxRestoreBytes = 512 * 1024 * 1024;
let databaseOperationInProgress = false;

function postgresEnvironment() {
  return {
    ...process.env,
    PGPASSWORD: process.env.POSTGRES_PASSWORD || '',
  };
}

function runProcess(command, args, { cwd, env, timeoutMs = 120_000, maxStdoutBytes = 8 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let stdoutBytes = 0;
    let outputExceeded = false;
    let settled = false;

    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    const fail = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    };

    child.stdout.on('data', chunk => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > maxStdoutBytes) {
        outputExceeded = true;
        child.kill();
        return;
      }
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', chunk => {
      stderr = (stderr + chunk.toString('utf8')).slice(-16_000);
    });
    child.once('error', error => {
      if (error.code === 'ENOENT') {
        fail(new Error(`${command} was not found. Install PostgreSQL client tools or configure the executable path.`));
        return;
      }
      fail(error);
    });
    child.once('close', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (outputExceeded) {
        reject(new Error(`${command} produced more output than allowed.`));
      } else if (timedOut) {
        reject(new Error(`${command} timed out after ${timeoutMs / 1000} seconds.`));
      } else if (code !== 0) {
        reject(new Error(stderr.trim() || `${command} exited with code ${code}.`));
      } else {
        resolve(stdout);
      }
    });
  });
}

function runCatalogScript(script, args = []) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('POSTGRES_') || key.startsWith('PG')) delete env[key];
  }
  return runProcess(process.execPath, [path.join(storeAdminDir, 'scripts', script), ...args], {
    cwd: storeAdminDir,
    env,
    timeoutMs: 180_000,
  });
}

async function getCatalogProducts(limit = 50, queryable = pool) {
  const { rows } = await queryable.query(
    `SELECT p.product_id AS "productId", p.product_name AS "productName",
            p.selling_price AS "sellingPrice", p.image_url AS "imageUrl",
            c.category_name AS "categoryName", b.brand_name AS "brandName",
            p.created_at AS "createdAt", MIN(pv.sku) AS sku
     FROM product p
     JOIN product_variant pv ON pv.product_id = p.product_id AND pv.sku LIKE 'FS-%'
     JOIN category c ON c.category_id = p.category_id
     LEFT JOIN brand b ON b.brand_id = p.brand_id
     GROUP BY p.product_id, c.category_name, b.brand_name
     ORDER BY p.created_at DESC, p.product_id DESC
     LIMIT $1`,
    [limit]
  );
  const { rows: [summary] } = await queryable.query(
    `SELECT COUNT(DISTINCT p.product_id)::int AS total, MAX(p.updated_at) AS "lastImportedAt"
     FROM product p
     JOIN product_variant pv ON pv.product_id = p.product_id
     WHERE pv.sku LIKE 'FS-%'`
  );
  return { products: rows, total: summary.total, lastImportedAt: summary.lastImportedAt };
}

async function importNormalizedCatalog(client) {
  const clean = JSON.parse(await readFile(cleanCatalogPath, 'utf8'));
  const products = clean.products;
  if (!Array.isArray(products) || products.length < 80 || products.length > 180) {
    throw new Error('File catalog đã chuẩn hóa không hợp lệ hoặc có dưới 80 sản phẩm.');
  }

  for (const sizeName of ['S', 'M', 'L']) {
    await client.query('INSERT INTO size (size_name) VALUES ($1) ON CONFLICT (size_name) DO NOTHING', [sizeName]);
  }
  await client.query(
    `INSERT INTO color (color_name) VALUES ('Đen') ON CONFLICT (color_name) DO NOTHING`,
  );
  const { rows: [size] } = await client.query(`SELECT size_id FROM size WHERE size_name = 'M'`);
  const { rows: [color] } = await client.query(`SELECT color_id FROM color WHERE color_name = 'Đen'`);
  let insertedCount = 0;
  let updatedCount = 0;

  for (const item of products) {
    const sourceId = Number(item.sourceId);
    const productName = typeof item.productName === 'string' ? item.productName.trim() : '';
    const sellingPrice = Number(item.sellingPrice);
    const importPrice = Number(item.importPrice);
    if (!Number.isInteger(sourceId) || sourceId <= 0 || !productName
      || !Number.isFinite(sellingPrice) || sellingPrice < 0
      || !Number.isFinite(importPrice) || importPrice < 0
      || !Array.isArray(item.images)) {
      throw new Error('Catalog có sản phẩm thiếu trường hoặc chứa dữ liệu không hợp lệ.');
    }

    const { rows: [category] } = await client.query(
      `INSERT INTO category (category_name) VALUES ($1)
       ON CONFLICT (category_name) DO UPDATE SET category_name = EXCLUDED.category_name
       RETURNING category_id`,
      [item.categoryName],
    );
    const { rows: [brand] } = await client.query(
      `INSERT INTO brand (brand_name) VALUES ($1)
       ON CONFLICT (brand_name) DO UPDATE SET brand_name = EXCLUDED.brand_name
       RETURNING brand_id`,
      [item.brandName],
    );

    const skuPrefix = `FS-${sourceId}-`;
    const { rows: [existing] } = await client.query(
      `SELECT p.product_id
       FROM product p
       JOIN product_variant pv ON pv.product_id = p.product_id
       WHERE pv.sku LIKE $1
       ORDER BY p.product_id
       LIMIT 1`,
      [`${skuPrefix}%`],
    );

    let productId;
    if (existing) {
      const { rows: [updated] } = await client.query(
        `UPDATE product
         SET category_id = $1, brand_id = $2, product_name = $3,
             description = $4, import_price = $5, selling_price = $6,
             image_url = $7, updated_at = NOW()
         WHERE product_id = $8
         RETURNING product_id`,
        [category.category_id, brand.brand_id, productName, item.description,
          importPrice, sellingPrice, item.imageUrl, existing.product_id],
      );
      productId = updated.product_id;
      updatedCount += 1;
    } else {
      const { rows: [created] } = await client.query(
        `INSERT INTO product
           (category_id, brand_id, product_name, description, import_price, selling_price, image_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING product_id`,
        [category.category_id, brand.brand_id, productName, item.description,
          importPrice, sellingPrice, item.imageUrl],
      );
      productId = created.product_id;
      await client.query(
        `INSERT INTO product_variant (product_id, size_id, color_id, sku, quantity, selling_price)
         VALUES ($1, $2, $3, $4, 0, $5)
         ON CONFLICT (sku) DO UPDATE SET selling_price = EXCLUDED.selling_price`,
        [productId, size.size_id, color.color_id, `${skuPrefix}M-Đen`, sellingPrice],
      );
      insertedCount += 1;
    }

    await client.query(
      `UPDATE product_variant
       SET selling_price = $1
       WHERE product_id = $2 AND sku LIKE $3`,
      [sellingPrice, productId, `${skuPrefix}%`],
    );

    await client.query('UPDATE product_image SET is_primary = FALSE WHERE product_id = $1', [productId]);
    for (const [index, imageUrl] of item.images.entries()) {
      if (typeof imageUrl !== 'string' || !imageUrl.startsWith('https://')) continue;
      await client.query(
        `INSERT INTO product_image (product_id, image_url, is_primary, display_order)
         SELECT $1, $2, $3, $4
         WHERE NOT EXISTS (
           SELECT 1 FROM product_image WHERE product_id = $1 AND image_url = $2
         )`,
        [productId, imageUrl, index === 0, index + 1],
      );
      await client.query(
        `UPDATE product_image SET is_primary = $3, display_order = $4
         WHERE product_id = $1 AND image_url = $2`,
        [productId, imageUrl, index === 0, index + 1],
      );
    }
  }

  return { insertedCount, updatedCount, total: products.length };
}

function acquireOperation(res) {
  if (databaseOperationInProgress) {
    res.status(409).json({ message: 'A settings or database operation is already running.' });
    return false;
  }
  databaseOperationInProgress = true;
  return true;
}

router.get('/status', async (_req, res) => {
  try {
    const { rows: [database] } = await pool.query(
      'SELECT current_database() AS name, pg_size_pretty(pg_database_size(current_database())) AS size'
    );
    const { total, lastImportedAt } = await getCatalogProducts(1);
    res.json({
      databaseName: database.name,
      databaseSize: database.size,
      restoreEnabled,
      maxRestoreBytes,
      catalogProductCount: total,
      lastCatalogImportAt: lastImportedAt,
      sourceName,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/catalog-products', async (req, res) => {
  try {
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;
    res.json(await getCatalogProducts(limit));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/scrape', async (_req, res) => {
  if (!acquireOperation(res)) return;
  let client;
  let transactionStarted = false;
  try {
    try {
      await runCatalogScript('scrape-catalog.mjs', ['--force']);
      await runCatalogScript('normalize-catalog.mjs');
    } catch (scrapeError) {
      res.status(502).json({ message: scrapeError.message });
      return;
    }

    client = await pool.connect();
    await client.query('BEGIN');
    transactionStarted = true;
    const importResult = await importNormalizedCatalog(client);
    const importedProducts = await getCatalogProducts(100, client);
    await client.query('COMMIT');
    transactionStarted = false;
    res.json({
      success: true,
      importedCount: importResult.total,
      insertedCount: importResult.insertedCount,
      updatedCount: importResult.updatedCount,
      sourceName,
      ...importedProducts,
    });
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK').catch(rollbackError => {
        console.error('Could not roll back the fashion scrape transaction:', rollbackError);
      });
    }
    res.status(500).json({ message: error.message });
  } finally {
    client?.release();
    databaseOperationInProgress = false;
  }
});

router.get('/database/backup', async (_req, res) => {
  if (!acquireOperation(res)) return;
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'hungfashion-backup-')).catch(error => {
    databaseOperationInProgress = false;
    res.status(500).json({ message: error.message });
    return null;
  });
  if (!temporaryDirectory) return;

  const backupPath = path.join(temporaryDirectory, 'store-admin.dump');
  const pgDump = process.env.PG_DUMP_PATH || 'pg_dump';
  const databaseName = process.env.POSTGRES_DB;

  try {
    await runProcess(pgDump, [
      '--format=custom',
      '--no-owner',
      '--no-privileges',
      '--no-password',
      '--host', process.env.POSTGRES_HOST || 'localhost',
      '--port', process.env.POSTGRES_PORT || '5432',
      '--username', process.env.POSTGRES_USER || '',
      '--dbname', databaseName || '',
      '--file', backupPath,
    ], { env: postgresEnvironment() });
    const backup = await stat(backupPath);
    if (!backup.isFile() || backup.size === 0) {
      throw new Error('pg_dump completed without producing a usable backup file.');
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', String(backup.size));
    res.setHeader('Content-Disposition', `attachment; filename="hungfashion-${timestamp}.dump"`);
    await pipeline(createReadStream(backupPath), res);
  } catch (error) {
    console.error('Database backup failed:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: error.message });
    } else if (!res.destroyed) {
      res.destroy(error);
    }
  } finally {
    try {
      await rm(temporaryDirectory, { recursive: true, force: true });
    } catch (cleanupError) {
      console.error('Could not remove the temporary database backup:', cleanupError);
    } finally {
      databaseOperationInProgress = false;
    }
  }
});

async function saveRestoreUpload(req, outputPath) {
  const declaredLength = Number(req.headers['content-length']);
  if (Number.isFinite(declaredLength) && declaredLength > maxRestoreBytes) {
    throw new Error(`Backup exceeds the ${maxRestoreBytes / (1024 * 1024)} MB restore limit.`);
  }

  let bytesWritten = 0;
  const sizeGuard = new Transform({
    transform(chunk, _encoding, callback) {
      bytesWritten += chunk.length;
      if (bytesWritten > maxRestoreBytes) {
        callback(new Error(`Backup exceeds the ${maxRestoreBytes / (1024 * 1024)} MB restore limit.`));
        return;
      }
      callback(null, chunk);
    },
  });

  await pipeline(req, sizeGuard, createWriteStream(outputPath, { flags: 'wx' }));
  if (bytesWritten === 0) throw new Error('The uploaded backup file is empty.');
}

router.post('/database/restore', async (req, res) => {
  if (!restoreEnabled) {
    res.status(403).json({
      message: 'Database restore is disabled. Set ENABLE_DATABASE_RESTORE=true in the server environment to enable it.',
    });
    return;
  }

  const databaseName = process.env.POSTGRES_DB || '';
  if (req.headers['x-restore-database'] !== databaseName) {
    res.status(400).json({ message: 'Type the current database name exactly to confirm the restore.' });
    return;
  }
  if (req.headers['content-type'] !== 'application/octet-stream') {
    res.status(415).json({ message: 'Upload a PostgreSQL custom-format .dump file.' });
    return;
  }
  if (!acquireOperation(res)) return;

  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'hungfashion-restore-')).catch(error => {
    databaseOperationInProgress = false;
    res.status(500).json({ message: error.message });
    return null;
  });
  if (!temporaryDirectory) return;

  const backupPath = path.join(temporaryDirectory, 'uploaded.dump');
  const pgRestore = process.env.PG_RESTORE_PATH || 'pg_restore';
  try {
    await saveRestoreUpload(req, backupPath);
    const connectionArgs = [
      '--no-password',
      '--host', process.env.POSTGRES_HOST || 'localhost',
      '--port', process.env.POSTGRES_PORT || '5432',
      '--username', process.env.POSTGRES_USER || '',
      '--dbname', databaseName,
    ];
    await runProcess(pgRestore, ['--list', backupPath], { env: postgresEnvironment() });
    await runProcess(pgRestore, [
      '--clean',
      '--if-exists',
      '--single-transaction',
      '--exit-on-error',
      '--no-owner',
      '--no-privileges',
      ...connectionArgs,
      backupPath,
    ], { env: postgresEnvironment(), timeoutMs: 300_000 });
    res.json({ success: true, message: `Database "${databaseName}" restored successfully.` });
  } catch (error) {
    console.error('Database restore failed:', error);
    res.status(400).json({ message: error.message });
  } finally {
    try {
      await rm(temporaryDirectory, { recursive: true, force: true });
    } catch (cleanupError) {
      console.error('Could not remove the temporary database restore file:', cleanupError);
    } finally {
      databaseOperationInProgress = false;
    }
  }
});

export default router;
