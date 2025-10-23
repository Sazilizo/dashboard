// Worker: fetch images and create ImageBitmap off the main thread to reduce main-thread decode cost
self.onmessage = async (e) => {
  const { id, paths } = e.data || {};
  if (!paths || !paths.length) return;

  for (const p of paths) {
    try {
      const resp = await fetch(p, { cache: "no-cache" });
      if (!resp.ok) {
        self.postMessage({ error: `fetch failed ${resp.status}`, path: p });
        continue;
      }
      const blob = await resp.blob();
      // createImageBitmap works in workers in modern browsers
      const bitmap = await createImageBitmap(blob);
      // Transfer the ImageBitmap back to main thread
      self.postMessage({ path: p, bitmap }, [bitmap]);
    } catch (err) {
      self.postMessage({ error: err?.message || String(err), path: p });
    }
  }
};
