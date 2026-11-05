import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..', '..');
const ignoredDirectories = new Set([
  '.git',
  '.venv',
  'backups',
  'build',
  'certs',
  'coverage',
  'desktop-dist',
  'dist',
  'node_modules',
]);

async function buildTree(directory, relativeDirectory = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const children = [];
  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    if (entry.isFile() && (entry.name === '.env' || entry.name.startsWith('.env.'))) continue;

    const relativePath = relativeDirectory
      ? path.posix.join(relativeDirectory, entry.name)
      : entry.name;
    const node = {
      name: entry.name,
      type: entry.isDirectory() ? 'directory' : 'file',
      path: relativePath,
    };

    if (entry.isDirectory()) {
      node.children = await buildTree(path.join(directory, entry.name), relativePath);
    }

    children.push(node);
  }

  return children;
}

const tree = {
  name: path.basename(projectRoot),
  type: 'directory',
  children: await buildTree(projectRoot),
};
const outputPath = path.join(projectRoot, 'tree.json');

await writeFile(outputPath, `${JSON.stringify(tree, null, 2)}\n`, 'utf8');
console.log(`Project tree written to ${outputPath}`);
