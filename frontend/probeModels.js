// probeModels.js
// Usage: node probeModels.js
// Ensure you replace BASE_URL with your models base URL (ending with /)
const BASE_URL = 'https://pmvecwjomvyxpgzfweov.supabase.co/storage/v1/object/public/models/v1/';

async function head(url) {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    return {
      url,
      ok: r.ok,
      status: r.status,
      headers: Object.fromEntries(r.headers.entries())
    };
  } catch (e) {
    return { url, ok: false, error: String(e) };
  }
}

async function fetchBytes(url, n = 128) {
  try {
    const r = await fetch(url);
    const ab = await r.arrayBuffer();
    const u8 = new Uint8Array(ab).slice(0, n);
    let textPreview = '';
    try { textPreview = new TextDecoder('utf-8', { fatal: false }).decode(u8); } catch {}
    return { url, ok: r.ok, status: r.status, headers: Object.fromEntries(r.headers.entries()), size: ab.byteLength, hex64: Array.from(u8.slice(0, 64)).map(b => b.toString(16).padStart(2,'0')).join(' '), textPreview };
  } catch (e) {
    return { url, ok: false, error: String(e) };
  }
}

async function main() {
  const manifestUrl = BASE_URL + 'models-manifest.json';
  console.log('Fetching manifest:', manifestUrl);
  const mresp = await fetch(manifestUrl);
  if (!mresp.ok) {
    console.error('Failed to fetch manifest:', mresp.status);
    console.log('HEAD headers:', await head(manifestUrl));
    return;
  }
  const manifestText = await mresp.text();
  let manifest;
  try { manifest = JSON.parse(manifestText); } catch (e) {
    console.error('Manifest is not valid JSON (server may be sending gzipped bytes without header).');
    const probe = await fetchBytes(manifestUrl, 256);
    console.log(probe);
    return;
  }
  const files = Object.keys(manifest.files || {});
  console.log('Files in manifest:', files.length);
  for (const f of files) {
    const url = BASE_URL + manifest.files[f].path.split('/').slice(1).join('/'); // manifest path includes v1/..., we want v1/...
    console.log('\\n---', f, '->', url);
    const h = await head(url);
    console.log('HEAD:', h.status, h.headers['content-type'], 'content-encoding:', h.headers['content-encoding']);
    const probe = await fetchBytes(url, 128);
    console.log('Sample:', probe.size, probe.hex64, probe.textPreview ? `textPreview("${probe.textPreview.slice(0,80)}")` : '');
  }
}

main().catch(e => console.error(e));