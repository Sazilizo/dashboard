// Proactive caching of profile images for offline biometric authentication
// Caches images from profile-avatars, worker-uploads, and student-uploads buckets

import api from "../api/client";
import imageCache from "./imageCache";
import { getTable } from "./tableCache";

/**
 * Fetch and cache profile images for all users
 * @returns {Promise<object>} Results summary
 */
// Coalesce & debounce globals for image caching
let _imageCacheInFlight = null;
let _imageCacheLastRun = 0;
const IMAGE_CACHE_MIN_INTERVAL_MS = 30 * 1000; // 30s

async function runWithConcurrency(tasks, concurrency = 4) {
  const results = [];
  const executing = new Set();

  for (const task of tasks) {
    const p = Promise.resolve().then(() => task()).finally(() => executing.delete(p));
    results.push(p);
    executing.add(p);

    if (executing.size >= concurrency) {
      // Wait for one to finish
      await Promise.race(Array.from(executing)).catch(() => {});
    }
  }

  return Promise.all(results);
}

export async function cacheAllUserImages() {
  const now = Date.now();
  if (_imageCacheInFlight) {
    console.info('[proactiveImageCache] A user-image cache run is already in-flight - coalescing call');
    return _imageCacheInFlight;
  }

  if (now - _imageCacheLastRun < IMAGE_CACHE_MIN_INTERVAL_MS) {
    console.info('[proactiveImageCache] Skipping user image cache - ran recently');
    return { cached: 0, failed: 0, skipped: 0 };
  }

  _imageCacheLastRun = now;
  _imageCacheInFlight = (async () => {
    console.log("[proactiveImageCache] Starting user profile image cache...");
    try {
      const profiles = await getTable("profiles");
      if (!profiles?.length) {
        console.log("[proactiveImageCache] No profiles found to cache");
        return { cached: 0, failed: 0, skipped: 0 };
      }

      // List profile-avatars once
      const { data: files, error: listErr } = await api.storage
        .from("profile-avatars")
        .list("", { limit: 1000 });

      if (listErr) {
        console.warn("[proactiveImageCache] Failed to list profile-avatars:", listErr);
        return { cached: 0, failed: profiles.length, skipped: 0 };
      }

      const imageFiles = (files || []).filter((f) => /\.(jpg|jpeg|png)$/i.test(f.name));

      let cached = 0;
      let failed = 0;
      let skipped = 0;

      const tasks = profiles.map((profile) => async () => {
        try {
          const userImages = imageFiles.filter((f) => {
            const nameWithoutExt = f.name.replace(/\.(jpg|jpeg|png)$/i, "");
            return nameWithoutExt === String(profile.id);
          });

          if (!userImages.length) {
            if (profile.worker_id) {
              const workerId = profile.worker_id;
              const workerPath = `workers/${workerId}/profile-picture`;
              const { data: workerFiles } = await api.storage.from("worker-uploads").list(workerPath);
              if (workerFiles?.length) {
                const workerImages = workerFiles.filter((f) => /\.(jpg|jpeg|png)$/i.test(f.name));
                for (const file of workerImages) {
                  const fullPath = `${workerPath}/${file.name}`;
                  const already = await imageCache.isImageCached('worker-uploads', fullPath);
                  if (already) continue;
                  const blob = await downloadImageBlob("worker-uploads", fullPath);
                  if (blob) {
                    await imageCache.cacheImage("worker-uploads", fullPath, blob, profile.id, { source: "worker-uploads", workerId });
                    cached++;
                  } else {
                    failed++;
                  }
                }
              } else {
                skipped++;
              }
            } else {
              skipped++;
            }
            return;
          }

          for (const file of userImages) {
            const already = await imageCache.isImageCached('profile-avatars', file.name);
            if (already) continue;
            const blob = await downloadImageBlob("profile-avatars", file.name);
            if (blob) {
              await imageCache.cacheImage("profile-avatars", file.name, blob, profile.id, { source: "profile-avatars" });
              cached++;
            } else {
              failed++;
            }
          }
        } catch (err) {
          console.warn(`[proactiveImageCache] Failed to cache images for user ${profile.id}:`, err);
          failed++;
        }
      });

      // Run with concurrency limit
      await runWithConcurrency(tasks, 4);

      console.log(`[proactiveImageCache] User images cached: ${cached} success, ${failed} failed, ${skipped} skipped`);
      return { cached, failed, skipped };
    } catch (err) {
      console.error("[proactiveImageCache] cacheAllUserImages error:", err);
      return { cached: 0, failed: 0, skipped: 0, error: err?.message || String(err) };
    }
  })();

  // clear in-flight when done
  _imageCacheInFlight.finally(() => { _imageCacheInFlight = null; });
  return _imageCacheInFlight;
}

/**
 * Fetch and cache profile images for all students
 * @returns {Promise<object>} Results summary
 */
export async function cacheAllStudentImages() {
  console.log("[proactiveImageCache] Starting student profile image cache...");
  
  try {
    // Get all students
    const students = await getTable("students");
    if (!students?.length) {
      console.log("[proactiveImageCache] No students found to cache");
      return { cached: 0, failed: 0, skipped: 0 };
    }

    let cached = 0;
    let failed = 0;
    let skipped = 0;

    for (const student of students) {
      try {
        const studentPath = `students/${student.id}/profile-picture`;
        
        const { data: files, error: listErr } = await api.storage
          .from("student-uploads")
          .list(studentPath);

        if (listErr || !files?.length) {
          skipped++;
          continue;
        }

        // Filter for image files
        const imageFiles = files.filter((f) => /\.(jpg|jpeg|png)$/i.test(f.name));
        
        if (!imageFiles.length) {
          skipped++;
          continue;
        }

        // Cache all images for this student (limit to first 3)
        const limited = imageFiles.slice(0, 3);
        
        for (const file of limited) {
          const fullPath = `${studentPath}/${file.name}`;
          const blob = await downloadImageBlob("student-uploads", fullPath);
          
          if (blob) {
            await imageCache.cacheImage("student-uploads", fullPath, blob, student.id, {
              source: "student-uploads"
            });
            cached++;
          } else {
            failed++;
          }
        }
      } catch (err) {
        console.warn(`[proactiveImageCache] Failed to cache images for student ${student.id}:`, err);
        failed++;
      }
    }

    console.log(`[proactiveImageCache] Student images cached: ${cached} success, ${failed} failed, ${skipped} skipped`);
    return { cached, failed, skipped };
  } catch (err) {
    console.error("[proactiveImageCache] cacheAllStudentImages error:", err);
    return { cached: 0, failed: 0, skipped: 0, error: err.message };
  }
}

/**
 * Download an image blob from Supabase Storage
 * @param {string} bucket - Storage bucket name
 * @param {string} path - File path within bucket
 * @returns {Promise<Blob|null>} Image blob or null on failure
 */
async function downloadImageBlob(bucket, path) {
  try {
    const { data, error } = await api.storage
      .from(bucket)
      .download(path);

    if (error) {
      console.warn(`[proactiveImageCache] Download failed for ${bucket}/${path}:`, error);
      return null;
    }

    return data; // This is a Blob
  } catch (err) {
    console.warn(`[proactiveImageCache] Download exception for ${bucket}/${path}:`, err);
    return null;
  }
}

/**
 * Cache images for a specific user by ID
 * @param {string|number} userId - User profile ID
 * @returns {Promise<number>} Number of images cached
 */
export async function cacheUserImages(userId) {
  try {
    const { data: profile } = await api
      .from("profiles")
      .select("id, worker_id")
      .eq("id", userId)
      .single();

    if (!profile) return 0;

    let cached = 0;

    // Try profile-avatars first
    const { data: files } = await api.storage
      .from("profile-avatars")
      .list("");

    if (files?.length) {
      const imageFiles = files.filter((f) => /\.(jpg|jpeg|png)$/i.test(f.name));
      const userImages = imageFiles.filter((f) => {
        const nameWithoutExt = f.name.replace(/\.(jpg|jpeg|png)$/i, "");
        return nameWithoutExt === String(userId);
      });

      for (const file of userImages) {
        const blob = await downloadImageBlob("profile-avatars", file.name);
        if (blob) {
          await imageCache.cacheImage("profile-avatars", file.name, blob, userId);
          cached++;
        }
      }
    }

    // Try worker-uploads if applicable
    if (profile.worker_id && cached === 0) {
      const workerId = profile.worker_id;
      const workerPath = `workers/${workerId}/profile-picture`;
      
      const { data: workerFiles } = await api.storage
        .from("worker-uploads")
        .list(workerPath);

      if (workerFiles?.length) {
        const workerImages = workerFiles.filter((f) => /\.(jpg|jpeg|png)$/i.test(f.name));
        
        for (const file of workerImages) {
          const fullPath = `${workerPath}/${file.name}`;
          const blob = await downloadImageBlob("worker-uploads", fullPath);
          
          if (blob) {
            await imageCache.cacheImage("worker-uploads", fullPath, blob, userId);
            cached++;
          }
        }
      }
    }

    console.log(`[proactiveImageCache] Cached ${cached} image(s) for user ${userId}`);
    return cached;
  } catch (err) {
    console.error(`[proactiveImageCache] Failed to cache images for user ${userId}:`, err);
    return 0;
  }
}

/**
 * Cache images for a specific student by ID
 * @param {string|number} studentId - Student ID
 * @returns {Promise<number>} Number of images cached
 */
export async function cacheStudentImages(studentId) {
  try {
    const studentPath = `students/${studentId}/profile-picture`;
    
    const { data: files } = await api.storage
      .from("student-uploads")
      .list(studentPath);

    if (!files?.length) return 0;

    const imageFiles = files.filter((f) => /\.(jpg|jpeg|png)$/i.test(f.name));
    const limited = imageFiles.slice(0, 3);
    
    let cached = 0;
    
    for (const file of limited) {
      const fullPath = `${studentPath}/${file.name}`;
      const blob = await downloadImageBlob("student-uploads", fullPath);
      
      if (blob) {
        await imageCache.cacheImage("student-uploads", fullPath, blob, studentId);
        cached++;
      }
    }

    console.log(`[proactiveImageCache] Cached ${cached} image(s) for student ${studentId}`);
    return cached;
  } catch (err) {
    console.error(`[proactiveImageCache] Failed to cache images for student ${studentId}:`, err);
    return 0;
  }
}

/**
 * Cache all profile images (users + students) - main entry point
 * @returns {Promise<object>} Combined results
 */
export async function cacheAllProfileImages() {
  console.log("[proactiveImageCache] Starting comprehensive profile image cache...");
  
  const userResults = await cacheAllUserImages();
  const studentResults = await cacheAllStudentImages();
  
  const combined = {
    users: userResults,
    students: studentResults,
    totalCached: userResults.cached + studentResults.cached,
    totalFailed: userResults.failed + studentResults.failed,
    totalSkipped: userResults.skipped + studentResults.skipped
  };
  
  console.log(`[proactiveImageCache] Complete! Total: ${combined.totalCached} cached, ${combined.totalFailed} failed, ${combined.totalSkipped} skipped`);
  
  return combined;
}

export default {
  cacheAllUserImages,
  cacheAllStudentImages,
  cacheUserImages,
  cacheStudentImages,
  cacheAllProfileImages
};
