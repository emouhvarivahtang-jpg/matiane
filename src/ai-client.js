import { api, ApiError } from "./api";

function checkCancelled(signal) {
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    checkCancelled(signal);
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", cancel);
      resolve();
    }, ms);
    function cancel() {
      clearTimeout(timer);
      reject(new DOMException("Cancelled", "AbortError"));
    }
    signal?.addEventListener("abort", cancel, { once: true });
  });
}

// Send small analysis copies. The editor and print PDF keep the original pixels.
async function analysisImage(photo, maxSide, signal) {
  checkCancelled(signal);
  const image = new Image();
  image.src = photo.src;
  let cancelDecode;
  const cancelled = new Promise((_, reject) => {
    cancelDecode = () => {
      reject(new DOMException("Cancelled", "AbortError"));
      image.src = "";
    };
    signal?.addEventListener("abort", cancelDecode, { once: true });
  });
  try {
    await Promise.race([image.decode(), cancelled]);
  } finally {
    signal?.removeEventListener("abort", cancelDecode);
  }
  checkCancelled(signal);
  let side = maxSide;
  for (let attempt = 0; attempt < 4; attempt++) {
    const scale = Math.min(1, side / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/jpeg", 0.75 - attempt * 0.08);
    // Leave room for 200 analysis copies within the server's 32 MiB body limit.
    if (data.length < 160000) return data;
    side = Math.round(side * 0.8);
  }
  throw new ApiError("ai_image_too_large", 413);
}

export async function buildWithAi(
  book,
  { signal, onProgress = () => {}, signedIn = false } = {},
) {
  let job = null;
  try {
    const session = await api("/ai/session", { signal });
    if (!session.available) throw new ApiError("ai_unavailable", 503);
    if (book.photos.length > session.maxPhotos)
      throw new ApiError("ai_photo_limit", 413);
    const photos = [];
    onProgress({ phase: "preparing", completed: 0, total: book.photos.length });
    for (const photo of book.photos) {
      checkCancelled(signal);
      const descriptor = {
        id: photo.id,
        width: photo.width,
        height: photo.height,
      };
      if (signedIn && /^\/api\/photos\/[a-f0-9]{64}$/.test(photo.src))
        descriptor.src = photo.src;
      else
        descriptor.image = await analysisImage(
          photo,
          Math.min(640, session.maxImageSide || 640),
          signal,
        );
      photos.push(descriptor);
      onProgress({
        phase: "preparing",
        completed: photos.length,
        total: book.photos.length,
      });
    }
    checkCancelled(signal);
    // Keep the short acknowledgement request alive after a user cancellation.
    // Otherwise the server may create a job whose cancellation token we never receive.
    const acknowledgement = new AbortController();
    const acknowledgementTimeout = setTimeout(
      () => acknowledgement.abort(),
      30000,
    );
    try {
      job = await api("/ai/assemble", {
        method: "POST",
        signal: acknowledgement.signal,
        headers: { "X-Matiane-AI-Guest": session.guestToken },
        body: {
          language: book.language,
          title: book.title,
          pageCount: book.pageCount,
          photos,
        },
      });
    } catch (error) {
      if (acknowledgement.signal.aborted && !signal?.aborted)
        throw new ApiError("ai_timeout", 504);
      throw error;
    } finally {
      clearTimeout(acknowledgementTimeout);
    }
    checkCancelled(signal);
    const deadline = Date.now() + 20 * 60 * 1000;
    let connectionFailures = 0;
    while (Date.now() < deadline) {
      checkCancelled(signal);
      let value;
      try {
        value = await api("/ai/jobs/" + job.id, {
          signal,
          headers: { "X-Matiane-AI-Token": job.token },
        });
        connectionFailures = 0;
      } catch (error) {
        // A brief lost connection should not discard a long-running assembly.
        if (
          error.name !== "AbortError" &&
          (!error.status || error.status >= 500) &&
          connectionFailures++ < 2
        ) {
          await delay(1500, signal);
          continue;
        }
        throw error;
      }
      onProgress(value);
      if (value.status === "completed") return value.result;
      if (value.status === "failed") {
        const failure = new ApiError(value.error || "ai_failed", 502);
        failure.aiDetails = value.errorDetails || {
          phase: value.phase,
          completed: value.completed,
          total: value.total,
        };
        throw failure;
      }
      if (value.status === "cancelled")
        throw new DOMException("Cancelled", "AbortError");
      await delay(1000, signal);
    }
    throw new ApiError("ai_timeout", 504);
  } catch (error) {
    if (job)
      await api("/ai/jobs/" + job.id, {
        method: "DELETE",
        headers: { "X-Matiane-AI-Token": job.token },
      }).catch(() => {});
    throw error;
  }
}
