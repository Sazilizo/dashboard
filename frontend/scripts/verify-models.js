#!/usr/bin/env node
// scripts/verify-models.js
// Verifies each model file listed in models-manifest.json by fetching,
// decompressing if needed, and checking SHA-256 against the manifest.

const crypto = require('crypto');
const pako = require('pako');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pmvecwjomvyxpgzfweov.supabase.co';
const BUCKET = process.env.SUPABASE_BUCKET || 'models';
const PREFIX = (process.env.PREFIX || 'v1/').replace(/^\/+/, '').replace(/\/?$/, '/');
const BASE_URL = `${SUPABASE_URL.replace(/\/+$/, '')}/storage/v1/object/public/${BUCKET}/${PREFIX}`;

async function fetchArrayBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const ab = await res.arrayBuffer();
  return { ab, headers: Object.fromEntries(res.headers.entries()) };
}

function isGzip(u8) {
  return u8 && u8.length >= 2 && u8[0] === 0x1f && u8[1] === 0x8b;
}

function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(Buffer.from(buffer)).digest('hex');
}

(async function main() {
  try {
    const manifestUrl = BASE_URL + 'models-manifest.json';
    console.log('Fetching manifest:', manifestUrl);
    const m = await fetch(manifestUrl);
    if (!m.ok) {
      console.error('Failed to fetch manifest:', m.status, await m.text());
      process.exit(2);
    }
    const manifest = await m.json();
    const files = Object.keys(manifest.files || {});
    console.log('Files in manifest:', files.length);
    let allOk = true;
    for (const key of files) {
      const entry = manifest.files[key];
      const remotePath = entry.path; // e.g. v1/face_...
      const url = `${SUPABASE_URL.replace(/\/+$/, '')}/storage/v1/object/public/${BUCKET}/${remotePath}`;
      process.stdout.write(`\n-- ${key} -> ${url}\n`);
      try {
        const { ab, headers } = await fetchArrayBuffer(url);
        const u8 = new Uint8Array(ab);
        const compressed = isGzip(u8) || (headers['content-encoding'] && /gzip|br|deflate/i.test(headers['content-encoding']));
        let decompressedBuffer = ab;
        if (isGzip(u8)) {
          try {
            const dec = pako.ungzip(u8);
            decompressedBuffer = dec.buffer;
            console.log('  Detected gzip (magic); decompressed ->', decompressedBuffer.byteLength, 'bytes');
          } catch (e) {
            console.warn('  gzip decompression failed:', e.message || e);
          }
        } else if (headers['content-encoding'] && /br/i.test(headers['content-encoding'])) {
          // Node has no built-in brotli decompression in older versions; try using zlib if available
          try {
            const zlib = require('zlib');
            const dec = zlib.brotliDecompressSync(Buffer.from(ab));
            decompressedBuffer = dec.buffer;
            console.log('  Detected brotli via header; decompressed ->', decompressedBuffer.byteLength, 'bytes');
          } catch (e) {
            console.warn('  brotli decompression failed:', e.message || e);
          }
        } else {
          // not compressed (based on magic/header)
          console.log('  Not compressed (size', ab.byteLength, 'bytes)');
        }

        const sha = sha256Hex(decompressedBuffer);
        const expected = entry.sha256;
        const sizeMatches = decompressedBuffer.byteLength === (entry.size || decompressedBuffer.byteLength);
        console.log(`  size(decompressed)=${decompressedBuffer.byteLength} expectedSize=${entry.size} sha=${sha} expectedSha=${expected} sizeMatches=${sizeMatches}`);
        if (expected && sha !== expected) {
          console.error('  MISMATCH: sha256 differs!');
          allOk = false;
        }
      } catch (e) {
        console.error('  ERROR fetching or verifying:', e.message || e);
        allOk = false;
      }
    }
    if (!allOk) {
      console.error('\nOne or more files failed verification.');
      process.exit(3);
    }
    console.log('\nAll files verified OK.');
  } catch (err) {
    console.error('Unexpected error', err);
    process.exit(1);
  }
})();
