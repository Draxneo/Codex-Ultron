import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

interface QueuedSave {
  techFormId: string;
  fieldId: string;
  value: string;
  timestamp: number;
}

interface QueuedPhoto {
  techFormId: string;
  fieldId: string;
  filePath: string;
  base64: string;
  photoType: string;
  timestamp: number;
}

const STORAGE_KEY_PREFIX = "techform_draft_";
const QUEUE_KEY = "techform_save_queue";
const PHOTO_QUEUE_KEY = "techform_photo_queue";

// localStorage has ~5MB limit. A single phone photo as base64 = ~2-4MB.
// If we exceed quota, photos are silently lost — we MUST warn the tech.
const PHOTO_QUEUE_SIZE_WARNING_THRESHOLD = 3; // warn after 3 queued photos

function getQueue(): QueuedSave[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); }
  catch { return []; }
}

function setQueue(queue: QueuedSave[]) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); }
  catch { /* quota exceeded for text saves — unlikely but handled */ }
}

function getPhotoQueue(): QueuedPhoto[] {
  try { return JSON.parse(localStorage.getItem(PHOTO_QUEUE_KEY) || "[]"); }
  catch { return []; }
}

/**
 * Attempt to store the photo queue.
 * Returns true on success, false if localStorage quota was exceeded.
 * IMPORTANT: never silently swallow quota errors — caller must handle.
 */
function setPhotoQueue(queue: QueuedPhoto[]): boolean {
  try {
    localStorage.setItem(PHOTO_QUEUE_KEY, JSON.stringify(queue));
    return true;
  } catch {
    return false; // quota exceeded — caller must warn tech
  }
}

export function useOfflineFormSync(techFormId: string | null) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [photoStorageFull, setPhotoStorageFull] = useState(false);
  const flushingRef = useRef(false);

  // Track online/offline
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // Save draft text values to localStorage
  const saveDraft = useCallback((values: Record<string, string>) => {
    if (!techFormId) return;
    try {
      localStorage.setItem(STORAGE_KEY_PREFIX + techFormId, JSON.stringify(values));
    } catch { /* quota exceeded for text — very unlikely */ }
  }, [techFormId]);

  const loadDraft = useCallback((): Record<string, string> | null => {
    if (!techFormId) return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY_PREFIX + techFormId);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }, [techFormId]);

  const clearDraft = useCallback(() => {
    if (!techFormId) return;
    localStorage.removeItem(STORAGE_KEY_PREFIX + techFormId);
    const queue = getQueue().filter(q => q.techFormId !== techFormId);
    setQueue(queue);
    const photoQ = getPhotoQueue().filter(q => q.techFormId !== techFormId);
    setPhotoQueue(photoQ);
    setPendingCount(queue.length + photoQ.length);
    setPhotoStorageFull(false);
  }, [techFormId]);

  const queueSave = useCallback((fieldId: string, value: string) => {
    if (!techFormId) return;
    const queue = getQueue();
    const filtered = queue.filter(q => !(q.techFormId === techFormId && q.fieldId === fieldId));
    filtered.push({ techFormId, fieldId, value, timestamp: Date.now() });
    setQueue(filtered);
    setPendingCount(filtered.length + getPhotoQueue().length);
  }, [techFormId]);

  /**
   * Queue a failed photo upload for retry when back online.
   * Stores photo as base64 in localStorage.
   *
   * CRITICAL: localStorage has a ~5MB limit across the entire app.
   * A single compressed phone photo = ~1-3MB base64.
   * We warn the tech if storage is full so they know to reconnect
   * before taking more photos — never silently lose their work.
   *
   * Returns: 'queued' | 'storage_full' | 'error'
   */
  const queuePhoto = useCallback(async (
    fieldId: string,
    file: File,
    photoType: string
  ): Promise<"queued" | "storage_full" | "error"> => {
    if (!techFormId) return "error";
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const filePath = `${techFormId}/${fieldId}_${Date.now()}_${file.name}`;
      const queue = getPhotoQueue();
      queue.push({ techFormId, fieldId, filePath, base64, photoType, timestamp: Date.now() });

      const saved = setPhotoQueue(queue);
      if (!saved) {
        // localStorage quota exceeded — warn the tech
        setPhotoStorageFull(true);
        return "storage_full";
      }

      // Warn if queue is getting large
      if (queue.length >= PHOTO_QUEUE_SIZE_WARNING_THRESHOLD) {
        setPhotoStorageFull(true);
      }

      setPendingCount(getQueue().length + queue.length);
      return "queued";
    } catch {
      return "error";
    }
  }, [techFormId]);

  // Flush queued saves when back online
  const flushQueue = useCallback(async () => {
    if (flushingRef.current) return;
    flushingRef.current = true;

    // Flush text saves
    const queue = getQueue();
    const remaining: QueuedSave[] = [];
    for (const item of queue) {
      try {
        await supabase.from("tech_form_responses").delete()
          .eq("tech_form_id", item.techFormId)
          .eq("field_id", item.fieldId);
        const { error } = await supabase.from("tech_form_responses")
          .insert({ tech_form_id: item.techFormId, field_id: item.fieldId, value: item.value });
        if (error) remaining.push(item);
      } catch {
        remaining.push(item);
      }
    }
    setQueue(remaining);

    // Flush photo queue
    const photoQ = getPhotoQueue();
    const remainingPhotos: QueuedPhoto[] = [];
    for (const item of photoQ) {
      try {
        const res = await fetch(item.base64);
        const blob = await res.blob();
        const { error: uploadErr } = await supabase.storage
          .from("tech-form-photos")
          .upload(item.filePath, blob);
        if (uploadErr) { remainingPhotos.push(item); continue; }

        const { error: dbErr } = await supabase.from("tech_form_photos").insert({
          tech_form_id: item.techFormId,
          file_path: item.filePath,
          photo_type: item.photoType,
          extraction_status: "none",
        });
        if (dbErr) remainingPhotos.push(item);
      } catch {
        remainingPhotos.push(item);
      }
    }
    setPhotoQueue(remainingPhotos);

    // Clear storage-full warning once queue is drained
    if (remainingPhotos.length === 0) setPhotoStorageFull(false);

    setPendingCount(remaining.length + remainingPhotos.length);
    flushingRef.current = false;
  }, []);

  // Auto-flush when coming back online
  useEffect(() => {
    if (isOnline) flushQueue();
  }, [isOnline, flushQueue]);

  // Periodic retry every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      if (isOnline && (getQueue().length > 0 || getPhotoQueue().length > 0)) flushQueue();
    }, 30000);
    return () => clearInterval(interval);
  }, [isOnline, flushQueue]);

  useEffect(() => {
    setPendingCount(getQueue().length + getPhotoQueue().length);
  }, []);

  return {
    isOnline,
    pendingCount,
    photoStorageFull, // NEW: true when offline photo storage is full — show warning to tech
    saveDraft,
    loadDraft,
    clearDraft,
    queueSave,
    queuePhoto,
    flushQueue,
  };
}
