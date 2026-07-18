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
      model: "qwen-image-invite-beta-v1",
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
});
