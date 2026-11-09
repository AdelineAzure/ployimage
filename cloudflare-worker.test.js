import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "./cloudflare-worker";

describe("Cloudflare Worker Bailian forwarding", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwards the Qwen payload and Bailian authentication unchanged", async () => {
    const upstreamFetch = vi.fn(async () =>
      new Response(JSON.stringify({ output: { choices: [] } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", upstreamFetch);
    const payload = {
      model: "qwen-image-3.0-pro",
      input: { messages: [{ role: "user", content: [{ text: "paper-cut city" }] }] },
      parameters: { prompt_extend: true, prompt_extend_mode: "agent", watermark: false },
    };

    const response = await worker.fetch(
      new Request("https://worker.example/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Target-Path": "/api/v1/services/aigc/multimodal-generation/generation",
          "X-Upstream-Base": "https://dashscope.aliyuncs.com",
          "X-Api-Key": "sk-test",
        },
        body: JSON.stringify(payload),
      }),
      {},
    );

    expect(response.status).toBe(200);
    expect(upstreamFetch).toHaveBeenCalledTimes(1);
    const [url, request] = upstreamFetch.mock.calls[0];
    expect(url).toBe("https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation");
    expect(request.headers.Authorization).toBe("Bearer sk-test");
    expect(JSON.parse(new TextDecoder().decode(request.body))).toEqual(payload);
  });

  it("forwards Lumina image requests to Lumina with the Lumina key", async () => {
    const upstreamFetch = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ url: "https://images.example/result.png" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", upstreamFetch);
    const payload = {
      model: "gpt-image-2",
      prompt: "paper-cut city",
      ratio: "1:1",
      n: 1,
    };

    const response = await worker.fetch(
      new Request("https://worker.example/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Target-Path": "/v1/images/generations",
          "X-Upstream-Base": "https://lumina.tripo3d.com",
          "X-Api-Key": "lumina-key",
        },
        body: JSON.stringify(payload),
      }),
      {},
    );

    expect(response.status).toBe(200);
    expect(upstreamFetch).toHaveBeenCalledTimes(1);
    const [url, request] = upstreamFetch.mock.calls[0];
    expect(url).toBe("https://lumina.tripo3d.com/v1/images/generations");
    expect(request.headers.Authorization).toBe("Bearer lumina-key");
    expect(JSON.parse(new TextDecoder().decode(request.body))).toEqual(payload);
  });

  // 私有化部署模型（gemma4-26b-a4b）只能从 LiteLLM Business Relay 这个公网中继进，
  // 直连地址 *.infer.itripo3d.com:8000 是集群内网，Worker 也到不了。
  it("forwards LiteLLM relay chat requests with the relay key", async () => {
    const upstreamFetch = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", upstreamFetch);
    const payload = {
      model: "gemma4-26b-a4b",
      stream: false,
      messages: [{ role: "user", content: "case text" }],
    };

    const response = await worker.fetch(
      new Request("https://worker.example/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Target-Path": "/v1/chat/completions",
          "X-Upstream-Base": "https://litellm-business-relay.vast-internal.com",
          "X-Api-Key": "relay-key",
        },
        body: JSON.stringify(payload),
      }),
      {},
    );

    expect(response.status).toBe(200);
    const [url, request] = upstreamFetch.mock.calls[0];
    expect(url).toBe("https://litellm-business-relay.vast-internal.com/v1/chat/completions");
    expect(request.headers.Authorization).toBe("Bearer relay-key");
    expect(JSON.parse(new TextDecoder().decode(request.body))).toEqual(payload);
  });

  // X-Api-Platform 缺省时平台靠 base 推断：中继域名必须落到 litellm，
  // 否则会去读 COMETAPI_KEY 这个错的 env key。
  it("infers the litellm platform from the relay base and uses LITELLM_API_KEY", async () => {
    const upstreamFetch = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", upstreamFetch);

    const response = await worker.fetch(
      new Request("https://worker.example/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Target-Path": "/v1/chat/completions",
          "X-Upstream-Base": "https://litellm-business-relay.vast-internal.com",
        },
        body: JSON.stringify({ model: "gemma4-26b-a4b", messages: [] }),
      }),
      { LITELLM_API_KEY: "env-relay-key", COMETAPI_KEY: "env-comet-key" },
    );

    expect(response.status).toBe(200);
    const [, request] = upstreamFetch.mock.calls[0];
  expect(request.headers.Authorization).toBe("Bearer env-relay-key");
  });

  // 鉴权重试曾经永远用第二次的响应覆盖第一次：进到重试分支时状态必是 4xx，
  // 旧条件里的 !resp.ok 恒为真。于是 LiteLLM 真正的「key 不在验证表里」被盖成
  // 裸 key 触发的「Ensure Key has `Bearer ` prefix」，把人往"加前缀"的错路上带。
  it("keeps the first auth error when the fallback scheme also fails", async () => {
    const REAL = "Authentication Error, Invalid proxy server token passed.";
  const MASKING = "Authentication Error, Malformed API Key passed in. Ensure Key has `Bearer ` prefix.";
    const upstreamFetch = vi.fn(async (_url, init) => {
 // Bearer = 我们认定正确的格式，它的报错才是真实原因；裸 key 的报错是噪声。
      const bare = !String(init.headers.Authorization || "").startsWith("Bearer ");
      return new Response(JSON.stringify({ error: { message: bare ? MASKING : REAL } }), {
     status: 401,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", upstreamFetch);

    const response = await worker.fetch(
      new Request("https://worker.example/", {
     method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Target-Path": "/v1/chat/completions",
          "X-Upstream-Base": "https://litellm-business-relay.vast-internal.com",
 "X-Api-Key": "sk-not-in-table",
        },
 body: JSON.stringify({ model: "gemma4-26b-a4b", messages: [] }),
      }),
      {},
    );

    // 两次都试过（Bearer + 裸 key），但返回的必须是第一次那条有诊断价值的。
    expect(upstreamFetch).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(401);
    const body = await response.text();
    expect(body).toContain("Invalid proxy server token");
    expect(body).not.toContain("Ensure Key has");
  });

  it("adopts the fallback scheme when it actually succeeds", async () => {
    const upstreamFetch = vi.fn(async (_url, init) => {
 const bare = !String(init.headers.Authorization || "").startsWith("Bearer ");
      // 裸 key 成功这一路必须仍然生效，别为修掩盖问题把回退本身废掉。
      return bare
        ? new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
 status: 200,
   headers: { "content-type": "application/json" },
        })
   : new Response(JSON.stringify({ error: { message: "invalid api key" } }), {
          status: 401,
            headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", upstreamFetch);

    const response = await worker.fetch(
      new Request("https://worker.example/", {
    method: "POST",
        headers: {
          "Content-Type": "application/json",
    "X-Target-Path": "/v1beta/models/gemini-2.5-flash-image:generateContent",
          "X-Upstream-Base": "https://api.cometapi.com",
          "X-Api-Key": "goog-key",
        },
        body: JSON.stringify({ contents: [] }),
      }),
      {},
    );

    expect(upstreamFetch).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(200);
 expect(await response.text()).toContain("ok");
  });
});
