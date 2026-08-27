// src/protocol.ts
var NdjsonReader = class {
  buffer = "";
  push(chunk) {
    this.buffer += chunk;
    const out = [];
    let index;
    while ((index = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, index).replace(/\r$/, "");
      this.buffer = this.buffer.slice(index + 1);
      if (line.trim()) out.push(parseLine(line));
    }
    return out;
  }
  /** Call on process exit: the last line may have no trailing newline. */
  flush() {
    const line = this.buffer.replace(/\r$/, "");
    this.buffer = "";
    return line.trim() ? [parseLine(line)] : [];
  }
};
function parseLine(line) {
  try {
    return { ok: true, event: JSON.parse(line) };
  } catch (e) {
    return { ok: false, raw: line, error: e instanceof Error ? e.message : String(e) };
  }
}
function isInit(e) {
  return e.type === "system" && e.subtype === "init";
}
function isResult(e) {
  return e.type === "result";
}
function textDelta(e) {
  if (e.type !== "stream_event") return null;
  const delta = e.event?.delta;
  return delta?.type === "text_delta" && typeof delta.text === "string" ? delta.text : null;
}
function assistantText(e) {
  if (e.type !== "assistant") return null;
  const parts = e.message?.content;
  if (!Array.isArray(parts)) return null;
  const text = parts.filter((p) => p?.type === "text" && typeof p.text === "string").map((p) => p.text).join("");
  return text || null;
}
export {
  NdjsonReader,
  assistantText,
  isInit,
  isResult,
  textDelta
};
