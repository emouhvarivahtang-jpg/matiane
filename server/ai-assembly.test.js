import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AI_MODEL,
  AiError,
  cloudflareProvider,
  validateAnalysis,
  validatePlan,
} from "./ai-assembly.js";

test("Cloudflare credentials remain on the fixed API host and transient responses are retried once", async () => {
  const calls = [];
  const provider = cloudflareProvider({
    accountId: "a".repeat(32),
    token: "test-token-only",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (calls.length === 1) return { status: 503, ok: false };
      return {
        status: 200,
        ok: true,
        json: async () => ({
          success: true,
          result: {
            choices: [{ message: { content: "{}" } }],
            usage: { neurons: 3.5 },
          },
        }),
      };
    },
  });
  const result = await provider({ payload: { messages: [] } });
  assert.equal(result.content, "{}");
  assert.equal(result.neurons, 3.5);
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(new URL(call.url).hostname, "api.cloudflare.com");
    assert.ok(call.url.endsWith(AI_MODEL));
    assert.equal(call.options.redirect, "error");
    assert.equal(call.options.headers.Authorization, "Bearer test-token-only");
  }
  assert.equal(
    cloudflareProvider({ accountId: "https://other.invalid", token: "test" }),
    null,
  );
});
test("cancelled requests never contact the provider and API failures do not expose provider bodies", async () => {
  let calls = 0;
  const provider = cloudflareProvider({
    accountId: "a".repeat(32),
    token: "test-token-only",
    fetchImpl: async () => {
      calls++;
      return {
        status: 401,
        ok: false,
        json: () => {
          throw new Error("must not read private error");
        },
      };
    },
  });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(provider({ payload: {}, signal: controller.signal }));
  assert.equal(calls, 0);
  await assert.rejects(
    provider({ payload: {} }),
    (error) => error instanceof AiError && error.code === "ai_unavailable",
  );
  assert.equal(calls, 1);
});
test("model responses reject malformed objects and normalize out-of-range focus and styling", () => {
  assert.throws(() => validateAnalysis("null"), AiError);
  assert.throws(() => validateAnalysis("```json\n{\n```"), AiError);
  const analysis = validateAnalysis(
    "```json\n" +
      JSON.stringify({
        description: "A landscape.",
        importance: 2,
        subjectCenter: [-0.4, 2],
        caption: " hello\u0000 ",
      }) +
      "\n```",
  );
  assert.deepEqual(analysis.subjectCenter, [0, 1]);
  assert.equal(analysis.importance, 1);
  assert.equal(analysis.caption, "hello");
  assert.throws(
    () => validatePlan({ pages: [{ photoIds: ["unknown"] }] }, ["photo"], 40),
    AiError,
  );
  const plan = validatePlan(
    {
      pages: [
        {
          photoIds: ["photo"],
          layout: "unsupported",
          color: "javascript:evil",
          caption: "Somewhere together.",
        },
      ],
    },
    ["photo"],
    40,
  );
  assert.equal(plan.pages[0].layout, "editorial");
  assert.equal(plan.pages[0].color, "#FAF8F3");
});
