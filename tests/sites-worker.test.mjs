import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";
import worker from "../worker/index.js";

test("serves existing static assets without a fallback", async () => {
  const calls = [];
  const response = await worker.fetch(new Request("https://example.test/assets/app.js"), {
    ASSETS: {
      fetch: async (request) => {
        calls.push(new URL(request.url).pathname);
        return new Response("asset", { status: 200 });
      },
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["/assets/app.js"]);
});

test("falls back to index.html for an unknown app route", async () => {
  const calls = [];
  const response = await worker.fetch(
    new Request("https://example.test/flow/step-two?source=share", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async (request) => {
          const url = new URL(request.url);
          calls.push(url.pathname + url.search);
          return new Response(url.pathname === "/index.html" ? "app" : "missing", {
            status: url.pathname === "/index.html" ? 200 : 404,
          });
        },
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["/flow/step-two?source=share", "/index.html"]);
});

test("does not turn missing API or write requests into the app shell", async () => {
  for (const request of [
    new Request("https://example.test/api/missing", { headers: { accept: "application/json" } }),
    new Request("https://example.test/flow", { method: "POST", headers: { accept: "text/html" } }),
  ]) {
    let calls = 0;
    const response = await worker.fetch(request, {
      ASSETS: {
        fetch: async () => {
          calls += 1;
          return new Response("missing", { status: 404 });
        },
      },
    });

    assert.equal(response.status, 404);
    assert.equal(calls, 1);
  }
});

test("keeps email requests out of the static asset handler", async () => {
  let assetCalls = 0;
  const response = await worker.fetch(new Request("https://example.test/api/requests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "appointment", name: "Ada", phone: "600 000 000" }),
  }), {
    ASSETS: { fetch: async () => { assetCalls += 1; return new Response("asset"); } },
  });

  assert.equal(response.status, 503);
  assert.equal(assetCalls, 0);
});

test("includes catalog descriptions and excludes photos from parts emails", async () => {
  const originalFetch = globalThis.fetch;
  let emailPayload;
  globalThis.fetch = async (_url, options) => {
    emailPayload = JSON.parse(options.body);
    return new Response(JSON.stringify({ id: "sample-email" }), { status: 200 });
  };

  try {
    const response = await worker.fetch(new Request("https://example.test/api/requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "parts",
        name: "Marc",
        phone: "600 000 000",
        items: [{
          title: "Pastillas de freno",
          description: "Pastillas sinterizadas para uso urbano",
          reference: "VKT-FR-001",
          quantity: 2,
          price: 42.9,
          imageUrl: "https://example.test/brake-pads.jpg",
        }],
      }),
    }), { RESEND_API_KEY: "test-key", RESEND_FROM_EMAIL: "Victiker <test@example.test>", ASSETS: { fetch: async () => new Response("asset") } });

    assert.equal(response.status, 200);
    assert.match(emailPayload.html, /Pastillas sinterizadas para uso urbano/);
    assert.ok(!emailPayload.html.includes("<img"));
    assert.ok(!emailPayload.html.includes("https://example.test/brake-pads.jpg"));
    assert.ok(!emailPayload.text.includes("Foto:"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("emits the files required by Sites packaging", async () => {
  await access(new URL("../dist/client/index.html", import.meta.url));
  await access(new URL("../dist/server/index.js", import.meta.url));
  await access(new URL("../dist/.openai/hosting.json", import.meta.url));
});
