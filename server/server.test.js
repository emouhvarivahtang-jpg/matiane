import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import sharp from "sharp";
import { createApp } from "./index.js";
import { newBook } from "../src/model.js";
const origin = "http://matiane.test";
async function setup(t, extra = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "matiane-test-"));
  let app = await createApp({
    dataDir: dir,
    publicOrigin: origin,
    secure: false,
    maintenance: false,
    ...extra,
  });
  async function start() {
    await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
    return "http://127.0.0.1:" + app.server.address().port;
  }
  let base = await start();
  t.after(async () => {
    await app.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  async function request(
    route,
    { method = "GET", body, user, headers = {} } = {},
  ) {
    const h = { Origin: origin, "X-Matiane-Client": "studio" };
    if (user) {
      h.Cookie = user.cookie;
      h["X-CSRF-Token"] = user.csrf;
    }
    Object.assign(h, headers);
    if (body && !Buffer.isBuffer(body)) h["Content-Type"] = "application/json";
    const res = await fetch(base + "/api" + route, {
      method,
      headers: h,
      body: Buffer.isBuffer(body)
        ? body
        : body
          ? JSON.stringify(body)
          : undefined,
    });
    const data = res.headers.get("content-type")?.includes("json")
      ? await res.json()
      : Buffer.from(await res.arrayBuffer());
    return {
      status: res.status,
      data,
      cookie: res.headers.get("set-cookie")?.split(";")[0],
      headers: res.headers,
    };
  }
  async function register(email) {
    const r = await request("/auth/register", {
      method: "POST",
      body: { email, password: "correct horse battery" },
    });
    assert.equal(r.status, 201);
    return {
      id: r.data.user.id,
      cookie: r.cookie,
      csrf: r.data.csrfToken,
      recovery: r.data.recoveryCode,
      email,
    };
  }
  return {
    get app() {
      return app;
    },
    dir,
    request,
    register,
    restart: async () => {
      await app.close();
      app = await createApp({
        dataDir: dir,
        publicOrigin: origin,
        secure: false,
        maintenance: false,
        ...extra,
      });
      base = await start();
    },
  };
}
const photo = () =>
  sharp({
    create: { width: 1200, height: 800, channels: 3, background: "#568b75" },
  })
    .jpeg()
    .toBuffer();
test("administrator can review all books and copy them, while ordinary users cannot access other accounts", async (t) => {
  const f = await setup(t, { adminEmails: "admin@example.invalid" });
  const owner = await f.register("author@example.invalid"),
    admin = await f.register("admin@example.invalid"),
    stranger = await f.register("stranger@example.invalid");
  const image = await f.request("/photos", {
    method: "POST",
    body: await photo(),
    user: owner,
  });
  const book = newBook(40, "Family album");
  book.photos = [{ id: "private-photo", name: "Family.jpg", ...image.data }];
  book.pages[0].photos = ["private-photo"];
  const created = await f.request("/books", {
    method: "POST",
    body: { book },
    user: owner,
  });
  assert.equal(created.status, 201);
  const id = created.data.id;
  assert.equal((await f.request("/admin/books")).status, 401);
  assert.equal(
    (await f.request("/admin/books", { user: stranger })).status,
    403,
  );
  assert.equal(
    (await f.request("/admin/books/" + id, { user: stranger })).status,
    403,
  );
  assert.equal((await f.request("/books/" + id, { user: admin })).status, 404);
  assert.equal(
    (await f.request("/session", { user: admin })).data.user.isAdmin,
    true,
  );
  assert.equal(
    (await f.request("/session", { user: stranger })).data.user.isAdmin,
    false,
  );
  const list = await f.request("/admin/books", { user: admin });
  assert.equal(list.data.total, 1);
  assert.equal(list.data.books[0].ownerEmail, owner.email);
  assert.equal(
    (await f.request("/admin/books/" + id, { user: admin })).data.book.title,
    book.title,
  );
  assert.equal(
    (await f.request(image.data.src.slice(4), { user: admin })).status,
    200,
  );
  assert.equal(
    (await f.request(image.data.src.slice(4), { user: stranger })).status,
    404,
  );
  assert.equal(
    (await f.request("/admin/books/" + id, { user: admin, method: "DELETE" }))
      .status,
    405,
  );
  assert.equal(
    (
      await f.request("/admin/books/" + id + "/copy", {
        user: stranger,
        method: "POST",
        body: {},
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.request("/admin/books/" + id + "/copy", {
        user: admin,
        method: "POST",
        body: {},
        headers: { "X-CSRF-Token": "incorrect" },
      })
    ).status,
    403,
  );
  const copied = await f.request("/admin/books/" + id + "/copy", {
    user: admin,
    method: "POST",
    body: {},
  });
  assert.equal(copied.status, 201);
  assert.notEqual(copied.data.id, id);
  assert.equal(
    (await f.request("/books/" + copied.data.id, { user: admin })).status,
    200,
  );
  assert.equal(
    (await f.request("/books/" + copied.data.id, { user: owner })).status,
    404,
  );
  assert.equal(
    (await f.request("/books/" + id, { user: owner })).data.revision,
    1,
  );
  await f.restart();
  assert.equal(
    (await f.request("/session", { user: admin })).data.user.isAdmin,
    true,
  );
  assert.equal(
    (await f.request("/admin/books", { user: admin })).data.total,
    2,
  );
});
test("account authentication, CSRF, recovery and persistent sessions", async (t) => {
  const f = await setup(t),
    u = await f.register("user@example.invalid");
  const stored = f.app.db.prepare("SELECT * FROM users WHERE id=?").get(u.id);
  assert.notEqual(stored.password_hash, "correct horse battery");
  assert.equal(stored.password_hash.length, 128);
  assert.equal(
    (
      await f.request("/auth/login", {
        method: "POST",
        body: { email: u.email, password: "wrong password 000" },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await f.request("/books", {
        method: "POST",
        body: { book: newBook() },
        user: u,
        headers: { Origin: "https://evil.example" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.request("/books", {
        method: "POST",
        body: { book: newBook() },
        user: u,
        headers: { "X-CSRF-Token": "bad" },
      })
    ).status,
    403,
  );
  await f.restart();
  assert.equal((await f.request("/session", { user: u })).data.user.id, u.id);
  const recovered = await f.request("/auth/recover", {
    method: "POST",
    body: {
      email: u.email,
      password: "new correct password",
      code: u.recovery,
    },
  });
  assert.equal(recovered.status, 200);
  assert.ok(recovered.data.recoveryCode);
  assert.equal((await f.request("/session", { user: u })).data.user, null);
  assert.equal(
    (
      await f.request("/auth/recover", {
        method: "POST",
        body: {
          email: u.email,
          password: "new correct password",
          code: u.recovery,
        },
      })
    ).status,
    401,
  );
  const login = await f.request("/auth/login", {
    method: "POST",
    body: { email: u.email, password: "new correct password" },
  });
  assert.equal(login.status, 200);
  const logged = { cookie: login.cookie, csrf: login.data.csrfToken };
  assert.equal(
    (await f.request("/auth/logout", { method: "POST", user: logged })).status,
    200,
  );
  assert.equal((await f.request("/books", { user: logged })).status, 401);
});
test("private images, immutable versions, concurrent edits and complete deletion", async (t) => {
  const f = await setup(t),
    a = await f.register("alice@example.invalid"),
    b = await f.register("bob@example.invalid");
  const uploaded = await f.request("/photos", {
    method: "POST",
    body: await photo(),
    user: a,
  });
  assert.equal(uploaded.status, 201);
  assert.equal(uploaded.data.width, 1200);
  assert.equal(
    (await f.request(uploaded.data.src.slice(4), { user: b })).status,
    404,
  );
  assert.equal((await f.request(uploaded.data.src.slice(4))).status, 401);
  const thumb = await f.request(uploaded.data.src.slice(4) + "?thumbnail=1", {
    user: a,
  });
  assert.equal(thumb.status, 200);
  const meta = await sharp(thumb.data).metadata();
  assert.equal(meta.width, 320);
  assert.equal(meta.format, "webp");
  assert.equal(
    (
      await f.request("/photos", {
        method: "POST",
        body: Buffer.from("not an image"),
        user: a,
      })
    ).status,
    400,
  );
  const book = newBook(40, "Original", "ru");
  book.photos = [{ ...uploaded.data, id: "photo-one", name: "private.jpg" }];
  book.pages[0].photos = ["photo-one"];
  const first = await f.request("/books", {
    method: "POST",
    body: { book },
    user: a,
  });
  assert.equal(first.status, 201);
  const id = first.data.id;
  assert.equal((await f.request("/books/" + id, { user: b })).status, 404);
  assert.equal((await f.request("/books", { user: b })).data.books.length, 0);
  const original = await f.request("/books/" + id, { user: a });
  book.title = "Edited";
  book.pages[0].caption = "Москва თბილისი";
  const saved = await f.request("/books/" + id, {
    method: "PUT",
    body: { book, baseVersion: 1, checkpoint: true, label: "Checkpoint" },
    user: a,
  });
  assert.equal(saved.data.revision, 2);
  assert.equal(
    (
      await f.request("/books/" + id, {
        method: "PUT",
        body: { book, baseVersion: 1 },
        user: a,
      })
    ).status,
    409,
  );
  assert.equal(
    (await f.request("/books/" + id + "/versions", { user: a })).data.versions
      .length,
    2,
  );
  const restored = await f.request("/books/" + id + "/versions/1", {
    method: "POST",
    body: { baseVersion: 2 },
    user: a,
  });
  assert.equal(restored.data.revision, 3);
  assert.equal(restored.data.book.title, "Original");
  assert.equal(
    (await f.request("/books/" + id + "/versions", { user: a })).data.versions
      .length,
    3,
  );
  assert.equal(original.data.book.title, "Original");
  await f.restart();
  assert.equal(
    (await f.request("/books/" + id, { user: a })).data.book.title,
    "Original",
  );
  await f.app.dailyBackup();
  const names = await fs.readdir(path.join(f.dir, "backups"));
  const backupDb = new DatabaseSync(path.join(f.dir, "backups", names[0]), {
    readOnly: true,
  });
  assert.equal(
    backupDb.prepare("PRAGMA integrity_check").get().integrity_check,
    "ok",
  );
  assert.equal(backupDb.prepare("SELECT COUNT(*) AS n FROM books").get().n, 1);
  backupDb.close();
  assert.equal(
    (await f.request("/books/" + id, { method: "DELETE", user: a })).status,
    200,
  );
  assert.equal((await f.request("/books/" + id, { user: a })).status, 404);
  assert.equal(
    f.app.db.prepare("SELECT COUNT(*) AS n FROM versions").get().n,
    0,
  );
  assert.equal((await f.request("/books", { user: a })).data.storageUsed, 0);
});
test("autosave retention keeps manual snapshots and rejects forged references", async (t) => {
  const f = await setup(t),
    u = await f.register("versions@example.invalid"),
    book = newBook(),
    created = await f.request("/books", {
      method: "POST",
      body: { book },
      user: u,
    });
  const id = created.data.id;
  let revision = 1;
  for (let i = 0; i < 34; i++) {
    book.title = "Edit " + i;
    const saved = await f.request("/books/" + id, {
      method: "PUT",
      body: { book, baseVersion: revision, checkpoint: i === 0, label: "Keep" },
      user: u,
    });
    assert.equal(saved.status, 200);
    revision = saved.data.revision;
  }
  const versions = (await f.request("/books/" + id + "/versions", { user: u }))
    .data.versions;
  assert.equal(versions.filter((v) => v.kind === "auto").length, 30);
  assert.equal(versions.find((v) => v.kind === "manual").label, "Keep");
  book.photos = [
    {
      id: "forged",
      name: "x",
      width: 100,
      height: 100,
      src: "/api/photos/" + "0".repeat(64),
    },
  ];
  assert.equal(
    (
      await f.request("/books/" + id, {
        method: "PUT",
        body: { book, baseVersion: revision },
        user: u,
      })
    ).status,
    400,
  );
});
test("storage quota and HTTPS policy are enforced", async (t) => {
  const f = await setup(t, { photoQuota: 100 }),
    u = await f.register("quota@example.invalid");
  assert.equal(
    (
      await f.request("/photos", {
        method: "POST",
        body: await photo(),
        user: u,
      })
    ).status,
    413,
  );
  assert.equal((await f.request("/books", { user: u })).data.storageUsed, 0);
  const secure = await setup(t, { secure: true, trustProxy: true });
  assert.equal(
    (
      await secure.request("/auth/register", {
        method: "POST",
        body: {
          email: "secure@example.invalid",
          password: "long test password",
        },
      })
    ).data.error,
    "https_required",
  );
  const r = await secure.request("/auth/register", {
    method: "POST",
    headers: { "X-Forwarded-Proto": "https" },
    body: { email: "secure@example.invalid", password: "long test password" },
  });
  assert.equal(r.status, 201);
  assert.match(r.headers.get("set-cookie"), /Secure/);
  assert.match(r.cookie, /^__Host-matiane-session=/);
});

test("failed imports release incomplete uploads while keeping saved book photos", async (t) => {
  const a = await photo(),
    b = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: "#866d59" },
    })
      .jpeg()
      .toBuffer(),
    c = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: "#9c2345" },
    })
      .jpeg()
      .toBuffer();
  const f = await setup(t, { photoQuota: a.length + b.length }),
    u = await f.register("incomplete@example.invalid");
  const first = await f.request("/photos", {
    method: "POST",
    body: a,
    user: u,
  });
  const book = newBook();
  book.photos = [{ id: "kept", name: "saved.jpg", ...first.data }];
  book.pages[0].photos = ["kept"];
  assert.equal(
    (await f.request("/books", { method: "POST", body: { book }, user: u }))
      .status,
    201,
  );
  assert.equal(
    (await f.request("/photos", { method: "POST", body: b, user: u })).status,
    201,
  );
  assert.equal(
    (await f.request("/photos", { method: "POST", body: c, user: u })).status,
    413,
  );
  assert.equal(
    (await f.request("/books", { user: u })).data.storageUsed,
    a.length,
  );
  assert.equal(
    (await f.request(first.data.src.slice(4), { user: u })).status,
    200,
  );
  assert.equal(
    (await f.request("/photos", { method: "POST", body: b, user: u })).status,
    201,
  );
});
