// 探针：走 app 真正用的链路（前端 → worker → lumina），确认 ratio 是否仍生效。
// 只读。用法: LUMINA_KEY=sk-xxx node scripts/probe-via-worker.mjs
const KEY = process.env.LUMINA_KEY;
if (!KEY) { console.error("缺少 LUMINA_KEY"); process.exit(1); }
const PROXY = process.env.PROXY || "https://polyimage.adelineazures.workers.dev";
const MODEL = process.env.MODEL || "gemini-2.5-flash-image-preview";

function imgSize(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return { w: "?", h: "?" };
}
async function toBuf(item) {
  if (item?.b64_json) return Buffer.from(item.b64_json, "base64");
  if (item?.url) return Buffer.from(await (await fetch(item.url)).arrayBuffer());
  return null;
}
async function gen(label, extra) {
  const res = await fetch(PROXY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Target-Path": "/v1/images/generations",
      "X-Upstream-Base": "https://lumina.tripo3d.com",
      "X-Api-Key": KEY,
    },
    body: JSON.stringify({ model: MODEL, prompt: "a red apple on white table", n: 1, ...extra }),
  });
  const txt = await res.text();
  if (!res.ok) { console.log(`[${label}] HTTP ${res.status}: ${txt.slice(0, 200)}`); return; }
  const buf = await toBuf(JSON.parse(txt)?.data?.[0]);
  const { w, h } = imgSize(buf);
  console.log(`[${label}] ${JSON.stringify(extra).padEnd(20)} -> ${w} x ${h} (${w > h ? "横" : w < h ? "竖" : "方"})`);
}
console.log(`走 worker: ${PROXY}\n模型: ${MODEL}`);
await gen("ratio16:9", { ratio: "16:9" });
