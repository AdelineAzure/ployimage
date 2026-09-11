import { afterEach, describe, expect, it, vi } from "vitest";
import { IMAGE_MODELS, mapModelIdForLumina } from "../config/appConfig";
import {
  callBailianImageAPI,
  generateImage,
  getApiConfigForModel,
  getModelPlatformCandidates,
  buildDetectionExport,
  buildDetectionRequestText,
  getQwen3ImageEditSize,
  judgeDetectionOutput,
  mapAspectRatioToLuminaRatio,
  mergeApiKeys,
  normalizeCompareText,
  parseDetectionTextCases,
  pickOpenAiImageSizeFromDimensions,
  shouldRetryApiFailure,
} from "./appCore";

// Node 环境没有 DOM 的 Image；用它模拟浏览器里 measureImageSize 的量图能力。
function stubImage(width, height) {
  class FakeImage {
    set src(_value) {
      this.naturalWidth = width;
      this.naturalHeight = height;
      queueMicrotask(() => this.onload && this.onload());
    }
  }
  vi.stubGlobal("Image", FakeImage);
}

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

  // Nano(Gemini) 系列在双 Key 下默认首选 Lumina（正式版模型），报错时回退 Comet。
  it.each([
    "gemini-2.5-flash-image",
    "gemini-3.1-flash-image",
    "gemini-3-pro-image",
  ])("prefers Lumina by default for Nano model %s", (modelId) => {
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

  // 用户在设置里把某组首选平台改成 Comet 时，覆盖内置默认。
  it("honors a per-group platform override for Nano", () => {
    expect(
      getApiConfigForModel(
        findModel("gemini-3.1-flash-image"),
        { comet: "comet-key", lumina: "lumina-key" },
        { nano: "comet" }
      )
    ).toEqual({
      apiPlatform: "comet",
      apiBaseUrl: "https://api.cometapi.com",
      apiKey: "comet-key",
    });
  });

  // 互为回退：Nano 系列缺 Lumina Key 时回退 Comet；GPT 系列缺 Lumina Key 时回退 Comet。
  it("falls back to Comet for Nano when only a Comet key exists", () => {
    expect(
      getApiConfigForModel(findModel("gemini-3.1-flash-image"), { comet: "comet-key" })
    ).toEqual({
      apiPlatform: "comet",
      apiBaseUrl: "https://api.cometapi.com",
      apiKey: "comet-key",
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

  // getModelPlatformCandidates: 首选在前，Comet 作为通用回退。
  it("returns ordered platform candidates with Comet as fallback for Nano", () => {
    expect(
      getModelPlatformCandidates(findModel("gemini-3.1-flash-image"), {
        comet: "comet-key",
        lumina: "lumina-key",
      })
    ).toEqual(["lumina", "comet"]);
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

    // Nano 系列默认走 Lumina；这里只给 Lumina Key，验证其 generation 载荷。
    const model = findModel("gemini-3.1-flash-image");
    await generateImage("https://proxy.example", model, "paper-cut city", null, {
      ...getApiConfigForModel(model, { lumina: "lumina-key" }),
      aspectRatio: "1:1",
    });

    const [, request] = fetchMock.mock.calls[0];
    expect(request.headers["X-Target-Path"]).toBe("/v1/images/generations");
    expect(request.headers["X-Upstream-Base"]).toBe("https://lumina.tripo3d.com");
    expect(request.headers["X-Api-Key"]).toBe("lumina-key");
    // Lumina 认的名字带 -preview 后缀，出站时映射；透传原 id 会被上游 400 拒。
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

  it("sends size=2K on the Lumina edit path for Seedream so output follows the input ratio", async () => {
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
    // Seedream 小档位(1024²)被 3,686,400px 下限拒，不传 size 又回退 1:1 方图。
    // 实测传 "2K" 上游会在 2K 档位内按输入图比例出图，所以固定发 "2K"。
    expect(request.body.get("size")).toBe("2K");
    expect(request.body.get("ratio")).toBeNull();
  });

  it("routes Comet gpt-image-2 with an input image to multipart edits, not JSON body.image", async () => {
    // 坑 1：Comet 的 GPT 端点不认 JSON body.image。带图必须走 multipart /v1/images/edits
    // （gpt-image-2 即该端点默认模型），让 Comet 成为 GPT 图生图真正可用的第二条路。
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ b64_json: "ZWRpdA==" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const model = findModel("gpt-image-2");
    await generateImage("https://proxy.example", model, "make it snow", "data:image/png;base64,aW5wdXQ=", {
      ...getApiConfigForModel(model, { comet: "comet-key" }),
      apiPlatform: "comet",
      aspectRatio: "1:1",
    });

    const [, request] = fetchMock.mock.calls[0];
    expect(request.headers["X-Target-Path"]).toBe("/v1/images/edits");
    expect(request.body).toBeInstanceOf(FormData);
    // Comet 不改模型名，原样透传。
    expect(request.body.get("model")).toBe("gpt-image-2");
    expect(request.body.get("size")).toBe("1024x1024");
  });

  it("picks a portrait size on the Lumina edit path when auto follows a tall reference image", async () => {
    // 上游对 auto 不做自适应、回退 1:1 方图，所以 auto 时要按参考图方向主动选一档。
    stubImage(1024, 1536);
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
      aspectRatio: "auto",
    });

    const [, request] = fetchMock.mock.calls[0];
    expect(request.headers["X-Target-Path"]).toBe("/v1/images/edits");
    expect(request.body.get("size")).toBe("1024x1536");
  });

  it.each([
    [1536, 1024, "1536x1024"],
    [1024, 1536, "1024x1536"],
    [1000, 1000, "1024x1024"],
    [2524, 1198, "1536x1024"],
    [0, 100, null],
  ])("maps %sx%s dimensions to gpt-image size %s", (width, height, expected) => {
    expect(pickOpenAiImageSizeFromDimensions(width, height)).toBe(expected);
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

    const model = findModel("gemini-2.5-flash-image");
    await generateImage("https://proxy.example", model, "starry sky", null, {
      ...getApiConfigForModel(model, { lumina: "lumina-key" }),
      aspectRatio: "1:1",
    });

    const [, request] = fetchMock.mock.calls[0];
    expect(JSON.parse(request.body).model).toBe("gemini-2.5-flash-image-preview");
  });

  it.each([
    ["gemini-2.5-flash-image", "gemini-2.5-flash-image-preview"],
    ["gemini-3.1-flash-image", "gemini-3.1-flash-image-preview"],
    ["gemini-3-pro-image", "gemini-3-pro-image-preview"],
    ["gpt-image-2", "gpt-image-2"],
  ])("maps Lumina model id %s to %s", (input, expected) => {
    // Lumina 网关的真实名字带 -preview（用真实 key 打 /v1/models 核对）；缺映射会 400。
    expect(mapModelIdForLumina(input)).toBe(expected);
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

describe("shouldRetryApiFailure", () => {
  it("retries transient status codes and 5xx", () => {
    expect(shouldRetryApiFailure(429)).toBe(true);
    expect(shouldRetryApiFailure(408)).toBe(true);
    expect(shouldRetryApiFailure(503)).toBe(true);
  });

  it("retries Lumina's silent doubao downgrade 400 so it can recover on capacity return", () => {
    // Lumina 把 GPT 降级到 doubao 后因 size 低于 1920² 报的 400。
    const text =
      "[doubao-seedream-5-0-lite-260128::volcengine] 400 InvalidParameter: image size must be at least 3686400 pixels";
    expect(shouldRetryApiFailure(400, text)).toBe(true);
    expect(shouldRetryApiFailure(400, "No fallback model group found for orig")).toBe(true);
  });

  it("does not retry a genuine client-side 400", () => {
    expect(shouldRetryApiFailure(400, "Invalid model name passed in model=foo")).toBe(false);
    expect(shouldRetryApiFailure(401, "Unauthorized")).toBe(false);
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

describe("normalizeCompareText", () => {
  it("folds fullwidth to halfwidth via NFKC", () => {
    expect(normalizeCompareText("ＡＢＣ１２３")).toBe(normalizeCompareText("ABC123"));
  });

  it("strips zero-width characters the prompt editor injects", () => {
    // TokenPromptInput 会往内容里插 ​，模型也会照抄回来。
    expect(normalizeCompareText("不​通‍过﻿")).toBe("不通过");
  });

  it("collapses internal whitespace and trims", () => {
    expect(normalizeCompareText("  尺寸   不符  ")).toBe("尺寸 不符");
    expect(normalizeCompareText("a\n\tb")).toBe("a b");
  });

  it("ignores case", () => {
    expect(normalizeCompareText("PASS")).toBe(normalizeCompareText("pass"));
  });

  it("keeps trailing punctuation significant", () => {
    // 「归一化后完全相等」是既定规则，所以「是。」不等于「是」——卡片必须显示两边供定位。
    expect(normalizeCompareText("是。")).not.toBe(normalizeCompareText("是"));
  });

  it("handles nullish input", () => {
    expect(normalizeCompareText()).toBe("");
    expect(normalizeCompareText(null)).toBe("");
  });
});

describe("parseDetectionTextCases", () => {
  it("parses the canonical bare array", () => {
    const { cases, error } = parseDetectionTextCases('[{"text":"甲","expected":"不符"}]');
    expect(error).toBeNull();
    expect(cases).toEqual([{ text: "甲", expected: "不符", note: "" }]);
  });

  it("tolerates an {items:[...]} wrapper", () => {
    const { cases, error } = parseDetectionTextCases('{"items":[{"text":"甲","expected":"符"}]}');
    expect(error).toBeNull();
    expect(cases).toHaveLength(1);
  });

  it("accepts a bare string array as unrated cases", () => {
    const { cases, error } = parseDetectionTextCases('["甲","乙"]');
    expect(error).toBeNull();
    expect(cases).toEqual([
      { text: "甲", expected: "", note: "" },
      { text: "乙", expected: "", note: "" },
    ]);
  });

  it("strips a single ```json fence", () => {
    const { cases, error } = parseDetectionTextCases('```json\n[{"text":"甲","expected":"符"}]\n```');
    expect(error).toBeNull();
    expect(cases).toHaveLength(1);
  });

  it("surfaces the raw parser message for malformed JSON", () => {
    // 用户手写的 JSON 要精确报错，而不是贪婪正则救出一个截断片段只跑了几条。
    const { cases, error } = parseDetectionTextCases('[{"text":"甲",}]');
    expect(cases).toEqual([]);
    expect(error).toBeTruthy();
    expect(error).not.toBe("EXPECTED_ARRAY");
  });

  it("rejects a non-array payload", () => {
    expect(parseDetectionTextCases('{"text":"甲"}').error).toBe("EXPECTED_ARRAY");
  });

  it("rejects an empty array", () => {
    expect(parseDetectionTextCases("[]").error).toBe("EMPTY_ARRAY");
  });

  it("reports which entries are missing text rather than silently skipping them", () => {
    const { cases, error } = parseDetectionTextCases('[{"text":"甲"},{"expected":"符"},{"text":"  "}]');
    expect(cases).toEqual([]);
    expect(error).toBe("BAD_ENTRIES:1,2");
  });

  it("caps the case count", () => {
    const many = JSON.stringify(Array.from({ length: 5 }, (_, i) => ({ text: `t${i}` })));
    expect(parseDetectionTextCases(many, 3).error).toBe("TOO_MANY:5:3");
  });

  it("returns empty without error for blank input", () => {
    expect(parseDetectionTextCases("  ")).toEqual({ cases: [], compare: [], error: null });
  });
});

describe("judgeDetectionOutput", () => {
  it("rates green when the compared field matches after normalization", () => {
    const out = judgeDetectionOutput('{"result":" 不通过 ","reason":"尺寸"}', "不通过", "result");
    expect(out).toMatchObject({ resultValue: " 不通过 ", rating: "green", parseFailed: false });
  });

  it("rates red on a genuine mismatch", () => {
    expect(judgeDetectionOutput('{"result":"通过"}', "不通过", "result").rating).toBe("red");
  });

  it("reads a configurable field name", () => {
    expect(judgeDetectionOutput('{"verdict":"符"}', "符", "verdict").rating).toBe("green");
    // 同一份输出换个字段名就算契约未兑现。
    expect(judgeDetectionOutput('{"verdict":"符"}', "符", "result").parseFailed).toBe(true);
  });

  it("flags a missing field as contract failure, not as wrong", () => {
    // 判红会把「模版写错了」混进错误率，毁掉这个工具唯一的产出。
    const out = judgeDetectionOutput('{"reason":"只有理由"}', "符", "result");
    expect(out).toMatchObject({ resultValue: "", rating: null, parseFailed: true });
  });

  it("treats a present empty string as a real failing answer", () => {
    const out = judgeDetectionOutput('{"result":""}', "符", "result");
    expect(out.parseFailed).toBe(false);
    expect(out.rating).toBe("red");
  });

  it("coerces booleans and numbers", () => {
    expect(judgeDetectionOutput('{"result":true}', "true", "result").rating).toBe("green");
    expect(judgeDetectionOutput('{"result":1}', "1", "result").rating).toBe("green");
  });

  it("treats an object or array field as contract failure", () => {
    expect(judgeDetectionOutput('{"result":{"a":1}}', "符", "result").parseFailed).toBe(true);
    expect(judgeDetectionOutput('{"result":[1]}', "符", "result").parseFailed).toBe(true);
  });

  it("flags non-JSON output as contract failure", () => {
    expect(judgeDetectionOutput("这张图尺寸不符合要求", "不符", "result").parseFailed).toBe(true);
  });

  it("parses output wrapped in a json fence", () => {
    expect(judgeDetectionOutput('```json\n{"result":"符"}\n```', "符", "result").rating).toBe("green");
  });

  it("leaves rating null when no expected value was supplied", () => {
    const out = judgeDetectionOutput('{"result":"符"}', "", "result");
    expect(out).toMatchObject({ resultValue: "符", rating: null, parseFailed: false });
  });

  it("defaults the field name to result", () => {
    expect(judgeDetectionOutput('{"result":"符"}', "符").rating).toBe("green");
  });
});

describe("buildDetectionRequestText", () => {
  it("puts the case text ABOVE the detection instruction", () => {
    // 顺序是肉眼看不出对错的约定：改掉只会表现成模型答得变差，很难归因，所以钉住。
    expect(buildDetectionRequestText("判断是否合规", "甲样本")).toBe("甲样本\n\n判断是否合规");
  });

  it("falls back to just the instruction when there is no case text", () => {
    expect(buildDetectionRequestText("判断是否合规", "")).toBe("判断是否合规");
    expect(buildDetectionRequestText("判断是否合规")).toBe("判断是否合规");
  });

  it("falls back to just the case text when there is no instruction", () => {
    expect(buildDetectionRequestText("", "甲样本")).toBe("甲样本");
  });

  it("trims both sides and keeps exactly one blank line between them", () => {
    expect(buildDetectionRequestText("  指令  ", "  样本  ")).toBe("样本\n\n指令");
  });

  it("handles nullish input", () => {
    expect(buildDetectionRequestText()).toBe("");
    expect(buildDetectionRequestText(null, null)).toBe("");
  });
});

describe("parseDetectionTextCases with compare + object expected", () => {
  const SET = JSON.stringify({
    compare: ["tag"],
    items: [
      { text: '{"user_text":"Walk."}', expected: { name: "Walk", tag: "Basic" } },
      { text: '{"user_text":"Dançar."}', expected: { name: "Solo Dance", tag: "Scene Specific" } },
    ],
  });

  it("keeps expected as an object and surfaces the compare declaration", () => {
    const { cases, compare, error } = parseDetectionTextCases(SET);
    expect(error).toBeNull();
    expect(compare).toEqual(["tag"]);
    expect(cases[0].expected).toEqual({ name: "Walk", tag: "Basic" });
  });

  it("defaults compare to empty when the set does not declare one", () => {
    const { compare, error } = parseDetectionTextCases('[{"text":"a","expected":{"tag":"Basic"}}]');
    expect(error).toBeNull();
    expect(compare).toEqual([]);
  });

  it("rejects a compare field that exists in no expected object", () => {
    // 字段名拼错会让整批「无字段可判」而静默全部待判 —— 必须当场报错。
    const { error } = parseDetectionTextCases(
      JSON.stringify({ compare: ["taag"], items: [{ text: "a", expected: { tag: "Basic" } }] })
    );
    expect(error).toBe("COMPARE_NOT_FOUND:taag");
  });
});

describe("judgeDetectionOutput with object expected", () => {
  const EXPECTED = { name: "Walk", tag: "Basic" };

  it("judges only the compare field and reports the rest for eyeballing", () => {
    // name 不同也判绿：只有 compare 声明的 tag 参与判定。
    const out = judgeDetectionOutput(
      '{"name":"Walking","tag":"Basic"}',
      EXPECTED,
      { compare: ["tag"] }
    );
    expect(out.rating).toBe("green");
    expect(out.parseFailed).toBe(false);
    const byKey = Object.fromEntries(out.fields.map((f) => [f.key, f]));
    expect(byKey.tag).toMatchObject({ judged: true, match: true, actual: "Basic" });
    expect(byKey.name).toMatchObject({ judged: false, match: null, actual: "Walking" });
  });

  it("rates red when the compare field mismatches", () => {
    const out = judgeDetectionOutput(
      '{"name":"Solo Dance","tag":"Basic"}',
      { name: "Solo Dance", tag: "Scene Specific" },
      { compare: ["tag"] }
    );
    expect(out.rating).toBe("red");
    expect(out.fields.find((f) => f.key === "tag").match).toBe(false);
  });

  it("normalizes the compared value (fullwidth, spacing, case)", () => {
    const out = judgeDetectionOutput('{"tag":" basic "}', { tag: "Basic" }, { compare: ["tag"] });
    expect(out.rating).toBe("green");
  });

  it("treats a missing compare field as contract failure, not as wrong", () => {
    const out = judgeDetectionOutput('{"name":"Walk"}', EXPECTED, { compare: ["tag"] });
    expect(out.parseFailed).toBe(true);
    expect(out.rating).toBeNull();
  });

  it("ignores a missing field that is not being judged", () => {
    // name 缺失但不判 name ⇒ 仍按 tag 给结论，不算契约失败。
    const out = judgeDetectionOutput('{"tag":"Basic"}', EXPECTED, { compare: ["tag"] });
    expect(out.parseFailed).toBe(false);
    expect(out.rating).toBe("green");
  });

  it("judges every expected key when compare is empty", () => {
    const ok = judgeDetectionOutput('{"name":"Walk","tag":"Basic"}', EXPECTED, { compare: [] });
    expect(ok.rating).toBe("green");
    const bad = judgeDetectionOutput('{"name":"Walking","tag":"Basic"}', EXPECTED, { compare: [] });
    expect(bad.rating).toBe("red");
  });

  it("requires every judged field to match", () => {
    const out = judgeDetectionOutput(
      '{"name":"Walk","tag":"Interactive"}',
      EXPECTED,
      { compare: ["name", "tag"] }
    );
    expect(out.rating).toBe("red");
  });

  it("flags non-JSON output as contract failure but still lists expected fields", () => {
    const out = judgeDetectionOutput("这不是 JSON", EXPECTED, { compare: ["tag"] });
    expect(out.parseFailed).toBe(true);
    expect(out.fields.map((f) => f.key)).toEqual(["name", "tag"]);
  });

  it("still accepts the legacy string third argument", () => {
    const out = judgeDetectionOutput('{"result":"符"}', "符", "result");
    expect(out.rating).toBe("green");
  });
});

describe("parseDetectionTextCases always returns a compare array", () => {
  // 早期返回路径漏掉 compare 会让弹窗读 parsed.compare.length 时崩掉整个 UI，
  // 而空输入正是弹窗刚打开时的状态 —— 所以每条返回路径都必须带 compare。
  it.each([
    ["blank input", "  "],
    ["malformed JSON", '[{"text":"a",}]'],
    ["non-array", '{"text":"a"}'],
    ["empty array", "[]"],
    ["bad entries", '[{"expected":"x"}]'],
    ["too many", JSON.stringify([{ text: "a" }, { text: "b" }])],
    ["valid", '[{"text":"a","expected":"x"}]'],
  ])("returns an array for %s", (_label, input) => {
    const out = parseDetectionTextCases(input, 1);
    expect(Array.isArray(out.compare)).toBe(true);
    expect(Array.isArray(out.cases)).toBe(true);
  });
});

describe("note field (display-only translation)", () => {
  it("parses note alongside text and expected", () => {
    const { cases, error } = parseDetectionTextCases(
      JSON.stringify([{ text: "Dançar.", expected: { tag: "Scene Specific" }, note: "跳舞。" }])
    );
    expect(error).toBeNull();
    expect(cases[0]).toMatchObject({ text: "Dançar.", note: "跳舞。" });
  });

  it("defaults note to an empty string when absent", () => {
    const { cases } = parseDetectionTextCases('[{"text":"a","expected":"x"}]');
    expect(cases[0].note).toBe("");
  });

  it("NEVER puts note into the text sent to the model", () => {
    // 译文进了 prompt 就等于悄悄改了被测输入 —— 模型会看到中文提示，评测结果失去意义。
    // buildDetectionRequestText 只接受 prompt 和 caseText 两个参数，note 无处可入。
    const sent = buildDetectionRequestText("判断分类", "Dançar.");
    expect(sent).toBe("Dançar.\n\n判断分类");
    expect(sent).not.toContain("跳舞");
  });

  it("ignores a non-string note", () => {
    const { cases } = parseDetectionTextCases('[{"text":"a","expected":"x","note":123}]');
    expect(cases[0].note).toBe("");
  });
});

describe("multi-value expected (any-of)", () => {
  it("accepts any listed value for a field inside an expected object", () => {
    // 一个 text 可能有两三种都合理的 tag —— 任一个中就算对。
    const EXPECTED = { name: "Walk", tag: ["Basic", "Interactive"] };
    expect(judgeDetectionOutput('{"name":"Walk","tag":"Basic"}', EXPECTED, { compare: ["tag"] }).rating).toBe("green");
    expect(judgeDetectionOutput('{"name":"Walk","tag":"Interactive"}', EXPECTED, { compare: ["tag"] }).rating).toBe("green");
    // 不在列表里的仍判红
    expect(judgeDetectionOutput('{"name":"Walk","tag":"Emotional"}', EXPECTED, { compare: ["tag"] }).rating).toBe("red");
  });

  it("normalizes each candidate before comparing", () => {
    const out = judgeDetectionOutput(
      '{"tag":" scene specific "}',
      { tag: ["Basic", "Scene Specific"] },
      { compare: ["tag"] }
    );
    expect(out.rating).toBe("green");
  });

  it("reports how many values a field accepts", () => {
    const out = judgeDetectionOutput(
      '{"name":"Walk","tag":"Basic"}',
      { name: "Walk", tag: ["Basic", "Interactive"] },
      { compare: ["tag"] }
    );
    const tag = out.fields.find((f) => f.key === "tag");
    expect(tag.accepts).toBe(2);
    expect(tag.expected).toBe("Basic | Interactive");
    expect(out.fields.find((f) => f.key === "name").accepts).toBe(1);
  });

  it("still requires every judged field to pass when several are multi-valued", () => {
    const EXPECTED = { name: ["Walk", "Walking"], tag: ["Basic", "Interactive"] };
    expect(
      judgeDetectionOutput('{"name":"Walking","tag":"Interactive"}', EXPECTED, { compare: ["name", "tag"] }).rating
    ).toBe("green");
    expect(
      judgeDetectionOutput('{"name":"Sprint","tag":"Interactive"}', EXPECTED, { compare: ["name", "tag"] }).rating
    ).toBe("red");
  });

  it("treats an empty candidate list as no expectation, not as always-wrong", () => {
    const out = judgeDetectionOutput('{"tag":"Basic"}', { tag: [] }, { compare: ["tag"] });
    expect(out.rating).toBeNull();
    expect(out.parseFailed).toBe(false);
  });

  it("supports a top-level array expected for single-field comparison", () => {
    const out = judgeDetectionOutput('{"tag":"Interactive"}', ["Basic", "Interactive"], { compare: ["tag"] });
    expect(out.rating).toBe("green");
    expect(out.fields[0]).toMatchObject({ key: "tag", accepts: 2, match: true });
  });

  it("parses an array expected without mistaking it for a field map", () => {
    // typeof [] === "object"，误判成字段映射会让 compare 校验误报 COMPARE_NOT_FOUND。
    const { cases, error } = parseDetectionTextCases(
      JSON.stringify({ compare: ["tag"], items: [{ text: "a", expected: ["Basic", "Interactive"] }] })
    );
    expect(error).toBeNull();
    expect(cases[0].expected).toEqual(["Basic", "Interactive"]);
  });

  it("keeps array values through a compare-field existence check", () => {
    const { error } = parseDetectionTextCases(
      JSON.stringify({ compare: ["tag"], items: [{ text: "a", expected: { tag: ["Basic", "Emotional"] } }] })
    );
    expect(error).toBeNull();
  });
});

describe("buildDetectionExport", () => {
  const RECORD = {
    prompt: "判断分类，只输出 JSON",
    model: "qwen3-vl-30b-a3b-instruct",
    compareFields: ["tag"],
    items: [
      {
        id: "1", image: "", text: '{"user_text":"Walk."}', note: "走路。",
        expected: { name: "Walk", tag: "Basic" },
        outputText: '{"name":"Walk","tag":"Basic"}',
        status: "done", rating: "green", parseFailed: false,
        fields: [
          { key: "name", expected: "Walk", actual: "Walk", judged: false, match: null },
          { key: "tag", expected: "Basic", actual: "Basic", judged: true, match: true },
        ],
      },
      {
        id: "2", image: "", text: '{"user_text":"Dançar."}', note: "跳舞。",
        expected: { name: "Solo Dance", tag: "Scene Specific" },
        outputText: '{"name":"Solo Dance","tag":"Basic"}',
        status: "done", rating: "red", parseFailed: false,
        fields: [{ key: "tag", expected: "Scene Specific", actual: "Basic", judged: true, match: false }],
      },
      {
        id: "3", image: "", text: '{"user_text":"???"}',
        expected: { tag: "Basic" }, outputText: '{"name":"x"}',
        status: "done", rating: null, parseFailed: true, fields: [],
      },
    ],
  };

  it("exports input + output without repeating the instruction per item", () => {
    const out = buildDetectionExport(RECORD);
    expect(out.prompt).toBe("判断分类，只输出 JSON");
    expect(out.items).toHaveLength(3);
    // 指令只在顶层出现一次，不在每条里重复（100 条重复 100 遍是噪声）。
    out.items.forEach((it) => expect(it).not.toHaveProperty("prompt"));
    expect(out.items[0].input).toBe('{"user_text":"Walk."}');
    expect(out.items[0].output).toBe('{"name":"Walk","tag":"Basic"}');
  });

  it("omits note and compared — only analysis-necessary fields", () => {
    // note 是给人看的译文（中文还会把每行撑得很长）；compared 的信息 expected+output 已含。
    const out = buildDetectionExport(RECORD);
    out.items.forEach((it) => {
      expect(it).not.toHaveProperty("note");
      expect(it).not.toHaveProperty("compared");
    });
    expect(Object.keys(out.items[0])).toEqual(["input", "expected", "output", "rating"]);
  });

  it("only exports the wrong ones when asked", () => {
    const out = buildDetectionExport(RECORD, { onlyWrong: true });
    expect(out.items).toHaveLength(1);
    expect(out.items[0].input).toBe('{"user_text":"Dançar."}');
    expect(out.items[0].rating).toBe("red");
    expect(out.summary.exportedOnlyWrong).toBe(true);
    expect(out.summary.exported).toBe(1);
  });

  it("keeps the summary counts identical regardless of the filter", () => {
    // summary 描述整条记录，不该因为「只导错误」而变化 —— 否则导出的错误率会失真。
    const all = buildDetectionExport(RECORD);
    const wrong = buildDetectionExport(RECORD, { onlyWrong: true });
    expect(wrong.summary.total).toBe(all.summary.total);
    expect(wrong.summary.wrong).toBe(all.summary.wrong);
    expect(wrong.summary.wrongRate).toBe(all.summary.wrongRate);
  });

  it("computes wrongRate over rated items only, matching the dashboard", () => {
    // 3 条里 1 绿 1 红 1 契约未兑现 ⇒ 50%（未判定的不进分母）。
    expect(buildDetectionExport(RECORD).summary.wrongRate).toBe(50);
  });

  it("labels a contract failure distinctly from wrong", () => {
    const out = buildDetectionExport(RECORD);
    expect(out.items[2].rating).toBe("contract-error");
  });

  it("excludes image items, whose base64 input would bloat the JSON", () => {
    const out = buildDetectionExport({
      prompt: "p",
      items: [
        { id: "a", image: "data:image/png;base64,AAAA", text: "", outputText: "ok", status: "done" },
        { id: "b", image: "", text: "real case", outputText: "out", status: "done" },
      ],
    });
    expect(out.items).toHaveLength(1);
    expect(out.items[0].input).toBe("real case");
  });

  it("surfaces request errors", () => {
    const out = buildDetectionExport({
      items: [{ id: "e", image: "", text: "case", status: "error", error: "429 rate limited" }],
    });
    expect(out.items[0].error).toBe("429 rate limited");
  });

  it("handles an empty record without throwing", () => {
    const out = buildDetectionExport({});
    expect(out.items).toEqual([]);
    expect(out.summary.wrongRate).toBe(0);
  });
});
