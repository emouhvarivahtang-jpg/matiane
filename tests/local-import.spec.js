import { test, expect } from "./fixtures";
import { newBook } from "../src/model.js";
import fs from "node:fs/promises";

const password = "Synthetic migration password";
async function seed(page, books, legacy = null) {
  await page.evaluate(
    async ({ books, legacy }) => {
      const db = await new Promise((resolve, reject) => {
        const r = indexedDB.open("matiane", 2);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction(["books", "photos", "projects"], "readwrite");
        for (const book of books) {
          for (const photo of book.photos)
            tx.objectStore("photos").put(photo, "guest:" + photo.id);
          tx.objectStore("books").put(
            {
              id: book.id,
              owner: "guest",
              cloud: null,
              updatedAt: new Date().toISOString(),
              book: {
                ...book,
                photos: book.photos.map((p) => ({
                  ...p,
                  src: "local:" + p.id,
                })),
              },
            },
            "guest:" + book.id,
          );
        }
        if (legacy) tx.objectStore("projects").put(legacy, "current");
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { books, legacy },
  );
}
async function register(page) {
  const email = `import-${Date.now()}-${Math.random().toString(16).slice(2)}@example.invalid`;
  if (!(await page.getByRole("dialog").isVisible()))
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password (at least 10 characters)").fill(password);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.locator(".recovery-code")).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  return email;
}
async function remoteBooks(page) {
  return page.evaluate(
    async () => (await (await fetch("/api/books")).json()).books,
  );
}
async function cleanup(page) {
  await page
    .evaluate(async () => {
      const session = await (await fetch("/api/session")).json();
      const books = await (await fetch("/api/books")).json();
      for (const book of books.books || [])
        await fetch("/api/books/" + book.id, {
          method: "DELETE",
          headers: {
            "X-Matiane-Client": "studio",
            "X-CSRF-Token": session.csrfToken,
          },
        });
    })
    .catch(() => {});
}
test("registration imports all closed guest books with photos, layouts and covers, without reviving the legacy backup", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "New book", exact: true }),
  ).toBeVisible();
  const first = newBook(40, "Wife's assembled album"),
    second = newBook(60, "Another local story");
  const src =
    "data:image/jpeg;base64," +
    (await fs.readFile("public/photos/mountains.jpg")).toString("base64");
  first.photos = [
    {
      id: "original-family-photo",
      src,
      name: "Family.jpg",
      width: 640,
      height: 480,
    },
  ];
  first.pages[0].photos = [first.photos[0].id];
  first.pages[2].photos = [first.photos[0].id];
  first.pages[2].crops = [{ x: 28, y: 72, zoom: 1.5 }];
  first.pages[2].caption = "ჩვენი ამბავი · Наша история";
  first.pages[2].font = "cormorantgaramond";
  first.pages[2].georgianFont = "bpg-chveulebrivi";
  first.cover.spine.caption = "Family memories";
  first.cover.spineWidth = 12;
  second.pages[8].caption = "A second saved draft";
  await seed(page, [first, second], {
    version: 1,
    title: first.title,
    language: "en",
    photos: [],
    pages: [],
  });
  await page.reload();
  await expect(page.locator(".local-books .book-card")).toHaveCount(2);
  const email = await register(page);
  try {
    await expect(page.locator(".cloud-books .book-card")).toHaveCount(2, {
      timeout: 25000,
    });
    await expect(page.locator(".local-books .book-card")).toHaveCount(0);
    const list = await remoteBooks(page);
    const target = list.find((b) => b.title === first.title);
    const saved = await page.evaluate(
      async (id) => (await (await fetch("/api/books/" + id)).json()).book,
      target.id,
    );
    expect(saved.pages).toEqual(first.pages);
    expect(saved.cover).toEqual(first.cover);
    expect(saved.format).toBe(first.format);
    expect(saved.photos[0].name).toBe("Family.jpg");
    expect(saved.photos[0].src).toMatch(/^\/api\/photos\//);
    expect(
      await page.evaluate(
        async (url) => (await fetch(url)).ok,
        saved.photos[0].src,
      ),
    ).toBe(true);
    await page.reload();
    await expect(page.locator(".cloud-books .book-card")).toHaveCount(2);
    await expect(page.locator(".local-books .book-card")).toHaveCount(0);
    await page.getByRole("button", { name: email, exact: true }).click();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password (at least 10 characters)").fill(password);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Sign in", exact: true })
      .click();
    await expect(page.locator(".cloud-books .book-card")).toHaveCount(2);
    await expect(page.locator(".local-books .book-card")).toHaveCount(0);
    // If another device has since changed this imported book, keep that edit
    // and let the retained guest draft open the conflict recovery controls.
    await page.evaluate(async (id) => {
      const session = await (await fetch("/api/session")).json();
      const saved = await (await fetch("/api/books/" + id)).json();
      saved.book.pages[4].caption = "Latest edit from another device";
      const response = await fetch("/api/books/" + id, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Matiane-Client": "studio",
          "X-CSRF-Token": session.csrfToken,
        },
        body: JSON.stringify({ book: saved.book, baseVersion: saved.revision }),
      });
      if (!response.ok) throw new Error("Could not prepare a conflicting edit");
    }, target.id);
    await seed(page, [first]);
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Retry upload", exact: true }),
    ).toBeVisible();
    await page.locator(".local-books .book-card-open").click();
    await expect(page.locator(".conflict-banner")).toBeVisible({
      timeout: 12000,
    });
    await page
      .getByRole("button", { name: "Open latest version", exact: true })
      .click();
    await page.getByRole("button", { name: "Page 4", exact: true }).click();
    await expect(page.locator(".active-leaf .page-caption")).toHaveText(
      "Latest edit from another device",
    );
  } finally {
    await cleanup(page);
  }
});
test("a lost upload response keeps the local original, and retry creates exactly one server book", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "New book", exact: true }),
  ).toBeVisible();
  const book = newBook(40, "Resume after connection failure");
  book.pages[4].caption = "Keep my work after a disconnect";
  await seed(page, [book]);
  await page.reload();
  await expect(page.locator(".local-books .book-card")).toHaveCount(1);
  let lost = false;
  const loseResponse = async (route) => {
    if (route.request().method() === "POST" && !lost) {
      lost = true;
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      await route.abort("connectionreset");
    } else await route.fallback();
  };
  await page.route("**/api/books", loseResponse);
  await register(page);
  try {
    await expect(
      page.getByRole("button", { name: "Retry upload", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".local-books .book-card")).toHaveCount(1);
    expect((await remoteBooks(page)).length).toBe(1);
    await page.unroute("**/api/books", loseResponse);
    await page
      .getByRole("button", { name: "Retry upload", exact: true })
      .click();
    await expect(page.locator(".local-books .book-card")).toHaveCount(0);
    await expect(page.locator(".cloud-books .book-card")).toHaveCount(1);
    const books = await remoteBooks(page);
    expect(books).toHaveLength(1);
    expect(books[0].revision).toBe(1);
    const saved = await page.evaluate(
      async (id) => (await (await fetch("/api/books/" + id)).json()).book,
      books[0].id,
    );
    expect(saved.pages[4].caption).toBe(book.pages[4].caption);
    // New guest drafts discovered on a later visit are imported into an existing session too.
    await seed(page, [newBook(60, "Draft added after signing in")]);
    await page.reload();
    await expect(page.locator(".cloud-books .book-card")).toHaveCount(2, {
      timeout: 20000,
    });
    await expect(page.locator(".local-books .book-card")).toHaveCount(0);
  } finally {
    await cleanup(page);
  }
});
test("the old IP studio transfers every local book before registration and retains the originals", async ({
  page,
  request,
}) => {
  const old = "http://57.129.177.67",
    secure = "https://matiane.57.129.177.67.sslip.io";
  if (!process.env.MATIANE_TEST_URL) {
    for (const origin of [old, secure])
      await page.context().route(origin + "/**", async (route) => {
        const source = route.request(),
          url = new URL(source.url());
        const headers = await source.allHeaders();
        delete headers.host;
        if (headers.origin) headers.origin = "http://127.0.0.1:5173";
        const response = await request.fetch(
          "http://127.0.0.1:5173" + url.pathname + url.search,
          {
            method: source.method(),
            headers,
            data: source.postDataBuffer() || undefined,
          },
        );
        await route.fulfill({ response });
      });
  }
  await page.goto(old);
  await expect(
    page.getByRole("button", { name: "New book", exact: true }),
  ).toBeVisible();
  const first = newBook(40, "Older IP draft"),
    second = newBook(60, "Second older IP draft");
  first.pages[3].caption = "No rebuilding needed";
  await seed(page, [first, second]);
  await page.reload();
  await expect(page.locator(".local-books .book-card")).toHaveCount(2);
  const popup = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Open secure studio", exact: true })
    .first()
    .click();
  const studio = await popup;
  await expect(studio.locator(".local-books .book-card")).toHaveCount(2);
  await expect(studio.getByRole("dialog")).toBeVisible();
  await register(studio);
  try {
    await expect(studio.locator(".cloud-books .book-card")).toHaveCount(2, {
      timeout: 25000,
    });
    await expect(studio.locator(".local-books .book-card")).toHaveCount(0);
    const books = await remoteBooks(studio);
    expect(books.map((b) => b.title).sort()).toEqual(
      [first.title, second.title].sort(),
    );
    await expect(page.locator(".local-books .book-card")).toHaveCount(2);
    await page.reload();
    await expect(page.locator(".local-books .book-card")).toHaveCount(2);
  } finally {
    await cleanup(studio);
  }
});
