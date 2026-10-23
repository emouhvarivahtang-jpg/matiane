import { test, expect, cloudSnapshot } from "./fixtures";
import { newBook } from "../src/model.js";
import fs from "node:fs/promises";

const AI_BUTTON = "Build with AI! (test)";

async function seedDraft(page, count = 6) {
  await page.goto("/studio");
  await expect(
    page.getByRole("button", { name: "New book", exact: true }),
  ).toBeVisible();
  const book = newBook(40, "Our little journey");
  const image =
    "data:image/jpeg;base64," +
    (await fs.readFile("public/photos/mountains.jpg")).toString("base64");
  book.photos = Array.from({ length: count }, (_, i) => ({
    id: crypto.randomUUID(),
    name: `Memory ${i + 1}.jpg`,
    src: image,
    width: 640,
    height: 480,
  }));
  book.pages[0].photos = [book.photos[0].id];
  book.pages[0].caption = "Keep our front cover";
  book.pages[0].crops = [{ x: 72, y: 38, zoom: 1.7 }];
  book.pages.at(-1).caption = "Keep our back cover";
  book.cover.spine.caption = "Keep our spine";
  book.pages[1].photos = [book.photos[4].id];
  book.pages[1].caption = "My handwritten memory";
  book.pages[1].italic = true;
  await page.evaluate(async (book) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("matiane", 2);
      request.onupgradeneeded = () => {
        for (const store of ["projects", "books", "photos"])
          if (!request.result.objectStoreNames.contains(store))
            request.result.createObjectStore(store);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction(["books", "photos"], "readwrite");
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
            photos: book.photos.map((photo) => ({
              ...photo,
              src: "local:" + photo.id,
            })),
          },
        },
        "guest:" + book.id,
      );
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, book);
  await page.reload();
  await page.locator(".cloud-books .book-card-open").click();
  await expect(
    page.getByRole("button", { name: AI_BUTTON, exact: true }),
  ).toBeEnabled();
  return book;
}

const project = cloudSnapshot;

function result(photos) {
  return {
    analysis: photos.map((photo, i) => ({
      id: photo.id,
      description: "A mountain view in soft light",
      scene: "landscape",
      group: i < 3 ? "mountains" : "journey",
      mood: "warm",
      importance: 0.8,
      subjectCenter: [0.5, 0.5],
      caption: "A little closer to the sky.",
    })),
    plan: {
      pages: [
        {
          photoIds: [photos[0].id],
          layout: "gallery",
          caption: "A little closer to the sky.",
          color: "#E5E9DF",
        },
        {
          photoIds: [photos[1].id, photos[2].id],
          layout: "pair",
          caption: "Small moments, lovely memories.",
          color: "#E5E9DF",
        },
        {
          photoIds: [photos[3].id],
          layout: "full",
          caption: "",
          color: "#FAF8F3",
        },
        {
          photoIds: [photos[4].id, photos[5].id],
          layout: "diptych",
          caption: "The places we carry with us.",
          color: "#FAF8F3",
        },
      ],
      coverPhotoId: photos[1].id,
    },
  };
}

async function mockAI(page, { mode = "success" } = {}) {
  const calls = [],
    state = { canceled: false, mode };
  await page.route("**/api/ai/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    calls.push({
      method: request.method(),
      path,
      headers: await request.allHeaders(),
      body: request.postDataJSON(),
    });
    if (path === "/api/ai/session")
      return route.fulfill({
        json: {
          guestToken: "synthetic-guest-capability",
          available: true,
          maxPhotos: 200,
          maxImageSide: 640,
        },
      });
    if (path === "/api/ai/assemble") {
      state.input = request.postDataJSON();
      if (state.mode === "delayed-ack")
        await new Promise((resolve) => {
          state.releaseAck = resolve;
        });
      return route.fulfill({
        status: 202,
        json: {
          id: "synthetic-job",
          token: "synthetic-job-capability",
          status: "queued",
        },
      });
    }
    if (
      path === "/api/ai/jobs/synthetic-job" &&
      request.method() === "DELETE"
    ) {
      state.canceled = true;
      return route.fulfill({ json: { status: "cancelled" } });
    }
    if (path === "/api/ai/jobs/synthetic-job") {
      if (state.mode === "invalid-analysis")
        return route.fulfill({
          json: {
            status: "failed",
            phase: "analysing",
            completed: 37,
            total: state.input.photos.length,
            error: "ai_invalid_response",
            errorDetails: {
              phase: "analysing",
              completed: 37,
              total: state.input.photos.length,
            },
          },
        });
      if (state.mode === "failure")
        return route.fulfill({
          json: {
            status: "failed",
            error: "ai_provider_unavailable",
            completed: 0,
            total: state.input.photos.length,
          },
        });
      if (state.mode === "pending")
        return route.fulfill({
          json: {
            status: state.canceled ? "cancelled" : "running",
            phase: "analysing",
            completed: 1,
            total: state.input.photos.length,
          },
        });
      return route.fulfill({
        json: {
          status: "completed",
          phase: "completed",
          completed: state.input.photos.length,
          total: state.input.photos.length,
          result: result(state.input.photos),
        },
      });
    }
    return route.fulfill({ status: 404, json: { error: "not_found" } });
  });
  return { calls, state };
}

test("account AI assembly uses every image once, keeps covers, makes editable pages and an recoverable server checkpoint", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const mock = await mockAI(page);
  await seedDraft(page);
  const before = await project(page);
  await page.getByRole("button", { name: AI_BUTTON, exact: true }).click();
  await expect(page.locator(".ai-assembly-progress")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: AI_BUTTON, exact: true }),
  ).toBeEnabled();
  await expect
    .poll(
      () =>
        mock.calls.filter(
          (call) => call.method === "GET" && call.path.includes("/jobs/"),
        ).length,
    )
    .toBeGreaterThan(0);
  const after = await project(page),
    interior = after.pages.slice(1, -1);
  expect(
    interior
      .flatMap((leaf) => leaf.photos)
      .filter(Boolean)
      .sort(),
  ).toEqual(before.photos.map((photo) => photo.id).sort());
  expect(
    new Set(
      interior
        .filter((leaf) => leaf.photos.some(Boolean))
        .map((leaf) => leaf.layout),
    ).size,
  ).toBeGreaterThanOrEqual(2);
  expect(interior.some((leaf) => leaf.caption.includes("sky"))).toBe(true);
  expect(after.pages[0]).toEqual(before.pages[0]);
  expect(after.pages.at(-1)).toEqual(before.pages.at(-1));
  expect(after.cover).toEqual(before.cover);
  expect(after.pageCount).toBe(40);
  expect(after.photos).toEqual(before.photos);
  expect(mock.state.input.language).toBe("en");
  expect(mock.state.input.photos).toHaveLength(6);
  expect(
    mock.calls.find((call) => call.path === "/api/ai/assemble").headers[
      "x-matiane-ai-guest"
    ],
  ).toBeUndefined();
  for (const photo of mock.state.input.photos) {
    expect(photo.src).toMatch(/^\/api\/photos\//);
    expect(Math.max(photo.width, photo.height)).toBeLessThanOrEqual(640);
  }
  const versions = await page.evaluate(async () => {
    const id = document.querySelector(".app-shell").dataset.bookId;
    return (await (await fetch("/api/books/" + id + "/versions")).json())
      .versions;
  });
  expect(
    versions.some((version) => version.label === "Before AI assembly"),
  ).toBe(true);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await project(page)).pages).toEqual(before.pages);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  expect((await project(page)).pages).toEqual(after.pages);
  const captionAt =
    interior.findIndex((leaf) => leaf.caption.includes("sky")) + 1;
  await page
    .getByRole("button", { name: "Page " + captionAt, exact: true })
    .click();
  await page.locator(".active-leaf .editable-caption").click();
  await page.getByLabel("Your words").fill("And we would do it all again.");
  await expect(page.locator(".active-leaf .page-caption")).toContainText(
    "And we would do it all again.",
  );
  await page.getByRole("button", { name: "Full bleed", exact: true }).click();
  expect((await project(page)).pages[captionAt].layout).toBe("full");
  expect(errors).toEqual([]);
});

test("AI failure leaves the entire draft intact and a retry applies the result", async ({
  page,
}) => {
  const mock = await mockAI(page, { mode: "failure" });
  await seedDraft(page);
  const before = await project(page);
  await page.getByRole("button", { name: AI_BUTTON, exact: true }).click();
  await expect(page.locator(".ai-assembly-error")).toBeVisible();
  expect(await project(page)).toEqual(before);
  mock.state.mode = "success";
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.locator(".ai-assembly-error")).toHaveCount(0);
  await expect
    .poll(
      () =>
        mock.calls.filter((call) => call.path === "/api/ai/assemble").length,
    )
    .toBe(2);
  await expect
    .poll(async () => (await project(page)).pages[1].caption)
    .not.toBe(before.pages[1].caption);
});
test("an analysis failure on a 74-photo draft shows its stage and progress while preserving the whole original", async ({
  page,
}) => {
  await mockAI(page, { mode: "invalid-analysis" });
  await seedDraft(page, 74);
  const before = await project(page);
  await page.getByRole("button", { name: AI_BUTTON, exact: true }).click();
  const failure = page.locator(".ai-assembly-error");
  await expect(failure).toContainText(
    "The AI could not return a complete answer",
  );
  await failure.getByText("Error details", { exact: true }).click();
  await expect(failure).toContainText("37/74");
  await expect(failure.locator("code")).toHaveText("ai_invalid_response");
  expect(await project(page)).toEqual(before);
});

test("canceling AI preserves the draft and requests cancellation with the job capability", async ({
  page,
}) => {
  const mock = await mockAI(page, { mode: "pending" });
  await seedDraft(page);
  const before = await project(page);
  await page.getByRole("button", { name: AI_BUTTON, exact: true }).click();
  await expect(page.locator(".ai-assembly-progress")).toBeVisible();
  await expect
    .poll(
      () =>
        mock.calls.filter(
          (call) => call.method === "GET" && call.path.includes("/jobs/"),
        ).length,
    )
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".ai-assembly-progress")).toHaveCount(0);
  await expect
    .poll(() => mock.calls.filter((call) => call.method === "DELETE").length)
    .toBe(1);
  expect(
    mock.calls.find((call) => call.method === "DELETE").headers[
      "x-matiane-ai-token"
    ],
  ).toBe("synthetic-job-capability");
  expect(await project(page)).toEqual(before);
});

test("canceling while job creation is pending cancels the acknowledged server job without polling or changing the book", async ({
  page,
}) => {
  const mock = await mockAI(page, { mode: "delayed-ack" });
  await seedDraft(page);
  const before = await project(page);
  await page.getByRole("button", { name: AI_BUTTON, exact: true }).click();
  await expect.poll(() => !!mock.state.releaseAck).toBe(true);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".ai-assembly-progress")).toContainText(
    "Cancelling assembly",
  );
  mock.state.releaseAck();
  await expect(page.locator(".ai-assembly-progress")).toHaveCount(0);
  await expect
    .poll(() => mock.calls.filter((call) => call.method === "DELETE").length)
    .toBe(1);
  expect(
    mock.calls.find((call) => call.method === "DELETE").headers[
      "x-matiane-ai-token"
    ],
  ).toBe("synthetic-job-capability");
  expect(
    mock.calls.filter(
      (call) => call.method === "GET" && call.path.includes("/jobs/"),
    ),
  ).toEqual([]);
  expect(await project(page)).toEqual(before);
});

test("signed-in AI assembly saves a recoverable server checkpoint before replacing the pages", async ({
  page,
}) => {
  test.setTimeout(60000);
  const mock = await mockAI(page);
  await page.context().clearCookies();
  await page.goto("/studio");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page
    .getByLabel("Email", { exact: true })
    .fill(
      `ai-test-${Date.now()}-${Math.random().toString(16).slice(2)}@example.invalid`,
    );
  await page
    .getByLabel("Password (at least 10 characters)")
    .fill("Synthetic AI assembly password");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.locator(".recovery-code")).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "New book", exact: true }),
  ).toBeEnabled();
  try {
    await page.getByRole("button", { name: "New book", exact: true }).click();
    await page.getByLabel("Book title").fill("A safely assembled account book");
    await page
      .getByRole("button", { name: "Create book", exact: true })
      .click();
    const buffer = await fs.readFile("public/photos/mountains.jpg");
    await page
      .locator("input[type=file]")
      .first()
      .setInputFiles(
        Array.from({ length: 6 }, (_, i) => ({
          name: `Account memory ${i + 1}.jpg`,
          mimeType: "image/jpeg",
          buffer,
        })),
      );
    await page.getByRole("button", { name: "Page 2", exact: true }).click();
    await page.locator(".active-leaf .editable-caption").click();
    await page.getByLabel("Your words").fill("The account version before AI");
    const before = await project(page);
    await page.getByRole("button", { name: AI_BUTTON, exact: true }).click();
    await expect
      .poll(
        () =>
          mock.calls.filter(
            (call) => call.method === "GET" && call.path.includes("/jobs/"),
          ).length,
      )
      .toBeGreaterThan(0);
    await expect(
      page.getByRole("button", { name: AI_BUTTON, exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Version history", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const versions = await page.evaluate(async () => {
      const { books } = await (await fetch("/api/books")).json();
      if (books.length !== 1)
        throw new Error("Expected exactly the generated test book");
      const response = await fetch("/api/books/" + books[0].id + "/versions");
      return { id: books[0].id, ...(await response.json()) };
    });
    const checkpoint = versions.versions.find(
      (version) => version.kind === "manual" && /AI/i.test(version.label),
    );
    expect(checkpoint).toBeTruthy();
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .locator(".version-list > div")
      .filter({ hasText: checkpoint.label + " · #" + checkpoint.revision })
      .getByRole("button", { name: "Restore", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect((await project(page)).pages).toEqual(before.pages);
    const restored = await page.evaluate(
      async (id) => (await (await fetch("/api/books/" + id)).json()).book,
      versions.id,
    );
    expect(restored.pages).toEqual(before.pages);
    expect(
      mock.calls.find((call) => call.path === "/api/ai/assemble").headers[
        "x-csrf-token"
      ],
    ).toBeTruthy();
  } finally {
    await page
      .evaluate(async () => {
        const session = await (await fetch("/api/session")).json();
        const { books } = await (await fetch("/api/books")).json();
        for (const book of books || [])
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
});
