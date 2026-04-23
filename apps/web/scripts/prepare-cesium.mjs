import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const cesiumSource = path.join(appRoot, 'node_modules/cesium/Build/Cesium');
const cesiumTarget = path.join(appRoot, 'public/cesium');

function sanitizeOctalEscapes(source) {
  return source.replace(/\\([0-7]{1,3})/g, (_, octalDigits) => {
    const hex = Number.parseInt(octalDigits, 8).toString(16).padStart(2, '0');
    return `\\x${hex}`;
  });
}

function copyDir(name) {
  fs.cpSync(path.join(cesiumSource, name), path.join(cesiumTarget, name), {
    recursive: true,
    force: true,
  });
}

fs.mkdirSync(cesiumTarget, { recursive: true });

const cesiumBundle = fs.readFileSync(path.join(cesiumSource, 'Cesium.js'), 'utf8');
fs.writeFileSync(path.join(cesiumTarget, 'Cesium.js'), sanitizeOctalEscapes(cesiumBundle));

for (const dir of ['Workers', 'Assets', 'ThirdParty', 'Widgets']) {
  copyDir(dir);
}

