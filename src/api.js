let csrf = null;
export class ApiError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}
export async function api(path, { method = "GET", body } = {}) {
  const headers = { "X-Matiane-Client": "studio" };
  if (method !== "GET" && csrf) headers["X-CSRF-Token"] = csrf;
  if (body && !(body instanceof Blob))
    headers["Content-Type"] = "application/json";
  const response = await fetch("/api" + path, {
    method,
    headers,
    credentials: "same-origin",
    body:
      body instanceof Blob
        ? body
        : body === undefined
          ? undefined
          : JSON.stringify(body),
  });
  const value = await response.json();
  if (!response.ok)
    throw new ApiError(value.error || "request_failed", response.status);
  if ("csrfToken" in value) csrf = value.csrfToken;
  return value;
}
export class CloudWriter {
  constructor(info = null) {
    this.info = info;
    this.queue = Promise.resolve();
    this.uploads = new Map();
    this.conflict = false;
  }
  save(book, { checkpoint = false, label = "" } = {}) {
    const task = this.queue
      .catch(() => {})
      .then(async () => {
        if (this.conflict) throw new ApiError("version_conflict", 409);
        const photos = [];
        const present = new Set(book.photos.map((p) => p.src));
        for (const src of this.uploads.keys())
          if (!present.has(src)) this.uploads.delete(src);
        for (const original of book.photos) {
          const { thumbnail, ...photo } = original;
          if (
            photo.src.startsWith("/api/photos/") ||
            photo.src.startsWith("/photos/")
          ) {
            photos.push(photo);
            continue;
          }
          let remote = this.uploads.get(photo.src);
          if (!remote) {
            const blob = await (await fetch(photo.src)).blob();
            remote = await api("/photos", { method: "POST", body: blob });
            this.uploads.set(photo.src, remote);
          }
          photos.push({
            ...photo,
            src: remote.src,
            width: remote.width,
            height: remote.height,
          });
        }
        const payload = { ...book, photos };
        try {
          const result = this.info
            ? await api("/books/" + this.info.id, {
                method: "PUT",
                body: {
                  book: payload,
                  baseVersion: this.info.revision,
                  checkpoint,
                  label,
                },
              })
            : await api("/books", { method: "POST", body: { book: payload } });
          this.info = { id: result.id, revision: result.revision };
          if (checkpoint && result.revision === 1) {
            const saved = await api("/books/" + this.info.id, {
              method: "PUT",
              body: {
                book: payload,
                baseVersion: this.info.revision,
                checkpoint: true,
                label,
              },
            });
            this.info = { id: saved.id, revision: saved.revision };
          }
          return this.info;
        } catch (e) {
          if (e.code === "version_conflict") this.conflict = true;
          throw e;
        }
      });
    this.queue = task;
    return task;
  }
}
