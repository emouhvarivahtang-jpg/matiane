import http from "node:http";
import { DatabaseSync, backup } from "node:sqlite";
import {
  randomBytes,
  randomUUID,
  createHash,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
sharp.cache({ memory: 32, files: 0, items: 50 });
sharp.concurrency(1);
import { validateBook } from "../src/model.js";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const derive = promisify(scrypt);
const iso = () => new Date().toISOString();
const same = (a, b) => {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
};
class ApiError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}
const fail = (status, code) => {
  throw new ApiError(status, code);
};
const validPassword = (password) =>
  typeof password === "string" &&
  password.length >= 10 &&
  Buffer.byteLength(password) <= 256;
const validEmail = (email) =>
  typeof email === "string" &&
  email.length <= 254 &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
async function passwordHash(password, salt) {
  return (
    await derive(password, salt, 64, {
      N: 32768,
      r: 8,
      p: 3,
      maxmem: 64 * 1024 * 1024,
    })
  ).toString("hex");
}

export async function createApp(options = {}) {
  const dataDir =
    options.dataDir || process.env.DATA_DIR || path.resolve(".matiane-data");
  const publicOrigin =
    options.publicOrigin ||
    process.env.PUBLIC_ORIGIN ||
    "http://127.0.0.1:3000";
  const secure = options.secure ?? process.env.SECURE_COOKIES !== "false";
  const trustProxy = options.trustProxy ?? process.env.TRUST_PROXY === "true";
  const photoQuota = options.photoQuota ?? 1024 * 1024 * 1024;
  const cookieName = secure ? "__Host-matiane-session" : "matiane-session";
  const photoDir = path.join(dataDir, "photos");
  const backupDir = path.join(dataDir, "backups");
  await fs.mkdir(photoDir, { recursive: true, mode: 0o700 });
  await fs.mkdir(backupDir, { recursive: true, mode: 0o700 });
  const dbPath = path.join(dataDir, "matiane.sqlite");
  const db = new DatabaseSync(dbPath);
  await fs.chmod(dbPath, 0o600);
  db.exec(
    "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
  );
  db.exec(
    [
      "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, salt TEXT NOT NULL, password_hash TEXT NOT NULL, recovery_hash TEXT NOT NULL, created_at TEXT NOT NULL);",
      "CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, csrf TEXT NOT NULL, expires INTEGER NOT NULL);",
      "CREATE TABLE IF NOT EXISTS photos (hash TEXT PRIMARY KEY, width INTEGER NOT NULL, height INTEGER NOT NULL, size INTEGER NOT NULL, mime TEXT NOT NULL, orphaned_at TEXT);",
      "CREATE TABLE IF NOT EXISTS photo_owners (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, hash TEXT NOT NULL REFERENCES photos(hash), PRIMARY KEY(user_id,hash));",
      "CREATE TABLE IF NOT EXISTS books (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, current_revision INTEGER NOT NULL DEFAULT 0, title TEXT NOT NULL, page_count INTEGER NOT NULL, cover TEXT, updated_at TEXT NOT NULL);",
      "CREATE TABLE IF NOT EXISTS versions (book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE, revision INTEGER NOT NULL, data TEXT NOT NULL, digest TEXT NOT NULL, kind TEXT NOT NULL, label TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(book_id,revision));",
      "CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);",
      "CREATE INDEX IF NOT EXISTS books_user ON books(user_id); CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires);",
    ].join("\n"),
  );
  let authActive = 0;
  let photoActive = 0;
  let backupActive = false;
  const locks = new Map();
  async function lock(key, task) {
    const previous = locks.get(key) || Promise.resolve();
    let release;
    const current = new Promise((resolve) => {
      release = resolve;
    });
    locks.set(key, current);
    await previous;
    try {
      return await task();
    } finally {
      release();
      if (locks.get(key) === current) locks.delete(key);
    }
  }
  function transaction(task) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = task();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  function consumeRate(key, limit, seconds) {
    const now = Date.now();
    key = hash(key);
    const row = db.prepare("SELECT * FROM rate_limits WHERE key=?").get(key);
    if (row && row.expires > now && row.count >= limit)
      fail(429, "too_many_requests");
    db.prepare(
      "INSERT INTO rate_limits(key,count,expires) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET count=excluded.count,expires=excluded.expires",
    ).run(
      key,
      row && row.expires > now ? row.count + 1 : 1,
      row && row.expires > now ? row.expires : now + seconds * 1000,
    );
  }
  function userSession(req) {
    const cookie = (req.headers.cookie || "")
      .split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith(cookieName + "="));
    const token = cookie?.slice(cookieName.length + 1);
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    return db
      .prepare(
        "SELECT sessions.*,users.email FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires>?",
      )
      .get(hash(token), Date.now());
  }
  function requireSession(req) {
    const session = userSession(req);
    if (!session) fail(401, "unauthorized");
    return session;
  }
  function mutation(req, session) {
    if (
      req.headers.origin !== publicOrigin ||
      req.headers["x-matiane-client"] !== "studio"
    )
      fail(403, "forbidden_origin");
    if (
      secure &&
      (trustProxy
        ? req.headers["x-forwarded-proto"] !== "https"
        : !req.socket.encrypted)
    )
      fail(403, "https_required");
    if (session && !same(req.headers["x-csrf-token"] || "", session.csrf))
      fail(403, "invalid_csrf");
  }
  function authResponse(res, user, recoveryCode) {
    const token = randomBytes(32).toString("base64url");
    const csrf = randomBytes(24).toString("base64url");
    db.prepare("INSERT INTO sessions VALUES(?,?,?,?)").run(
      hash(token),
      user.id,
      csrf,
      Date.now() + 30 * 86400 * 1000,
    );
    res.setHeader(
      "Set-Cookie",
      cookieName +
        "=" +
        token +
        "; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000" +
        (secure ? "; Secure" : ""),
    );
    return {
      user: { id: user.id, email: user.email },
      csrfToken: csrf,
      ...(recoveryCode ? { recoveryCode } : {}),
    };
  }
  const ownedBook = (id, userId) => {
    const b = db
      .prepare("SELECT * FROM books WHERE id=? AND user_id=?")
      .get(id, userId);
    if (!b) fail(404, "not_found");
    return b;
  };
  function currentBook(row) {
    return {
      id: row.id,
      revision: row.current_revision,
      updatedAt: row.updated_at,
      book: JSON.parse(
        db
          .prepare("SELECT data FROM versions WHERE book_id=? AND revision=?")
          .get(row.id, row.current_revision).data,
      ),
    };
  }
  function validateCloudBook(value, userId) {
    let book;
    try {
      book = validateBook(value, { allowCloud: true });
    } catch {
      fail(400, "invalid_book");
    }
    for (const photo of book.photos) {
      if (photo.src.startsWith("/photos/")) continue;
      if (!/^\/api\/photos\/[a-f0-9]{64}$/.test(photo.src))
        fail(400, "upload_photos_first");
      const row = db
        .prepare(
          "SELECT photos.* FROM photos JOIN photo_owners USING(hash) WHERE hash=? AND user_id=?",
        )
        .get(photo.src.slice(12), userId);
      if (!row || row.width !== photo.width || row.height !== photo.height)
        fail(400, "invalid_photo_reference");
    }
    book.photos = book.photos.map(({ thumbnail, ...photo }) => photo);
    return book;
  }
  function appendVersion(row, book, kind, label = "", force = false) {
    const data = JSON.stringify(book);
    const digest = hash(data);
    const last = db
      .prepare("SELECT digest FROM versions WHERE book_id=? AND revision=?")
      .get(row.id, row.current_revision);
    if (!force && last?.digest === digest)
      return { id: row.id, revision: row.current_revision, unchanged: true };
    if (
      kind === "manual" &&
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM versions WHERE book_id=? AND kind='manual'",
        )
        .get(row.id).n >= 50
    )
      fail(409, "version_limit");
    const revision = row.current_revision + 1;
    const timestamp = iso();
    db.prepare("INSERT INTO versions VALUES(?,?,?,?,?,?,?)").run(
      row.id,
      revision,
      data,
      digest,
      kind,
      label,
      timestamp,
    );
    const coverId =
      book.pages[0].photos.find(Boolean) ||
      book.pages
        .slice(1)
        .flatMap((p) => p.photos)
        .find(Boolean);
    const cover = book.photos.find((p) => p.id === coverId)?.src || null;
    db.prepare(
      "UPDATE books SET current_revision=?,title=?,page_count=?,cover=?,updated_at=? WHERE id=?",
    ).run(revision, book.title, book.pageCount, cover, timestamp, row.id);
    db.prepare(
      "DELETE FROM versions WHERE book_id=? AND kind IN ('auto','restore') AND revision NOT IN (SELECT revision FROM versions WHERE book_id=? AND kind IN ('auto','restore') ORDER BY revision DESC LIMIT 30) AND revision<>?",
    ).run(row.id, row.id, revision);
    return { id: row.id, revision, updatedAt: timestamp };
  }
  function releaseUnusedPhotos(userId) {
    db.prepare(
      "DELETE FROM photo_owners WHERE user_id=? AND hash NOT IN (SELECT substr(json_extract(p.value,'$.src'),13) FROM versions v JOIN books b ON b.id=v.book_id JOIN json_each(v.data,'$.photos') p WHERE b.user_id=? AND json_extract(p.value,'$.src') LIKE '/api/photos/%')",
    ).run(userId, userId);
    db.prepare(
      "UPDATE photos SET orphaned_at=? WHERE orphaned_at IS NULL AND NOT EXISTS (SELECT 1 FROM photo_owners o WHERE o.hash=photos.hash)",
    ).run(iso());
  }
  async function body(req, max = 5 * 1024 * 1024, json = true) {
    if (
      json &&
      !String(req.headers["content-type"]).startsWith("application/json")
    )
      fail(415, "invalid_request");
    if (Number(req.headers["content-length"]) > max)
      fail(413, "file_too_large");
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > max) fail(413, "file_too_large");
      chunks.push(chunk);
    }
    const data = Buffer.concat(chunks);
    if (!json) return data;
    try {
      return JSON.parse(data.toString());
    } catch {
      fail(400, "invalid_request");
    }
  }
  function respond(res, status, value) {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(JSON.stringify(value));
  }
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, publicOrigin);
      const route = url.pathname;
      if (req.method === "GET" && route === "/api/health")
        return respond(res, 200, { status: "ok" });
      if (req.method === "GET" && route === "/api/session") {
        const session = userSession(req);
        return respond(res, 200, {
          user: session ? { id: session.user_id, email: session.email } : null,
          csrfToken: session?.csrf || null,
        });
      }
      if (
        req.method === "POST" &&
        ["/api/auth/register", "/api/auth/login", "/api/auth/recover"].includes(
          route,
        )
      ) {
        mutation(req);
        const data = await body(req, 4096);
        const email =
          typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
        if (!validEmail(email)) fail(400, "invalid_email");
        if (!validPassword(data.password)) fail(400, "invalid_password");
        const ip = trustProxy
          ? String(req.headers["x-real-ip"] || req.socket.remoteAddress)
          : req.socket.remoteAddress;
        consumeRate("auth:" + ip + ":" + email, 10, 900);
        consumeRate("auth-ip:" + ip, 40, 900);
        if (authActive >= 4) fail(429, "too_many_requests");
        authActive++;
        try {
          const existing = db
            .prepare("SELECT * FROM users WHERE email=?")
            .get(email);
          if (route.endsWith("/register")) {
            consumeRate("register:" + ip, 10, 3600);
            if (existing) fail(409, "email_in_use");
            if (db.prepare("SELECT COUNT(*) AS n FROM users").get().n >= 1000)
              fail(503, "registration_unavailable");
            const recovery = randomBytes(24).toString("hex");
            const user = {
              id: randomUUID(),
              email,
              salt: randomBytes(16).toString("hex"),
            };
            const password = await passwordHash(data.password, user.salt);
            if (db.prepare("SELECT 1 FROM users WHERE email=?").get(email))
              fail(409, "email_in_use");
            try {
              db.prepare("INSERT INTO users VALUES(?,?,?,?,?,?)").run(
                user.id,
                email,
                user.salt,
                password,
                hash(recovery),
                iso(),
              );
            } catch (error) {
              if (error.code?.includes("CONSTRAINT")) fail(409, "email_in_use");
              throw error;
            }
            return respond(
              res,
              201,
              authResponse(res, user, recovery.match(/.{1,8}/g).join("-")),
            );
          }
          if (route.endsWith("/recover")) {
            const code =
              typeof data.code === "string"
                ? data.code.replace(/-/g, "").toLowerCase()
                : "";
            if (
              !existing ||
              !/^[a-f0-9]{48}$/.test(code) ||
              !same(hash(code), existing.recovery_hash)
            )
              fail(401, "invalid_recovery");
            const salt = randomBytes(16).toString("hex");
            const password = await passwordHash(data.password, salt);
            const recovery = randomBytes(24).toString("hex");
            const changed = db
              .prepare(
                "UPDATE users SET salt=?,password_hash=?,recovery_hash=? WHERE id=? AND recovery_hash=?",
              )
              .run(
                salt,
                password,
                hash(recovery),
                existing.id,
                existing.recovery_hash,
              );
            if (!changed.changes) fail(401, "invalid_recovery");
            db.prepare("DELETE FROM sessions WHERE user_id=?").run(existing.id);
            return respond(
              res,
              200,
              authResponse(res, existing, recovery.match(/.{1,8}/g).join("-")),
            );
          }
          const calculated = await passwordHash(
            data.password,
            existing?.salt || "unknown-account-salt",
          );
          if (!existing || !same(calculated, existing.password_hash))
            fail(401, "invalid_credentials");
          return respond(res, 200, authResponse(res, existing));
        } finally {
          authActive--;
        }
      }
      const session = requireSession(req);
      const userId = session.user_id;
      if (!["GET", "HEAD"].includes(req.method)) mutation(req, session);
      if (req.method === "POST" && route === "/api/auth/logout") {
        db.prepare("DELETE FROM sessions WHERE token_hash=?").run(
          session.token_hash,
        );
        res.setHeader(
          "Set-Cookie",
          cookieName +
            "=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0" +
            (secure ? "; Secure" : ""),
        );
        return respond(res, 200, { ok: true });
      }
      if (req.method === "POST" && route === "/api/photos") {
        if (photoActive >= 2) fail(429, "too_many_requests");
        photoActive++;
        try {
          const bytes = await body(req, 30 * 1024 * 1024, false);
          const photoHash = hash(bytes);
          const result = await lock("user:" + userId, () =>
            lock(photoHash, async () => {
              const existing = db
                .prepare("SELECT * FROM photos WHERE hash=?")
                .get(photoHash);
              let metadata, thumbnail;
              try {
                metadata =
                  existing ||
                  (await sharp(bytes, {
                    limitInputPixels: 25_000_000,
                  }).metadata());
                const format = existing
                  ? existing.mime === "image/png"
                    ? "png"
                    : "jpeg"
                  : metadata.format;
                if (
                  !["jpeg", "png"].includes(format) ||
                  !metadata.width ||
                  !metadata.height ||
                  metadata.width > 5000 ||
                  metadata.height > 5000
                )
                  fail(400, "invalid_image");
                if (!existing)
                  thumbnail = await sharp(bytes, {
                    limitInputPixels: 25_000_000,
                  })
                    .resize(320, 320, {
                      fit: "inside",
                      withoutEnlargement: true,
                    })
                    .webp({ quality: 78 })
                    .toBuffer();
              } catch (error) {
                if (error instanceof ApiError) throw error;
                fail(400, "invalid_image");
              }
              const owns = db
                .prepare(
                  "SELECT 1 FROM photo_owners WHERE user_id=? AND hash=?",
                )
                .get(userId, photoHash);
              const usage = db
                .prepare(
                  "SELECT COALESCE(SUM(size),0) AS total FROM photos JOIN photo_owners USING(hash) WHERE user_id=?",
                )
                .get(userId).total;
              if (!owns && usage + bytes.length > photoQuota) {
                // Incomplete imports must not strand the account at its quota.
                // Saved books and all retained versions keep their ownership.
                releaseUnusedPhotos(userId);
                fail(413, "storage_quota");
              }
              if (!existing) {
                const disk = await fs.statfs(dataDir);
                if (disk.bavail * disk.bsize < bytes.length + 2 * 1024 ** 3)
                  fail(507, "storage_full");
                const temporary = path.join(
                  photoDir,
                  photoHash + "." + randomUUID() + ".tmp",
                );
                await fs.writeFile(temporary, bytes, { mode: 0o600 });
                await fs.rename(temporary, path.join(photoDir, photoHash));
                await fs.writeFile(
                  path.join(photoDir, photoHash + ".webp"),
                  thumbnail,
                  { mode: 0o600 },
                );
                db.prepare(
                  "INSERT OR IGNORE INTO photos VALUES(?,?,?,?,?,NULL)",
                ).run(
                  photoHash,
                  metadata.width,
                  metadata.height,
                  bytes.length,
                  metadata.format === "png" ? "image/png" : "image/jpeg",
                );
              }
              db.prepare("INSERT OR IGNORE INTO photo_owners VALUES(?,?)").run(
                userId,
                photoHash,
              );
              db.prepare("UPDATE photos SET orphaned_at=NULL WHERE hash=?").run(
                photoHash,
              );
              return {
                src: "/api/photos/" + photoHash,
                width: metadata.width,
                height: metadata.height,
              };
            }),
          );
          return respond(res, 201, result);
        } finally {
          photoActive--;
        }
      }
      const photoMatch = route.match(/^\/api\/photos\/([a-f0-9]{64})$/);
      if (req.method === "GET" && photoMatch) {
        const row = db
          .prepare(
            "SELECT photos.* FROM photos JOIN photo_owners USING(hash) WHERE hash=? AND user_id=?",
          )
          .get(photoMatch[1], userId);
        if (!row) fail(404, "not_found");
        const thumb = url.searchParams.get("thumbnail") === "1";
        const bytes = await fs.readFile(
          path.join(photoDir, photoMatch[1] + (thumb ? ".webp" : "")),
        );
        res.writeHead(200, {
          "Content-Type": thumb ? "image/webp" : row.mime,
          "Content-Length": bytes.length,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        });
        return res.end(bytes);
      }
      if (route === "/api/books" && req.method === "GET") {
        const books = db
          .prepare(
            "SELECT * FROM books WHERE user_id=? ORDER BY updated_at DESC",
          )
          .all(userId)
          .map((row) => ({
            id: row.id,
            title: row.title,
            pageCount: row.page_count,
            revision: row.current_revision,
            cover: row.cover?.startsWith("/api/")
              ? row.cover + "?thumbnail=1"
              : row.cover,
            updatedAt: row.updated_at,
          }));
        const usage = db
          .prepare(
            "SELECT COALESCE(SUM(size),0) AS total FROM photos JOIN photo_owners USING(hash) WHERE user_id=?",
          )
          .get(userId).total;
        return respond(res, 200, {
          books,
          storageUsed: usage,
          storageLimit: photoQuota,
        });
      }
      if (route === "/api/books" && req.method === "POST") {
        const data = await body(req);
        const book = validateCloudBook(data.book, userId);
        const result = transaction(() => {
          if (
            db
              .prepare("SELECT COUNT(*) AS n FROM books WHERE user_id=?")
              .get(userId).n >= 20
          )
            fail(409, "book_limit");
          const id = randomUUID();
          book.id = id;
          db.prepare("INSERT INTO books VALUES(?,?,0,?,?,NULL,?)").run(
            id,
            userId,
            book.title,
            book.pageCount,
            iso(),
          );
          return appendVersion({ id, current_revision: 0 }, book, "auto");
        });
        return respond(res, 201, result);
      }
      const match = route.match(
        /^\/api\/books\/([a-f0-9-]{36})(?:\/(versions)(?:\/(\d+))?)?$/,
      );
      if (!match) fail(404, "not_found");
      const row = ownedBook(match[1], userId);
      if (req.method === "GET" && !match[2])
        return respond(res, 200, currentBook(row));
      if (req.method === "GET" && match[2] && !match[3]) {
        const versions = db
          .prepare(
            "SELECT revision,kind,label,created_at AS createdAt FROM versions WHERE book_id=? ORDER BY revision DESC",
          )
          .all(row.id);
        return respond(res, 200, {
          versions,
          currentRevision: row.current_revision,
        });
      }
      if (req.method === "PUT" && !match[2]) {
        const data = await body(req);
        const book = validateCloudBook(data.book, userId);
        book.id = row.id;
        const kind = data.checkpoint ? "manual" : "auto";
        const label =
          typeof data.label === "string" ? data.label.trim().slice(0, 80) : "";
        const result = transaction(() => {
          const fresh = ownedBook(row.id, userId);
          if (data.baseVersion !== fresh.current_revision)
            fail(409, "version_conflict");
          return appendVersion(fresh, book, kind, label, !!data.checkpoint);
        });
        return respond(res, 200, result);
      }
      if (req.method === "POST" && match[2] && match[3]) {
        const data = await body(req, 4096);
        const result = transaction(() => {
          const fresh = ownedBook(row.id, userId);
          if (data.baseVersion !== fresh.current_revision)
            fail(409, "version_conflict");
          const previous = db
            .prepare("SELECT data FROM versions WHERE book_id=? AND revision=?")
            .get(row.id, Number(match[3]));
          if (!previous) fail(404, "not_found");
          const saved = appendVersion(
            fresh,
            JSON.parse(previous.data),
            "restore",
            match[3],
            true,
          );
          return { ...saved, book: JSON.parse(previous.data) };
        });
        return respond(res, 200, result);
      }
      if (req.method === "DELETE" && !match[2]) {
        transaction(() => {
          db.prepare("DELETE FROM books WHERE id=? AND user_id=?").run(
            row.id,
            userId,
          );
          releaseUnusedPhotos(userId);
        });
        return respond(res, 200, { ok: true });
      }
      fail(405, "invalid_request");
    } catch (error) {
      if (!res.headersSent)
        respond(res, error instanceof ApiError ? error.status : 500, {
          error: error instanceof ApiError ? error.code : "server_error",
        });
      else res.end();
      if (!(error instanceof ApiError))
        console.error("Matiane request failed:", error.code || error.name); // No payloads, credentials or user photographs.
    }
  });
  server.requestTimeout = 120_000;
  server.headersTimeout = 30_000;
  async function dailyBackup() {
    if (backupActive) return;
    backupActive = true;
    const target = path.join(backupDir, iso().slice(0, 10) + ".sqlite");
    const temporary = target + ".tmp";
    try {
      try {
        await fs.access(target);
        return;
      } catch {}
      await backup(db, temporary);
      await fs.chmod(temporary, 0o600);
      await fs.rename(temporary, target);
      for (const name of await fs.readdir(backupDir))
        if (
          /^\d{4}-\d{2}-\d{2}\.sqlite$/.test(name) &&
          name.slice(0, 10) <
            new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10)
        )
          await fs.unlink(path.join(backupDir, name));
    } finally {
      backupActive = false;
    }
  }
  async function maintenance() {
    db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
    db.prepare("DELETE FROM rate_limits WHERE expires<?").run(Date.now());
    const old = new Date(Date.now() - 30 * 86400000).toISOString();
    for (const row of db
      .prepare("SELECT hash FROM photos WHERE orphaned_at<?")
      .all(old))
      await lock(row.hash, async () => {
        if (
          !db
            .prepare(
              "SELECT 1 FROM photos WHERE hash=? AND orphaned_at<? AND NOT EXISTS(SELECT 1 FROM photo_owners WHERE photo_owners.hash=photos.hash)",
            )
            .get(row.hash, old)
        )
          return;
        await fs.rm(path.join(photoDir, row.hash), { force: true });
        await fs.rm(path.join(photoDir, row.hash + ".webp"), { force: true });
        db.prepare("DELETE FROM photos WHERE hash=?").run(row.hash);
      });
    await dailyBackup();
  }
  const timer =
    options.maintenance === false
      ? null
      : setInterval(
          () =>
            maintenance().catch((error) =>
              console.error(
                "Matiane maintenance failed:",
                error.code || error.name,
              ),
            ),
          3600000,
        ).unref();
  return {
    server,
    db,
    dailyBackup,
    dataDir,
    close: async () => {
      if (timer) clearInterval(timer);
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      db.close();
    },
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const app = await createApp();
  app.server.listen(Number(process.env.PORT || 3000), "0.0.0.0", () => {
    console.log("Matiane account server ready");
    app
      .dailyBackup()
      .catch((error) =>
        console.error("Matiane backup failed:", error.code || error.name),
      );
  });
  for (const signal of ["SIGTERM", "SIGINT"])
    process.on(signal, () => app.close().then(() => process.exit(0)));
}
