// 落盘/载入往返：验证 Step 7 的字段白名单和 Step 0 的 item id 修复。
// 用内存假实现顶掉 File System Access API（Node 里没有）。
import { describe, expect, it, vi } from "vitest";

// fileToDataUrlFromFile 走 FileReader；Node 里没有，用最小实现补上。
class FakeFileReader {
  readAsDataURL(blob) {
    blob.arrayBuffer().then((buf) => {
      const b64 = Buffer.from(buf).toString("base64");
      this.result = `data:${blob.type || "image/png"};base64,${b64}`;
      this.onload?.();
    });
  }
}
vi.stubGlobal("FileReader", FakeFileReader);

const { saveChatToLocalFolder, loadChatFromLocalFolder } = await import(
  "./appCore.js"
);

function makeDir(name = "root") {
  const files = new Map();
  const dirs = new Map();
  const handle = {
    kind: "directory",
    name,
    async getDirectoryHandle(n, opts) {
      if (!dirs.has(n)) {
        if (!opts?.create) {
          const err = new Error("not found");
          err.name = "NotFoundError";
          throw err;
        }
        dirs.set(n, makeDir(n));
      }
      return dirs.get(n);
    },
    async getFileHandle(n, opts) {
      if (!files.has(n)) {
        if (!opts?.create) {
          const err = new Error("not found");
          err.name = "NotFoundError";
          throw err;
        }
        files.set(n, { data: new Uint8Array() });
      }
      const entry = files.get(n);
      return {
        kind: "file",
        name: n,
        async createWritable() {
          const chunks = [];
          return {
            async write(c) { chunks.push(c); },
            async close() {
              if (typeof chunks[0] === "string") entry.data = chunks.join("");
              else entry.data = chunks[0] ?? new Uint8Array();
            },
          };
        },
        async getFile() {
          const d = entry.data;
          const bytes = typeof d === "string" ? new TextEncoder().encode(d) : d;
          return {
            type: n.endsWith(".png") ? "image/png" : "application/json",
            async text() { return typeof d === "string" ? d : new TextDecoder().decode(d); },
            async arrayBuffer() { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); },
          };
        },
      };
    },
    async *entries() {
      for (const [n, h] of dirs) yield [n, h];
      for (const [n] of files) yield [n, { kind: "file", name: n }];
    },
    _files: files,
    _dirs: dirs,
  };
  return handle;
}

const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";

describe("chat record persistence round-trip", () => {
  it("preserves text-detection fields and per-item ids", async () => {
    const root = makeDir();
    const record = {
      id: 1730000000001,
      seq: 7,
      createdAt: 1730000000000,
      model: "qwen3-vl-30b-a3b-instruct",
      templateId: "detect-template-3",
      templateTitle: "尺寸检查",
      resultField: "verdict",
      prompt: "判断是否合规",
      items: [
        {
          id: "item-green",
          image: "",
          text: "甲样本",
          expected: "不通过",
          resultValue: "不通过",
          outputText: '{"verdict":"不通过","reason":"尺寸不符"}',
          status: "done",
          error: null,
          rating: "green",
          autoRated: true,
          parseFailed: false,
        },
        {
          id: "item-amber",
          image: "",
          text: "乙样本",
          expected: "不通过",
          resultValue: "",
          outputText: '{"reason":"字段名写错了"}',
          status: "done",
          error: null,
          rating: null,
          autoRated: false,
          parseFailed: true,
        },
      ],
      folderSyncedAt: null,
    };

    const saved = await saveChatToLocalFolder(root, record);
    expect(saved.folderSyncedAt).toBeTruthy();

    const [loaded] = await loadChatFromLocalFolder(root);
    expect(loaded.resultField).toBe("verdict");
    expect(loaded.items).toHaveLength(2);

    const [a, b] = loaded.items;
    // Step 0：item id 必须活过往返，否则评级会命中整条记录
    expect(a.id).toBe("item-green");
    expect(b.id).toBe("item-amber");
    // Step 7：文本检测字段
    expect(a.text).toBe("甲样本");
    expect(a.expected).toBe("不通过");
    expect(a.resultValue).toBe("不通过");
    expect(a.rating).toBe("green");
    expect(a.autoRated).toBe(true);
    expect(b.parseFailed).toBe(true);
    expect(b.rating).toBeNull();
    // 契约未兑现的那条不能被写成红
    expect(b.rating).not.toBe("red");
  });

  it("round-trips multi-value expected and the note field", async () => {
    // 数组形状（多个可接受值）被落盘白名单吞掉的话，刷新后「任一个对就算对」就变成单值比对。
    const root = makeDir();
    await saveChatToLocalFolder(root, {
      id: 77,
      seq: 2,
      createdAt: 9,
      resultField: "tag",
      compareFields: ["tag"],
      prompt: "分类",
      items: [
        {
          id: "multi",
          image: "",
          text: '{"user_text":"Dançar."}',
          note: "跳舞。（葡萄牙语）",
          expected: { name: "Solo Dance", tag: ["Scene Specific", "Emotional"] },
          resultValue: "Scene Specific",
          outputText: '{"name":"Solo Dance","tag":"Scene Specific"}',
          status: "done",
          rating: "green",
          autoRated: true,
          parseFailed: false,
          fields: [{ key: "tag", expected: "Scene Specific | Emotional", accepts: 2, actual: "Scene Specific", judged: true, match: true }],
        },
      ],
    });

    const [loaded] = await loadChatFromLocalFolder(root);
    expect(loaded.compareFields).toEqual(["tag"]);
    const item = loaded.items[0];
    expect(item.note).toBe("跳舞。（葡萄牙语）");
    // 数组必须原样活过往返
    expect(item.expected.tag).toEqual(["Scene Specific", "Emotional"]);
    expect(item.expected.name).toBe("Solo Dance");
    expect(item.fields[0].accepts).toBe(2);
    expect(item.rating).toBe("green");
  });

  it("keeps image records working and derives ids for legacy items that lack them", async () => {
    const root = makeDir();
    await saveChatToLocalFolder(root, {
      id: 42,
      seq: 1,
      createdAt: 1,
      prompt: "看图",
      items: [{ id: "x1", image: PNG_DATA_URL, outputText: "ok", status: "done", rating: null }],
    });

    // 模拟磁盘上已有的旧记录：手动抹掉 item.id
    const chatRoot = await root.getDirectoryHandle("chat-history");
    const [dirName] = [...chatRoot._dirs.keys()];
    const dir = await chatRoot.getDirectoryHandle(dirName);
    const fh = await dir.getFileHandle("chat.json");
    const meta = JSON.parse(await (await fh.getFile()).text());
    delete meta.items[0].id;
    const w = await fh.createWritable();
    await w.write(JSON.stringify(meta));
    await w.close();

    const [loaded] = await loadChatFromLocalFolder(root);
    // 按下标派生、稳定可复现（不是随机值）
    expect(loaded.items[0].id).toBe("42-0");
    expect(loaded.items[0].image).toContain("data:image/png;base64,");
    expect(loaded.items[0].outputText).toBe("ok");

    const [again] = await loadChatFromLocalFolder(root);
    expect(again.items[0].id).toBe(loaded.items[0].id);
  });

  it("survives a v2 file written before text detection existed", async () => {
    const root = makeDir();
    const chatRoot = await root.getDirectoryHandle("chat-history", { create: true });
    const dir = await chatRoot.getDirectoryHandle("chat-0001-999", { create: true });
    // 老格式：没有 text/expected/resultValue/resultField/id
    const legacy = {
      version: 2,
      id: 999,
      seq: 1,
      createdAt: 5,
      model: "qwen3-vl-30b-a3b-instruct",
      templateId: "detect-template-1",
      templateTitle: "旧模版",
      prompt: "旧指令",
      items: [{ imageFile: null, outputText: "旧输出", status: "done", error: null, rating: "red" }],
    };
    const fh = await dir.getFileHandle("chat.json", { create: true });
    const w = await fh.createWritable();
    await w.write(JSON.stringify(legacy));
    await w.close();

    const [loaded] = await loadChatFromLocalFolder(root);
    expect(loaded.prompt).toBe("旧指令");
    expect(loaded.resultField).toBe("result"); // 缺失时回落默认
    expect(loaded.items[0].rating).toBe("red"); // 旧评级不丢
    expect(loaded.items[0].text).toBe("");
    expect(loaded.items[0].parseFailed).toBe(false);
    expect(loaded.items[0].id).toBe("999-0");
  });
});
