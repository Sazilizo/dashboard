#!/usr/bin/env node
// scripts/upload-models.js
// Node script to gzip model files under ./public/models and upload them to Supabase Storage
// Usage: set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_BUCKET, optionally PREFIX

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

// Accept either SUPABASE_URL (preferred for scripts/CI) or REACT_APP_SUPABASE_URL (convenience from .env)
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
// Accept multiple possible env var names for the service key to be forgiving in different setups
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_KEY;
const BUCKET = process.env.SUPABASE_BUCKET || 'public';
let PREFIX = process.env.PREFIX || 'models/v1/';
// Normalize prefix: remove any leading slashes and ensure a trailing slash
try {
  PREFIX = String(PREFIX).replace(/^\/+/, '').replace(/\/?$/, '/');
} catch (e) {
  PREFIX = 'models/v1/';
}
const MODELS_DIR = path.join(__dirname, '..', 'public', 'models');

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY) must be set in env');
  process.exit(2);
}

function walkDir(dir) {
  const results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat && stat.isDirectory()) {
      results.push(...walkDir(full));
    } else {
      results.push(full);
    }
  });
  return results;
}

function mimeTypeForFile(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.json') return 'application/json';
  if (ext === '.bin') return 'application/octet-stream';
  if (ext === '.pb' || ext === '.weights') return 'application/octet-stream';
  if (ext === '.txt') return 'text/plain';
  return 'application/octet-stream';
}

async function uploadFile(remotePath, buffer, contentType) {
  const url = `${SUPABASE_URL.replace(/\/+$/, '')}/storage/v1/object/${BUCKET}/${remotePath}`;
  const headers = {
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': contentType,
    'Content-Encoding': 'gzip',
    'Cache-Control': 'public, max-age=31536000, immutable'
  };

  const res = await fetch(url, { method: 'PUT', headers, body: buffer });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed ${res.status} ${res.statusText}: ${text}`);
  }
  return true;
}

(async function main() {
  try {
    if (!fs.existsSync(MODELS_DIR)) {
      console.error('Models directory not found:', MODELS_DIR);
      process.exit(1);
    }

    const files = walkDir(MODELS_DIR);
    console.log(`Found ${files.length} files to process`);

    const manifest = { files: {} };

    for (const f of files) {
      const rel = path.relative(MODELS_DIR, f).replace(/\\\\/g, '/');
      const remotePath = PREFIX + rel;
      console.log('Processing', rel);
      const buf = fs.readFileSync(f);

      // compute sha256 of original (hex)
      const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
      const gz = zlib.gzipSync(buf, { level: zlib.constants.Z_BEST_COMPRESSION });
      const contentType = mimeTypeForFile(f);
      try {
        await uploadFile(remotePath, gz, contentType);
        console.log('Uploaded', remotePath, `(gzipped ${(gz.length/1024).toFixed(1)}KB)`);

        manifest.files[rel] = {
          path: remotePath,
          size: buf.length,
          sha256,
          contentType
        };
      } catch (err) {
        console.error('Failed to upload', remotePath, err.message || err);
      }
    }

    // Upload manifest
    const manifestJson = JSON.stringify(manifest, null, 2);
    const manifestPath = PREFIX + 'models-manifest.json';
    const manifestUrl = `${SUPABASE_URL.replace(/\/+$/, '')}/storage/v1/object/${BUCKET}/${manifestPath}`;
    console.log('Uploading manifest to', manifestPath);
    const res = await fetch(manifestUrl, { method: 'PUT', headers: { Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=31536000, immutable' }, body: manifestJson });
    if (!res.ok) {
      console.error('Failed to upload manifest', await res.text());
    } else {
      console.log('Manifest uploaded.');
    }

    console.log('\nAll done. Public model base URL (example):');
  console.log(`${SUPABASE_URL.replace(/\/+$/, '')}/storage/v1/object/public/${BUCKET}/${PREFIX}`);
  } catch (err) {
    console.error('Unexpected error', err);
    process.exit(1);
  }
})();
