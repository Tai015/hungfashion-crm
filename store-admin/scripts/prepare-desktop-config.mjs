import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
const envPath = path.join(projectDir, 'server', '.env');
const outputPath = path.join(projectDir, 'desktop', 'deploy-config.json');

if (!existsSync(envPath)) {
  throw new Error('Không tìm thấy server/.env. Hãy tạo tệp này và điền DEPLOY_URL trước khi đóng gói.');
}

const environment = dotenv.parse(readFileSync(envPath));
const deployUrl = String(environment.DEPLOY_URL || '').trim();
if (!deployUrl) {
  throw new Error('DEPLOY_URL đang để trống trong server/.env. Hãy điền địa chỉ website đã triển khai trước khi đóng gói.');
}

let parsedUrl;
try {
  parsedUrl = new URL(deployUrl);
} catch {
  throw new Error('DEPLOY_URL trong server/.env không phải địa chỉ URL hợp lệ.');
}
if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
  throw new Error('DEPLOY_URL chỉ được dùng giao thức http hoặc https.');
}

writeFileSync(outputPath, `${JSON.stringify({ DEPLOY_URL: deployUrl }, null, 2)}\n`);
console.log('Đã chuẩn bị cấu hình website cho bản Electron.');
