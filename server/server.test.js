import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import sharp from "sharp";
import { createApp } from "./index.js";
import { newBook } from "../src/model.js";
import { assembleBook } from "../src/ai-assembly.js";
import { AiError } from "./ai-assembly.js";
import { randomUUID } from "node:crypto";
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
  let aiUser = null;
  t.after(async () => {
    await app.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  async function request(
    route,
    { method = "GET", body, user, headers = {}, anonymous = false } = {},
  ) {
    if (route.startsWith("/ai/") && !anonymous) user ??= aiUser;
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
    get aiUser() {
      return aiUser;
    },
    setAiUser(value) {
      aiUser = value;
    },
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
const aiPhoto = async (id = "photo-one") => ({
  id,
  width: 1200,
  height: 800,
  image: "data:image/jpeg;base64," + (await photo()).toString("base64"),
});
const aiResult = (kind, payload) => {
  if (kind === "analysis")
    return {
      content: {
        description: "A calm green scene.",
        scene: "nature",
        group: "outdoors",
        mood: "peaceful",
        importance: 0.8,
        subjectCenter: [0.5, 0.5],
        caption: "Little moments, together.",
      },
      neurons: 5,
    };
  const input = JSON.parse(payload.messages[1].content);
  const groupSize = Math.max(
    1,
    Math.ceil(input.photos.length / input.pageCount),
  );
  return {
    content: {
      pages: Array.from(
        { length: Math.ceil(input.photos.length / groupSize) },
        (_, i) => ({
          photoIds: input.photos
            .slice(i * groupSize, (i + 1) * groupSize)
            .map((p) => p.id),
          layout:
            groupSize >= 3 ? "grid" : groupSize === 2 ? "pair" : "editorial",
          caption: "",
          color: "#FAF8F3",
        }),
      ),
    },
    neurons: 8,
  };
};
async function waitAi(f, job, user) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await f.request("/ai/jobs/" + job.id, {
      user,
      headers: { "X-Matiane-AI-Token": job.token },
    });
    if (result.status !== 200 || result.data.status !== "processing")
      return result;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("AI job did not complete");
}
test("74-photo books retry a truncated analysis, use short model aliases and preserve every original ID", async (t) => {
  let analysisCalls = 0,
    retried = false;
  const f = await setup(t, {
    aiProvider: async ({ kind, payload }) => {
      if (kind === "analysis") {
        analysisCalls++;
        if (analysisCalls === 37) {
          assert.equal(payload.max_completion_tokens, 800);
          return { content: '{"description":"unfinished', neurons: 2 };
        }
        if (payload.max_completion_tokens === 1200) retried = true;
      } else {
        const input = JSON.parse(payload.messages[1].content);
        assert.equal(input.photos.length, 74);
        assert.deepEqual(
          input.photos.map((p) => p.id),
          Array.from({ length: 74 }, (_, i) => "p" + (i + 1)),
        );
        assert.equal(payload.max_completion_tokens, 7800);
        const allowed =
          payload.response_format.json_schema.schema.properties.pages.items
            .properties.photoIds.items.enum;
        assert.equal(allowed.length, 74);
      }
      return aiResult(kind, payload);
    },
  });
  const photos = [];
  for (let i = 0; i < 74; i++) {
    const bytes = await sharp({
      create: {
        width: 96,
        height: 64,
        channels: 3,
        background: { r: i * 3, g: 80, b: 140 },
      },
    })
      .jpeg()
      .toBuffer();
    photos.push({
      id: randomUUID(),
      width: 1200,
      height: 800,
      image: "data:image/jpeg;base64," + bytes.toString("base64"),
    });
  }
  f.setAiUser(await f.register("ai-1@example.invalid"));
  const session = await f.request("/ai/session"),
    job = await f.request("/ai/assemble", {
      method: "POST",
      headers: { "X-Matiane-AI-Guest": session.data.guestToken },
      body: { language: "ru", pageCount: 40, photos },
    });
  const result = await waitAi(f, job.data);
  assert.equal(result.data.status, "completed");
  assert.equal(analysisCalls, 75);
  assert.equal(retried, true);
  assert.deepEqual(
    result.data.result.plan.pages.flatMap((p) => p.photoIds).sort(),
    photos.map((p) => p.id).sort(),
  );
  const book = newBook(40, "Existing cleared book", "ru");
  book.photos = photos.map((p) => ({
    id: p.id,
    width: p.width,
    height: p.height,
    src: "/photos/mountains.jpg",
    name: p.id,
    demo: true,
  }));
  const before = structuredClone(book),
    built = assembleBook(
      book,
      result.data.result.analysis,
      result.data.result.plan,
    );
  assert.deepEqual(book, before);
  assert.deepEqual(
    built.pages
      .slice(1, -1)
      .flatMap((p) => p.photos)
      .filter(Boolean)
      .sort(),
    photos.map((p) => p.id).sort(),
  );
});
test("permanent malformed analysis records its stage and progress and refunds the unanalysed photo allowance", async (t) => {
  let calls = 0;
  const f = await setup(t, {
    adminEmails: "diagnostic@example.invalid",
    aiProvider: async () => {
      calls++;
      return { content: '{"description":', neurons: 2 };
    },
  });
  f.setAiUser(await f.register("ai-2@example.invalid"));
  const admin = await f.register("diagnostic@example.invalid"),
    session = await f.request("/ai/session");
  const job = await f.request("/ai/assemble", {
    method: "POST",
    headers: { "X-Matiane-AI-Guest": session.data.guestToken },
    body: { language: "en", pageCount: 40, photos: [await aiPhoto()] },
  });
  const result = await waitAi(f, job.data);
  assert.equal(calls, 2);
  assert.equal(result.data.status, "failed");
  assert.equal(result.data.error, "ai_invalid_response");
  assert.deepEqual(result.data.errorDetails, {
    phase: "analysing",
    completed: 0,
    total: 1,
  });
  const usage = (await f.request("/admin/ai-usage", { user: admin })).data;
  assert.equal(usage.used, 4);
  assert.equal(usage.reserved, 0);
  assert.equal(usage.recent[0].errorCode, "ai_invalid_response");
  assert.equal(usage.recent[0].phase, "analysing");
  assert.equal(usage.recent[0].completedPhotos, 0);
});
test("final planning connection failure still creates an editable layout from completed visual analysis", async (t) => {
  const f = await setup(t, {
    aiProvider: async ({ kind, payload }) => {
      if (kind === "planning") throw new AiError("ai_provider_connection");
      return aiResult(kind, payload);
    },
  });
  f.setAiUser(await f.register("ai-3@example.invalid"));
  const session = await f.request("/ai/session"),
    photo = await aiPhoto();
  const job = await f.request("/ai/assemble", {
    method: "POST",
    headers: { "X-Matiane-AI-Guest": session.data.guestToken },
    body: { language: "en", pageCount: 40, photos: [photo] },
  });
  const result = await waitAi(f, job.data);
  assert.equal(result.data.status, "completed");
  assert.deepEqual(result.data.result.plan.pages, []);
  const book = newBook();
  book.photos = [
    {
      id: photo.id,
      name: "Original",
      src: "/photos/mountains.jpg",
      width: 1200,
      height: 800,
    },
  ];
  const built = assembleBook(
    book,
    result.data.result.analysis,
    result.data.result.plan,
  );
  assert.deepEqual(
    built.pages
      .slice(1, -1)
      .flatMap((p) => p.photos)
      .filter(Boolean),
    [photo.id],
  );
});
test("AI usage is administrator-only and reports spent, reserved, cached and daily-reset figures", async (t) => {
  let release, entered;
  const held = new Promise((resolve) => {
      release = resolve;
    }),
    began = new Promise((resolve) => {
      entered = resolve;
    });
  const f = await setup(t, {
    adminEmails: "metrics-admin@example.invalid",
    aiProvider: async ({ kind, payload }) => {
      if (kind === "analysis") {
        entered();
        await held;
      }
      return aiResult(kind, payload);
    },
  });
  const admin = await f.register("metrics-admin@example.invalid"),
    user = await f.register("regular@example.invalid");
  assert.equal((await f.request("/admin/ai-usage")).status, 401);
  assert.equal((await f.request("/admin/ai-usage", { user })).status, 403);
  const empty = await f.request("/admin/ai-usage", { user: admin });
  assert.equal(empty.status, 200);
  assert.equal(empty.data.used, 0);
  assert.equal(empty.data.dailyLimit, null);
  assert.equal(empty.data.remaining, null);
  assert.equal(empty.data.freeRemaining, 10000);
  assert.equal(empty.data.cloudflareFreeDaily, 10000);
  assert.ok(empty.data.resetsAt.endsWith("T00:00:00.000Z"));
  assert.equal(empty.headers.get("cache-control"), "no-store");
  f.setAiUser(await f.register("ai-4@example.invalid"));
  const guest = await f.request("/ai/session"),
    headers = { "X-Matiane-AI-Guest": guest.data.guestToken };
  const input = { language: "en", pageCount: 40, photos: [await aiPhoto()] };
  const start = await f.request("/ai/assemble", {
    method: "POST",
    body: input,
    headers,
  });
  await began;
  const pending = (await f.request("/admin/ai-usage", { user: admin })).data;
  assert.equal(pending.used, 0);
  assert.equal(pending.reserved, 525);
  assert.equal(pending.remaining, null);
  assert.equal(pending.freeRemaining, 10000);
  assert.equal(pending.recent[0].status, "processing");
  assert.equal(pending.recent[0].photoCount, 1);
  assert.equal(pending.recent[0].cachedPhotos, 0);
  release();
  assert.equal((await waitAi(f, start.data)).data.status, "completed");
  const done = (await f.request("/admin/ai-usage", { user: admin })).data;
  assert.equal(done.used, 13);
  assert.equal(done.reserved, 0);
  assert.equal(done.remaining, null);
  assert.equal(done.freeRemaining, 9987);
  assert.equal(done.recent[0].neurons, 13);
  assert.equal(done.recent[0].estimated, false);
  assert.equal(done.recent[0].status, "completed");
  assert.ok(!JSON.stringify(done).includes(guest.data.guestToken));
  assert.ok(!JSON.stringify(done).includes(input.photos[0].image));
  const repeat = await f.request("/ai/assemble", {
    method: "POST",
    body: input,
    headers,
  });
  await waitAi(f, repeat.data);
  await f.restart();
  const after = (await f.request("/admin/ai-usage", { user: admin })).data;
  assert.equal(after.used, 21);
  assert.equal(after.reserved, 0);
  assert.equal(after.recent[0].cachedPhotos, 1);
  assert.equal(after.recent[0].neurons, 8);
  const db = new DatabaseSync(path.join(f.dir, "matiane.sqlite"));
  db.prepare("UPDATE ai_budgets SET day=?").run("2000-01-01");
  db.close();
  const nextDay = (await f.request("/admin/ai-usage", { user: admin })).data;
  assert.equal(nextDay.used, 0);
  assert.equal(nextDay.remaining, null);
  assert.equal(nextDay.freeRemaining, 10000);
});
test("default AI allowance does not block assembly at 8000 or reserve against the Cloudflare free ceiling", async (t) => {
  const f = await setup(t, {
    adminEmails: "unlimited@example.invalid",
    aiProvider: async ({ kind, payload }) => aiResult(kind, payload),
  });
  const admin = await f.register("unlimited@example.invalid");
  const { createHash } = await import("node:crypto");
  const db = new DatabaseSync(path.join(f.dir, "matiane.sqlite"));
  db.prepare("INSERT INTO ai_budgets(key,day,neurons) VALUES(?,?,9900)").run(
    createHash("sha256").update("ai-global").digest("hex"),
    new Date().toISOString().slice(0, 10),
  );
  db.close();
  const started = await f.request("/ai/assemble", {
    method: "POST",
    user: admin,
    body: { language: "en", pageCount: 40, photos: [await aiPhoto()] },
  });
  assert.equal(started.status, 202); // reservation exceeds 10000; provider decides
  assert.equal((await waitAi(f, started.data, admin)).data.status, "completed");
  const usage = (await f.request("/admin/ai-usage", { user: admin })).data;
  assert.equal(usage.dailyLimit, null);
  assert.equal(usage.used, 9913);
  assert.equal(usage.freeRemaining, 87);
  assert.equal(usage.reserved, 0);
});
test("usage converts interrupted reservations into estimates and releases active-job capacity on restart", async (t) => {
  const f = await setup(t, { adminEmails: "metrics-admin@example.invalid" });
  const admin = await f.register("metrics-admin@example.invalid");
  const db = new DatabaseSync(path.join(f.dir, "matiane.sqlite"));
  const key = await import("node:crypto").then(({ createHash }) =>
    createHash("sha256").update("ai-global").digest("hex"),
  );
  db.prepare(
    "INSERT INTO ai_budgets(key,day,neurons,reserved) VALUES(?,?,13,525)",
  ).run(key, new Date().toISOString().slice(0, 10));
  db.prepare(
    "INSERT INTO ai_runs(id,started_at,photo_count,page_count,cached_photos,status,reserved) VALUES('interrupted-job',?,1,40,0,'processing',525)",
  ).run(new Date().toISOString());
  db.close();
  await f.restart();
  const usage = (await f.request("/admin/ai-usage", { user: admin })).data;
  assert.equal(usage.used, 538);
  assert.equal(usage.reserved, 0);
  assert.equal(usage.remaining, null);
  assert.equal(usage.freeRemaining, 9462);
  assert.equal(usage.recent[0].status, "interrupted");
  assert.equal(usage.recent[0].neurons, 525);
  assert.equal(usage.recent[0].reportedNeurons, 0);
  assert.equal(usage.recent[0].estimated, true);
});
test("account AI assembly requires authentication, reduces images, returns only analyses and plans, and reuses owner-scoped cache", async (t) => {
  const calls = [];
  const f = await setup(t, {
    aiProvider: async ({ kind, payload }) => {
      calls.push({ kind, payload });
      if (kind === "analysis") {
        const image = payload.messages[1].content[1].image_url.url;
        const metadata = await sharp(
          Buffer.from(image.split(",")[1], "base64"),
        ).metadata();
        assert.ok(metadata.width <= 640 && metadata.height <= 640);
      }
      return aiResult(kind, payload);
    },
  });
  const image = await aiPhoto();
  const input = { language: "ru", pageCount: 40, photos: [image] };
  assert.equal(
    (await f.request("/ai/assemble", { method: "POST", body: input })).status,
    401,
  );
  f.setAiUser(await f.register("ai-7@example.invalid"));
  const session = await f.request("/ai/session");
  assert.equal(session.data.available, true);
  const headers = { "X-Matiane-AI-Guest": session.data.guestToken };
  const first = await f.request("/ai/assemble", {
    method: "POST",
    body: input,
    headers,
  });
  assert.equal(first.status, 202);
  const result = await waitAi(f, first.data);
  assert.equal(result.data.status, "completed");
  assert.equal(result.data.result.analysis[0].id, image.id);
  assert.deepEqual(result.data.result.plan.pages[0].photoIds, [image.id]);
  assert.equal(JSON.stringify(result.data).includes("data:image"), false);
  assert.ok(calls[0].payload.messages[0].content.includes("Russian"));
  const repeated = await f.request("/ai/assemble", {
    method: "POST",
    body: input,
    headers,
  });
  assert.equal((await waitAi(f, repeated.data)).data.status, "completed");
  assert.equal(calls.filter((call) => call.kind === "analysis").length, 1);
  await f.restart();
  const newSession = await f.request("/ai/session");
  const afterRestart = await f.request("/ai/assemble", {
    method: "POST",
    body: input,
    headers: { "X-Matiane-AI-Guest": newSession.data.guestToken },
  });
  assert.equal((await waitAi(f, afterRestart.data)).data.status, "completed");
  assert.equal(calls.filter((call) => call.kind === "analysis").length, 1);
  const user = await f.register("ai-cache-owner@example.invalid");
  const ownedRun = await f.request("/ai/assemble", {
    method: "POST",
    body: input,
    user,
  });
  assert.equal((await waitAi(f, ownedRun.data, user)).data.status, "completed");
  assert.equal(calls.filter((call) => call.kind === "analysis").length, 2);
});
test("AI jobs enforce account ownership, CSRF, origin and private photo references without arbitrary URL fetching", async (t) => {
  let calls = 0;
  const f = await setup(t, {
    aiProvider: async ({ kind, payload }) => {
      calls++;
      return aiResult(kind, payload);
    },
  });
  const owner = await f.register("ai-owner@example.invalid"),
    stranger = await f.register("ai-stranger@example.invalid");
  const uploaded = await f.request("/photos", {
    method: "POST",
    body: await photo(),
    user: owner,
  });
  const input = {
    language: "ka",
    pageCount: 40,
    photos: [{ id: "cloud-photo", ...uploaded.data }],
  };
  assert.equal(
    (
      await f.request("/ai/assemble", {
        method: "POST",
        body: input,
        user: stranger,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await f.request("/ai/assemble", {
        method: "POST",
        body: input,
        user: owner,
        headers: { "X-CSRF-Token": "wrong" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.request("/ai/assemble", {
        method: "POST",
        body: input,
        user: owner,
        headers: { Origin: "https://unrelated.invalid" },
      })
    ).status,
    403,
  );
  const ssrf = structuredClone(input);
  ssrf.photos[0].src = "http://169.254.169.254/latest/meta-data";
  assert.equal(
    (
      await f.request("/ai/assemble", {
        method: "POST",
        body: ssrf,
        user: owner,
      })
    ).status,
    400,
  );
  assert.equal(calls, 0);
  const oversized = structuredClone(input);
  oversized.photos[0].width = 5001;
  assert.equal(
    (
      await f.request("/ai/assemble", {
        method: "POST",
        body: oversized,
        user: owner,
      })
    ).status,
    400,
  );
  assert.equal(calls, 0);
  const job = await f.request("/ai/assemble", {
    method: "POST",
    body: input,
    user: owner,
  });
  assert.equal(job.status, 202);
  const headers = { "X-Matiane-AI-Token": job.data.token };
  assert.equal(
    (await f.request("/ai/jobs/" + job.data.id, { headers })).status,
    401,
  );
  assert.equal(
    (await f.request("/ai/jobs/" + job.data.id, { user: stranger, headers }))
      .status,
    404,
  );
  assert.equal(
    (
      await f.request("/ai/jobs/" + job.data.id, {
        method: "DELETE",
        user: stranger,
        headers,
      })
    ).status,
    404,
  );
  assert.equal((await waitAi(f, job.data, owner)).data.status, "completed");
  assert.equal(
    (await f.request("/books", { user: owner })).data.books.length,
    0,
  );
  assert.equal(
    (
      await f.request("/ai/jobs/" + job.data.id, {
        user: owner,
        headers: { "X-Matiane-AI-Token": "wrong" },
      })
    ).status,
    404,
  );
});
test("owned static WebP originals are safely reduced for AI without changing their bytes", async (t) => {
  const f = await setup(t, {
    aiProvider: async ({ kind, payload }) => aiResult(kind, payload),
  });
  const owner = await f.register("ai-webp-owner@example.invalid");
  const bytes = await sharp({
    create: { width: 1200, height: 800, channels: 3, background: "#8daea7" },
  })
    .webp()
    .toBuffer();
  const hash = "f".repeat(64);
  const target = path.join(f.dir, "photos", hash);
  await fs.writeFile(target, bytes);
  f.app.db
    .prepare("INSERT INTO photos VALUES(?,?,?,?,?,NULL)")
    .run(hash, 1200, 800, bytes.length, "image/webp");
  f.app.db.prepare("INSERT INTO photo_owners VALUES(?,?)").run(owner.id, hash);
  const job = await f.request("/ai/assemble", {
    method: "POST",
    user: owner,
    body: {
      language: "en",
      pageCount: 40,
      photos: [
        {
          id: "webp-original",
          width: 1200,
          height: 800,
          src: "/api/photos/" + hash,
        },
      ],
    },
  });
  assert.equal(job.status, 202);
  assert.equal((await waitAi(f, job.data, owner)).data.status, "completed");
  assert.deepEqual(await fs.readFile(target), bytes);
});
test("cached books can be assembled again at the photo allowance and all 200 photos fit an enlarged book", async (t) => {
  let analysisCalls = 0;
  const f = await setup(t, {
    aiProvider: async ({ kind, payload }) => {
      if (kind === "analysis") analysisCalls++;
      return aiResult(kind, payload);
    },
  });
  const photos = await Promise.all(
    Array.from({ length: 200 }, async (_, i) => ({
      id: "memory-" + i,
      width: 1,
      height: 1,
      image:
        "data:image/png;base64," +
        (
          await sharp({
            create: {
              width: 1,
              height: 1,
              channels: 3,
              background: { r: i, g: 80, b: 120 },
            },
          })
            .png()
            .toBuffer()
        ).toString("base64"),
    })),
  );
  f.setAiUser(await f.register("ai-10@example.invalid"));
  const session = await f.request("/ai/session");
  const headers = { "X-Matiane-AI-Guest": session.data.guestToken };
  const input = { language: "en", pageCount: 40, photos };
  const first = await f.request("/ai/assemble", {
    method: "POST",
    body: input,
    headers,
  });
  assert.equal(first.status, 202);
  const result = await waitAi(f, first.data);
  assert.equal(result.data.status, "completed");
  assert.equal(result.data.result.analysis.length, 200);
  assert.ok(result.data.result.plan.pages.length <= 60);
  assert.deepEqual(
    result.data.result.plan.pages.flatMap((page) => page.photoIds),
    photos.map((photo) => photo.id),
  );
  assert.equal(analysisCalls, 200);
  const budgets = new DatabaseSync(path.join(f.dir, "matiane.sqlite"));
  budgets.prepare("UPDATE ai_budgets SET photos=400").run();
  budgets.close();
  const second = await f.request("/ai/assemble", {
    method: "POST",
    body: input,
    headers,
  });
  assert.equal(second.status, 202);
  assert.equal((await waitAi(f, second.data)).data.status, "completed");
  assert.equal(analysisCalls, 200);
  const newPhoto = await f.request("/ai/assemble", {
    method: "POST",
    body: { ...input, photos: [await aiPhoto("new-memory")] },
    headers,
  });
  assert.equal(newPhoto.status, 429);
  assert.equal(newPhoto.data.error, "ai_daily_limit");
});
test("cancelled AI jobs discard late results, free concurrency and retain persistent daily budget limits", async (t) => {
  let entered;
  const began = new Promise((resolve) => {
    entered = resolve;
  });
  const f = await setup(t, {
    aiMaxActive: 1,
    aiDailyNeurons: 1000,
    aiProvider: async ({ kind, payload, signal }) => {
      if (kind === "analysis") {
        entered();
        await new Promise((resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        });
      }
      return aiResult(kind, payload);
    },
  });
  f.setAiUser(await f.register("ai-11@example.invalid"));
  const session = await f.request("/ai/session");
  const headers = { "X-Matiane-AI-Guest": session.data.guestToken };
  const input = { language: "en", pageCount: 40, photos: [await aiPhoto()] };
  const job = await f.request("/ai/assemble", {
    method: "POST",
    body: input,
    headers,
  });
  await began;
  assert.equal(
    (await f.request("/ai/assemble", { method: "POST", body: input, headers }))
      .data.error,
    "ai_busy",
  );
  const cancelled = await f.request("/ai/jobs/" + job.data.id, {
    method: "DELETE",
    headers: { "X-Matiane-AI-Token": job.data.token },
  });
  assert.equal(cancelled.data.status, "cancelled");
  assert.equal((await waitAi(f, job.data)).data.result, undefined);
  await f.restart();
  const nextSession = await f.request("/ai/session");
  const heavy = {
    ...input,
    photos: Array.from({ length: 21 }, (_, i) => ({
      ...input.photos[0],
      id: "photo-" + i,
    })),
  };
  const limited = await f.request("/ai/assemble", {
    method: "POST",
    body: heavy,
    headers: { "X-Matiane-AI-Guest": nextSession.data.guestToken },
  });
  assert.equal(limited.status, 429);
  assert.equal(limited.data.error, "ai_daily_limit");
});
test("invalid AI provider plans recover from completed analyses and unavailable provider leaves saved books unchanged", async (t) => {
  const f = await setup(t, {
    aiProvider: async ({ kind, payload }) =>
      kind === "analysis"
        ? aiResult(kind, payload)
        : {
            content: {
              pages: [{ photoIds: ["invented-photo"], layout: "full" }],
            },
          },
  });
  f.setAiUser(await f.register("ai-12@example.invalid"));
  const session = await f.request("/ai/session");
  const job = await f.request("/ai/assemble", {
    method: "POST",
    body: { language: "en", pageCount: 40, photos: [await aiPhoto()] },
    headers: { "X-Matiane-AI-Guest": session.data.guestToken },
  });
  const result = await waitAi(f, job.data);
  assert.equal(result.data.status, "completed");
  assert.equal(result.data.result.analysis.length, 1);
  assert.deepEqual(result.data.result.plan.pages, []);
  assert.equal(result.data.result.analysis[0].id, "photo-one");
  const absent = await setup(t, {
    cloudflareAccountId: "",
    cloudflareToken: "",
  });
  absent.setAiUser(await absent.register("absent@example.invalid"));
  const absentSession = await absent.request("/ai/session");
  assert.equal(absentSession.data.available, false);
  const unavailable = await absent.request("/ai/assemble", {
    method: "POST",
    body: { language: "en", pageCount: 40, photos: [await aiPhoto()] },
    headers: { "X-Matiane-AI-Guest": absentSession.data.guestToken },
  });
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.data.error, "ai_not_configured");
});
test("local book imports survive retries and restarts without duplicates or overwriting later edits", async (t) => {
  const f = await setup(t, { adminEmails: "admin-import@example.invalid" });
  const owner = await f.register("import-owner@example.invalid"),
    other = await f.register("import-other@example.invalid"),
    admin = await f.register("admin-import@example.invalid");
  const book = newBook(40, "An existing local book");
  book.pages[2].caption = "ჩვენი ოჯახი · Family · Семья";
  const create = (user = owner, value = book, requestKey = book.id) =>
    f.request("/books", {
      method: "POST",
      user,
      body: { book: value, requestKey },
    });
  const first = await create();
  assert.equal(first.status, 201);
  await f.restart();
  const retry = await create();
  assert.equal(retry.status, 201);
  assert.equal(retry.data.id, first.data.id);
  assert.equal(retry.data.revision, 1);
  assert.equal(
    (await f.request("/books", { user: owner })).data.books.length,
    1,
  );
  assert.equal(
    (await f.request("/admin/books", { user: admin })).data.total,
    1,
  );
  const independent = await create(other);
  assert.equal(independent.status, 201);
  assert.notEqual(independent.data.id, first.data.id);
  const changed = structuredClone(book);
  changed.pages[2].caption = "An edit made after importing";
  assert.equal(
    (
      await f.request("/books/" + first.data.id, {
        method: "PUT",
        user: owner,
        body: { book: changed, baseVersion: 1 },
      })
    ).status,
    200,
  );
  assert.equal((await create()).status, 409);
  assert.equal((await create()).data.error, "version_conflict");
  assert.deepEqual((await create()).data.bookInfo, {
    id: first.data.id,
    revision: 2,
  });
  assert.equal(
    (await f.request("/books/" + first.data.id, { user: owner })).data.book
      .pages[2].caption,
    changed.pages[2].caption,
  );
  assert.equal((await create(owner, changed)).data.revision, 2);
  assert.equal((await create(owner, book, "")).status, 400);
  assert.equal(
    (
      await f.request("/books/" + first.data.id, {
        method: "DELETE",
        user: owner,
      })
    ).status,
    200,
  );
  const recreated = await create();
  assert.equal(recreated.status, 201);
  assert.notEqual(recreated.data.id, first.data.id);
});
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
test("screen previews are smaller, persist across restart, revalidate ownership and leave print originals intact", async (t) => {
  const f = await setup(t),
    owner = await f.register("preview-owner@example.invalid"),
    other = await f.register("preview-other@example.invalid");
  const original = await sharp({
    create: { width: 3200, height: 2400, channels: 3, background: "#7a937f" },
  })
    .jpeg({ quality: 98 })
    .toBuffer();
  const uploaded = await f.request("/photos", {
    method: "POST",
    body: original,
    user: owner,
  });
  assert.equal(uploaded.status, 201);
  const route = uploaded.data.src.slice(4);
  const [first, simultaneous] = await Promise.all([
    f.request(route + "?preview=1", { user: owner }),
    f.request(route + "?preview=1", { user: owner }),
  ]);
  assert.equal(first.status, 200);
  assert.deepEqual(first.data, simultaneous.data);
  const metadata = await sharp(first.data).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 1600);
  assert.equal(metadata.height, 1200);
  assert.ok(first.data.length < original.length / 2);
  assert.equal(first.headers.get("cache-control"), "private, no-cache");
  const headers = { "If-None-Match": first.headers.get("etag") };
  assert.equal(
    (await f.request(route + "?preview=1", { user: owner, headers })).status,
    304,
  );
  assert.equal(
    (await f.request(route + "?preview=1", { user: other, headers })).status,
    404,
  );
  assert.equal(
    (await f.request(route + "?preview=1", { headers })).status,
    401,
  );
  const onDisk = path.join(
    f.dir,
    "photos",
    route.split("/").pop() + ".screen-v1.webp",
  );
  const before = (await fs.stat(onDisk)).mtimeMs;
  await f.restart();
  const cached = await f.request(route + "?preview=1", { user: owner });
  assert.deepEqual(cached.data, first.data);
  assert.equal((await fs.stat(onDisk)).mtimeMs, before);
  const print = await f.request(route, { user: owner });
  assert.deepEqual(print.data, original);
  assert.notEqual(print.headers.get("etag"), first.headers.get("etag"));
  const thumb = await f.request(route + "?thumbnail=1", { user: owner });
  assert.equal(
    (
      await f.request(route + "?thumbnail=1", {
        user: owner,
        headers: { "If-None-Match": thumb.headers.get("etag") },
      })
    ).status,
    304,
  );
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
