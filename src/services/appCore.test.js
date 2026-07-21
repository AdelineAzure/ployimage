import { afterEach, describe, expect, it, vi } from "vitest";
import { IMAGE_MODELS } from "../config/appConfig";
import {
  callBailianImageAPI,
  generateImage,
  getApiConfigForModel,
  getQwen3ImageEditSize,
  mapAspectRatioToLuminaRatio,
  mergeApiKeys,
} from "./appCore";

describe("image API platform routing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const findModel = (id) => IMAGE_MODELS.find((model) => model.id === id);

  it("routes GPT Image to Lumina when a Lumina key is configured", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ b64_json: "aGVsbG8=" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const model = findModel("gpt-image-2");
    const requestConfig = getApiConfigForModel(model, {
      comet: "comet-key",
      lumina: "lumina-key",
    });
    await generateImage("https://proxy.example", model, "paper-cut city", null, {
      ...requestConfig,
      aspectRatio: "1:1",
    });

    expect(requestConfig).toEqual({
      apiPlatform: "lumina",
      apiBaseUrl: "https://lumina.tripo3d.com",
      apiKey: "lumina-key",
    });
    const [, request] = fetchMock.mock.calls[0];
    expect(request.headers["X-Upstream-Base"]).toBe("https://lumina.tripo3d.com");
    expect(request.headers["X-Api-Key"]).toBe("lumina-key");
    expect(JSON.parse(request.body)).toMatchObject({
      model: "gpt-image-2",
      ratio: "1:1",
    });
    expect(JSON.parse(request.body)).not.toHaveProperty("size");
  });

  // Seed 与 GPT 系列在双 Key 下首选 Lumina（GPT 走 Lumina 绕开 Comet 不认 image 字段）。
  it.each([
    "doubao-seedream-4-5-251128",
    "doubao-seedream-5-0-260128",
    "gpt-image-1.5",
    "gpt-image-2",
  ])("prefers Lumina for non-Bailian model %s", (modelId) => {
    expect(
      getApiConfigForModel(findModel(modelId), {
        comet: "comet-key",
        lumina: "lumina-key",
      })
    ).toEqual({
      apiPlatform: "lumina",
      apiBaseUrl: "https://lumina.tripo3d.com",
      apiKey: "lumina-key",
    });
  });

  // Nano(Gemini) 系列在双 Key 下首选 Comet（避开 Lumina 上游 gemini→doubao 降级）。
  it.each([
    "gemini-2.5-flash-image",
    "gemini-3.1-flash-image-preview",
    "gemini-3-pro-image",
  ])("prefers Comet for Nano model %s", (modelId) => {
    expect(
      getApiConfigForModel(findModel(modelId), {
        comet: "comet-key",
        lumina: "lumina-key",
      })
    ).toEqual({
      apiPlatform: "comet",
      apiBaseUrl: "https://api.cometapi.com",
      apiKey: "comet-key",
    });
  });

  // 互为回退：Nano 系列缺 Comet Key 时回退 Lumina；GPT 系列缺 Lumina Key 时回退 Comet。
  it("falls back to Lumina for Nano when only a Lumina key exists", () => {
    expect(
      getApiConfigForModel(findModel("gemini-3.1-flash-image-preview"), { lumina: "lumina-key" })
    ).toEqual({
      apiPlatform: "lumina",
      apiBaseUrl: "https://lumina.tripo3d.com",
      apiKey: "lumina-key",
    });
  });

  it("falls back to Comet for GPT when only a Comet key exists", () => {
    expect(
      getApiConfigForModel(findModel("gpt-image-2"), { comet: "comet-key" })
    ).toEqual({
      apiPlatform: "comet",
      apiBaseUrl: "https://api.cometapi.com",
      apiKey: "comet-key",
    });
  });

  it("uses the unified Lumina generation payload for Seedream", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ b64_json: "c2VlZA==" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const model = findModel("doubao-seedream-4-5-251128");
    await generateImage("https://proxy.example", model, "paper-cut city", null, {
      ...getApiConfigForModel(model, { comet: "comet-key", lumina: "lumina-key" }),
      aspectRatio: "16:9",
    });

    const [, request] = fetchMock.mock.calls[0];
    expect(request.headers["X-Upstream-Base"]).toBe("https://lumina.tripo3d.com");
    expect(request.headers["X-Api-Key"]).toBe("lumina-key");
    expect(JSON.parse(request.body)).toMatchObject({
      model: "doubao-seedream-4-5-251128",
      ratio: "16:9",
      n: 1,
    });
    expect(JSON.parse(request.body)).not.toHaveProperty("size");
    expect(JSON.parse(request.body)).not.toHaveProperty("response_format");
  });

  it("uses the unified Lumina generation endpoint for NanoBanana", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ b64_json: "bmFubw==" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    // Nano 系列双 Key 下首选 Comet；这里只给 Lumina Key，回退到 Lumina 以验证其 generation 载荷。
    const model = findModel("gemini-3.1-flash-image-preview");
    await generateImage("https://proxy.example", model, "paper-cut city", null, {
      ...getApiConfigForModel(model, { lumina: "lumina-key" }),
      aspectRatio: "1:1",
    });

    const [, request] = fetchMock.mock.calls[0];
    expect(request.headers["X-Target-Path"]).toBe("/v1/images/generations");
    expect(request.headers["X-Upstream-Base"]).toBe("https://lumina.tripo3d.com");
    expect(request.headers["X-Api-Key"]).toBe("lumina-key");
    expect(JSON.parse(request.body)).toMatchObject({
      model: "gemini-3.1-flash-image-preview",
      ratio: "1:1",
      n: 1,
    });
  });

  it("uses the unified Lumina edit endpoint when a non-Bailian model has an input image", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ b64_json: "ZWRpdA==" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const model = findModel("gemini-2.5-flash-image");
    await generateImage("https://proxy.example", model, "watercolor", "data:image/png;base64,aW5wdXQ=", {
      ...getApiConfigForModel(model, { lumina: "lumina-key" }),
      aspectRatio: "3:2",
    });

    const [, request] = fetchMock.mock.calls[0];
    expect(request.headers["X-Target-Path"]).toBe("/v1/images/edits");
    expect(request.headers["X-Upstream-Base"]).toBe("https://lumina.tripo3d.com");
    expect(request.body).toBeInstanceOf(FormData);
    // Lumina names this model with a -preview suffix; the app id is mapped on the way out.
    expect(request.body.get("model")).toBe("gemini-2.5-flash-image-preview");
    // Lumina 编辑端点忽略 ratio、只认离散 size 档位（3:2 → 横向 1536x1024）；
    // 实测非标准像素会被拒并回退方图，所以这里用 OpenAI 同款档位而非 ratio。
    expect(request.body.get("ratio")).toBeNull();
    expect(request.body.get("size")).toBe("1536x1024");
  });

  it("omits size on the Lumina edit path for Seedream (its edit endpoint rejects the small tiers)", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ b64_json: "c2VlZGVkaXQ=" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const model = findModel("doubao-seedream-5-0-260128");
    await generateImage("https://proxy.example", model, "watercolor", "data:image/png;base64,aW5wdXQ=", {
      ...getApiConfigForModel(model, { lumina: "lumina-key" }),
      aspectRatio: "16:9",
    });

    const [, request] = fetchMock.mock.calls[0];
    expect(request.headers["X-Target-Path"]).toBe("/v1/images/edits");
    expect(request.body).toBeInstanceOf(FormData);
    // Seedream 编辑端点要求 size ≥ 3,686,400px，OpenAI 小档位会被 400 拒；不传 size 跟随输入图。
    expect(request.body.get("size")).toBeNull();
    expect(request.body.get("ratio")).toBeNull();
  });

  it.each([
    ["auto", "auto"],
    ["1:1", "1:1"],
    ["3:2", "4:3"],
    ["2:3", "3:4"],
    ["21:9", "16:9"],
  ])("maps %s to Lumina-supported ratio %s", (input, expected) => {
    expect(mapAspectRatioToLuminaRatio(input)).toBe(expected);
  });

  it("maps the Lumina text-to-image model name to the -preview variant", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ b64_json: "cHJldg==" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const model = findModel("gemini-3-pro-image");
    await generateImage("https://proxy.example", model, "starry sky", null, {
      ...getApiConfigForModel(model, { lumina: "lumina-key" }),
      aspectRatio: "1:1",
    });

    const [, request] = fetchMock.mock.calls[0];
    expect(JSON.parse(request.body).model).toBe("gemini-3-pro-image-preview");
  });

  it("adds a current Lumina key to an old Comet-only task snapshot", () => {
    const effectiveKeys = mergeApiKeys(
      { comet: "legacy-comet-key" },
      { lumina: "current-lumina-key" }
    );

    expect(getApiConfigForModel(findModel("gpt-image-1.5"), effectiveKeys)).toEqual({
      apiPlatform: "lumina",
      apiBaseUrl: "https://lumina.tripo3d.com",
      apiKey: "current-lumina-key",
    });
  });

  it.each(["wan2.7-image", "qwen-image-2.0", "qwen-image-invite-beta-v1"])(
    "keeps %s on Bailian",
    (modelId) => {
      expect(
        getApiConfigForModel(findModel(modelId), {
          comet: "comet-key",
          bailian: "bailian-key",
          lumina: "lumina-key",
        })
      ).toEqual({
        apiPlatform: "bailian",
        apiBaseUrl: "https://dashscope.aliyuncs.com",
        apiKey: "bailian-key",
      });
    }
  );

  it.each(["gemini-2.5-flash-image", "gpt-image-2"])(
    "falls back to Comet for %s when no Lumina key exists",
    (modelId) => {
      expect(getApiConfigForModel(findModel(modelId), { comet: "comet-key" })).toEqual({
        apiPlatform: "comet",
        apiBaseUrl: "https://api.cometapi.com",
        apiKey: "comet-key",
      });
    }
  );

  it("keeps Seedream 4.0 on Comet even with a Lumina key (Lumina lacks that model)", () => {
    expect(
      getApiConfigForModel(findModel("doubao-seedream-4-0-250828"), {
        comet: "comet-key",
        lumina: "lumina-key",
      })
    ).toEqual({
      apiPlatform: "comet",
      apiBaseUrl: "https://api.cometapi.com",
      apiKey: "comet-key",
    });
  });

  it("lets current non-empty keys replace stale task keys without erasing other fallbacks", () => {
    expect(
      mergeApiKeys(
        { comet: "old-comet", bailian: "old-bailian", lumina: "old-lumina" },
        { comet: "", bailian: "new-bailian", lumina: "new-lumina" }
      )
    ).toEqual({
      comet: "old-comet",
      bailian: "new-bailian",
      lumina: "new-lumina",
    });
  });
});

describe("callBailianImageAPI", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the Qwen Image request through Bailian with prompt enhancement enabled", async () => {
    const fetchMock = vi.fn(async (_url, request) =>
      new Response(
        JSON.stringify({
          output: {
            choices: [{ message: { content: [{ image: "data:image/png;base64,aGVsbG8=" }] } }],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const images = await callBailianImageAPI(
      "https://proxy.example",
      { id: "qwen-image-2.0", apiType: "bailian", platforms: ["bailian"] },
      "a paper-cut city",
      null,
      {
        apiPlatform: "bailian",
        apiBaseUrl: "https://dashscope.aliyuncs.com",
        apiKey: "sk-test",
        aspectRatio: "1:1",
        promptExtend: true,
      },
    );

    expect(images).toEqual(["data:image/png;base64,aGVsbG8="]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, request] = fetchMock.mock.calls[0];
    expect(request.headers["X-Target-Path"]).toBe("/api/v1/services/aigc/multimodal-generation/generation");
    expect(request.headers["X-Upstream-Base"]).toBe("https://dashscope.aliyuncs.com");
    expect(request.headers["X-Api-Key"]).toBe("sk-test");
    expect(JSON.parse(request.body)).toEqual({
      model: "qwen-image-2.0",
      input: {
        messages: [{ role: "user", content: [{ text: "a paper-cut city" }] }],
      },
      parameters: {
        n: 1,
        size: "2048*2048",
        watermark: false,
        prompt_extend: true,
      },
    });
  });

  it("passes prompt enhancement off without affecting non-Qwen parameters", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ output: { images: [{ url: "data:image/png;base64,d29ybGQ=" }] } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await callBailianImageAPI(
      "https://proxy.example",
      { id: "qwen-image-2.0-pro", apiType: "bailian", platforms: ["bailian"] },
      "ink illustration",
      null,
      { apiPlatform: "bailian", promptExtend: false },
    );

    const [, request] = fetchMock.mock.calls[0];
    expect(JSON.parse(request.body).parameters.prompt_extend).toBe(false);
  });

  it("uses the documented image-edit content order and preserves the input ratio in auto mode", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          output: {
            choices: [
              {
                message: {
                  content: [
                    { image: "data:image/png;base64,b25l" },
                    { image: "data:image/png;base64,dHdv" },
                  ],
                },
              },
            ],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const images = await callBailianImageAPI(
      "https://proxy.example",
      { id: "qwen-image-2.0-pro", apiType: "bailian", platforms: ["bailian"] },
      "Put the subject in a snowy forest",
      null,
      {
        apiPlatform: "bailian",
        aspectRatio: "auto",
        count: 2,
        imageInputs: ["data:image/png;base64,aW1hZ2Ux", "data:image/png;base64,aW1hZ2Uy"],
      },
    );

    expect(images).toHaveLength(2);
    const [, request] = fetchMock.mock.calls[0];
    const body = JSON.parse(request.body);
    expect(body.input.messages[0].content).toEqual([
      { image: "data:image/png;base64,aW1hZ2Ux" },
      { image: "data:image/png;base64,aW1hZ2Uy" },
      { text: "Put the subject in a snowy forest" },
    ]);
    expect(body.parameters.n).toBe(2);
    expect(body.parameters).not.toHaveProperty("size");
    expect(body.parameters.prompt_extend).toBe(true);
  });

  it("sends Qwen3 with its invite model id, automatic resolution, and APE mode", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          output: { choices: [{ message: { content: [{ image: "data:image/png;base64,cXdlbjM=" }] } }] },
          usage: { image_count: 1, width: 1696, height: 2528 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await callBailianImageAPI(
      "https://proxy.example",
      { id: "qwen-image-invite-beta-v1", apiType: "bailian", platforms: ["bailian"] },
      "warm outdoor portrait",
      null,
      { apiPlatform: "bailian", aspectRatio: "auto", promptExtend: true, promptExtendMode: "agent" },
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe("qwen-image-invite-beta-v1");
    expect(body.parameters).toEqual({
      watermark: false,
      prompt_extend: true,
      prompt_extend_mode: "agent",
    });
  });

  it("runs multiple Qwen3 outputs as separate requests", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ output: { choices: [{ message: { content: [{ image: "data:image/png;base64,b3V0" }] } }] } }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const images = await generateImage(
      "https://proxy.example",
      { id: "qwen-image-invite-beta-v1", name: "Qwen3", apiType: "bailian", platforms: ["bailian"] },
      "editorial portrait",
      null,
      { apiPlatform: "bailian", count: 2, promptExtend: true, promptExtendMode: "direct" },
    );

    expect(images).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mock.calls.forEach(([, request]) => {
      expect(JSON.parse(request.body).parameters).not.toHaveProperty("n");
    });
  });

  it.each([
    ["1:1", "1500*1500"],
    ["16:9", "2000*1125"],
    ["9:16", "1125*2000"],
    ["21:9", "2044*876"],
  ])("keeps Qwen3 image-edit size within the documented area for %s", (aspectRatio, expected) => {
    const size = getQwen3ImageEditSize(aspectRatio);
    expect(size).toBe(expected);
    const [width, height] = size.split("*").map(Number);
    expect(width * height).toBeGreaterThanOrEqual(512 * 512);
    expect(width * height).toBeLessThanOrEqual(1500 * 1500);
  });

  it("uses the capped Qwen3 size for an explicit image-edit ratio", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ output: { choices: [{ message: { content: [{ image: "data:image/png;base64,aTJp" }] } }] } }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await callBailianImageAPI(
      "https://proxy.example",
      { id: "qwen-image-invite-beta-v1", apiType: "bailian", platforms: ["bailian"] },
      "keep the subject",
      "data:image/png;base64,aW5wdXQ=",
      { apiPlatform: "bailian", aspectRatio: "1:1" },
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.parameters.size).toBe("1500*1500");
  });
});
