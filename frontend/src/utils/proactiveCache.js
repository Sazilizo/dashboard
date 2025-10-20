import api from "../api/client";
import { cacheTable } from "./tableCache";

let hasCached = false; // memory guard

export async function cacheFormSchemasIfOnline() {
  if (hasCached) {
    console.info("[proactiveCache] already cached this session, skipping");
    return;
  }

  const cachedOnce = localStorage.getItem("proactiveCacheDone");
  if (cachedOnce) {
    console.info("[proactiveCache] previously cached, skipping");
    hasCached = true;
    return;
  }

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    console.info("[proactiveCache] offline, skipping caching");
    return;
  }

  try {
    const tablesToCache = ["form_schemas", "schools", "workers", "students", "meals"];

    for (const table of tablesToCache) {
      try {
        const { data, error } = await api.from(table).select("*");
        if (error) {
          console.info(`[proactiveCache] failed to fetch ${table}:`, error.message || error);
          continue;
        }

        if (Array.isArray(data)) {
          await cacheTable(table, data);
          console.info(`[proactiveCache] cached ${table} (${data.length} rows)`);
        }
      } catch (err) {
        console.warn(`[proactiveCache] unexpected error fetching ${table}:`, err);
      }
    }

    const workers = await getTable("workers");
    for (const worker of workers.slice(0, 20)) {
      try {
        const path = `worker-uploads/workers/${worker.id}.jpg`;
        const { data } = await api.storage.from("worker-uploads").download(path);
        if (data) {
          await cacheFaceReference("worker", worker.id, data, []); 
        }
      } catch {}
    }


    localStorage.setItem("proactiveCacheDone", "true");
    hasCached = true;
    console.info("[proactiveCache] caching completed successfully");
  } catch (err) {
    console.warn("[proactiveCache] unexpected error:", err);
  }
}

export default cacheFormSchemasIfOnline;
