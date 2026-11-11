// ─── 评测：调用裁判 / 打标模型 ───
// 走和 GPT Prompt 同一条通道（Worker 代理 + 任务文件夹里的 key）。
// 平台按顺序试：先 Comet，再 Lumina；都失败就把最后一个错误抛出去。
import {
  assistantMessageToText,
  getApiConfigForPlatform,
  normalizeApiKeys,
  parseJsonFromText,
  postJsonWithRetry,
} from "./appCore";
import {
  buildJudgeMessages,
  buildTaggingMessages,
  parseJudgeOutput,
  parseTaggingOutput,
} from "./evalCore";

const JUDGE_PLATFORMS = ["comet", "lumina"];

async function callVisionJson(proxyUrl, model, messages, apiKeys, signal) {
  const keys = normalizeApiKeys(apiKeys);
  const platforms = JUDGE_PLATFORMS.filter((p) => keys[p]);
  if (!platforms.length) throw new Error("没有可用的 Comet 或 Lumina Key，请在设置里填写。");
  let lastError = null;
  for (const platform of platforms) {
    const cfg = getApiConfigForPlatform(platform, keys);
    try {
      const data = await postJsonWithRetry(
        proxyUrl,
        "/v1/chat/completions",
        // 低温度：同一张图判两次要尽量给出同一个分。
        { model, stream: false, temperature: 0.1, messages },
        { signal, maxAttempts: 2, baseDelayMs: 900, ...cfg }
      );
      const text = assistantMessageToText(data?.choices?.[0]?.message?.content);
      return { text, parsed: parseJsonFromText(text), platform };
    } catch (err) {
      if (err?.name === "AbortError") throw err;
      lastError = err;
    }
  }
  throw lastError || new Error("裁判请求失败");
}

// 对一张图按生效标准打分。返回 { items, missing, ok, raw }。
// 返回格式不对时 ok=false，由调用方标「未判」，不进平均。
export async function judgeImage(proxyUrl, { model, activeCriteria, promptText, referenceImage, outputImage, apiKeys, signal }) {
  const messages = buildJudgeMessages(activeCriteria, { promptText, referenceImage, outputImage });
  const { text, parsed } = await callVisionJson(proxyUrl, model, messages, apiKeys, signal);
  return { ...parseJudgeOutput(parsed, activeCriteria), raw: text };
}

export async function tagImage(proxyUrl, { tagging, referenceImage, apiKeys, signal }) {
  const messages = buildTaggingMessages(tagging, referenceImage);
  const { text, parsed } = await callVisionJson(proxyUrl, tagging.model, messages, apiKeys, signal);
  return { ...parseTaggingOutput(parsed, tagging), raw: text };
}
