#!/usr/bin/env node
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

async function listFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      const sub = await listFiles(full);
      files.push(...sub);
    } else if (e.isFile()) {
      files.push(full);
    }
  }
  return files;
}

function isGzip(buf) {
  if (!buf || buf.length < 2) return false;
  return buf[0] === 0x1f && buf[1] === 0x8b;
}

async function sha256Hex(filePath) {
  const data = await fs.readFile(filePath);
  const h = crypto.createHash('sha256').update(data).digest('hex');
  return h;
}

async function inspectModels() {
  const modelsDir = path.resolve(__dirname, '..', 'public', 'models');
  try {
    const stat = await fs.stat(modelsDir);
    if (!stat.isDirectory()) {
      console.error('Models path exists but is not a directory:', modelsDir);
      process.exit(2);
    }
  } catch (e) {
    console.error('Models directory not found at', modelsDir);
    process.exit(2);
  }

  console.log('Scanning models in', modelsDir);
  const files = await listFiles(modelsDir);
  if (!files.length) {
    console.log('No files found in models directory.');
    return;
  }

  for (const f of files) {
    try {
      const fd = await fs.open(f, 'r');
      const { buffer } = await fd.read(Buffer.alloc(4), 0, 4, 0);
      await fd.close();
      const gz = isGzip(buffer);
      const stats = await fs.stat(f);
      const hash = await sha256Hex(f);
      console.log(`${path.relative(modelsDir, f)}\t| ${stats.size} bytes\t| ${gz ? 'GZIP' : 'raw ' }\t| sha256:${hash}`);
    } catch (e) {
      console.warn('Failed to inspect', f, e.message || e);
    }
  }
}

inspectModels().catch(err => {
  console.error('Error inspecting models:', err);
  process.exit(1);
});
