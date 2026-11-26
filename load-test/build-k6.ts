import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const esbuildBin = path.resolve(__dirname, '../client/node_modules/.bin/esbuild');
const inputFile = path.resolve(__dirname, 'k6/k6-blokus-workload.ts');
const outDir = path.resolve(__dirname, 'dist');
const outputFile = path.resolve(outDir, 'k6-blokus-workload.js');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

console.log(`📦 Bundling k6 workload script...`);
console.log(`   Source: ${inputFile}`);
console.log(`   Output: ${outputFile}`);

try {
  const cmd = `"${esbuildBin}" "${inputFile}" --bundle --format=esm --external:k6 --external:k6/* --outfile="${outputFile}"`;
  execSync(cmd, { stdio: 'inherit' });
  console.log(`✅ Build complete! You can now run: k6 run "${outputFile}"`);
} catch (err) {
  console.error(`❌ Build failed:`, err);
  process.exit(1);
}
