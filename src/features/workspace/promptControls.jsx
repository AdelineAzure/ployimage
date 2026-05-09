import { useRef, useCallback, useEffect } from "react";
import { PROMPT_EDITOR_MIN_HEIGHT } from "../../config/appConfig";
import { splitPromptByPlaceholders } from "../../services/appCore";
import { S } from "../../styles/appStyles";

export function PromptTextWithChips({ text }) {
  const chunks = splitPromptByPlaceholders(text);
  if (!chunks.length) return <span>(no prompt)</span>;
  return (
    <>
      {chunks.map((chunk, idx) => (
        chunk.type === "placeholder"
          ? <span key={`ph-${idx}`} style={S.promptChipReadonly}>{chunk.value || " "}</span>
          : <span key={`tx-${idx}`}>{chunk.value}</span>
      ))}
    </>
  );
}

export function getPromptPreviewText(text, maxChars = 220) {
  const source = typeof text === "string" ? text : "";
  if (!source) return "";
  if (source.length <= maxChars) return source;
  return `${source.slice(0, maxChars).trimEnd()}…`;
}

export function TokenPromptInput({ value, onChange, onKeyDown, onFocus, placeholder, rows = 4, editorRef }) {
  const rootRef = useRef(null);
  const selfUpdateRef = useRef(false);
  const internalValueRef = useRef(typeof value === "string" ? value : "");
  const activeChipRef = useRef(null);
  const selectionSnapshotRef = useRef(null);
  const zeroWidth = "\u200b";

  const setChipEditingState = useCallback((chip, editing) => {
    if (!chip) return;
    chip.contentEditable = editing ? "true" : "false";
    chip.style.background = editing ? "rgba(59,130,246,0.34)" : "rgba(59,130,246,0.24)";
    chip.style.borderColor = editing ? "rgba(147,197,253,0.95)" : "rgba(96,165,250,0.65)";
  }, []);

  const deactivateAllChips = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const chips = root.querySelectorAll('[data-placeholder-chip="1"]');
    chips.forEach((chip) => setChipEditingState(chip, false));
    activeChipRef.current = null;
  }, [setChipEditingState]);

  const renderValueToDom = useCallback((nextValue) => {
    const root = rootRef.current;
    if (!root) return;
    root.innerHTML = "";
    const chunks = splitPromptByPlaceholders(nextValue);
    if (!chunks.length) return;
    chunks.forEach((chunk) => {
      if (chunk.type === "placeholder") {
        const span = document.createElement("span");
        span.setAttribute("data-placeholder-chip", "1");
        span.style.background = "rgba(59,130,246,0.24)";
        span.style.color = "#bfdbfe";
        span.style.border = "1px solid rgba(96,165,250,0.65)";
        span.style.borderRadius = "6px";
        span.style.padding = "1px 6px";
        span.style.display = "inline-block";
        span.style.minWidth = "12px";
        span.style.margin = "0 1px";
        span.contentEditable = "false";
        span.textContent = chunk.value || zeroWidth;
        root.appendChild(span);
        return;
      }
      root.appendChild(document.createTextNode(chunk.value));
    });
  }, []);

  const serializeDomToValue = useCallback(() => {
    const root = rootRef.current;
    if (!root) return "";
    const out = [];
    const walk = (node) => {
      if (!node) return;
      if (node.nodeType === Node.TEXT_NODE) {
        out.push(node.textContent || "");
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const element = node;
      if (element.hasAttribute("data-placeholder-chip")) {
        const raw = (element.textContent || "").replaceAll(zeroWidth, "");
        out.push(`{{${raw}}}`);
        return;
      }
      const tag = element.tagName;
      if (tag === "BR") {
        out.push("\n");
        return;
      }
      const childNodes = Array.from(element.childNodes);
      childNodes.forEach((child) => walk(child));
      if (tag === "DIV" || tag === "P") out.push("\n");
    };
    Array.from(root.childNodes).forEach((child) => walk(child));
    return out.join("").replace(/\n{3,}/g, "\n\n");
  }, []);

  const getNodeTextLength = useCallback((node) => {
    if (!node) return 0;
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent?.length || 0;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return 0;
    const element = node;
    if (element.hasAttribute?.("data-placeholder-chip")) {
      const raw = (element.textContent || "").replaceAll(zeroWidth, "");
      return raw.length + 4;
    }
    if (element.tagName === "BR") return 1;
    let total = 0;
    Array.from(element.childNodes).forEach((child) => {
      total += getNodeTextLength(child);
    });
    if (element.tagName === "DIV" || element.tagName === "P") total += 1;
    return total;
  }, []);

  const getSelectionOffset = useCallback((boundaryNode, boundaryOffset) => {
    const root = rootRef.current;
    if (!root || !boundaryNode) return 0;
    let total = 0;
    const walk = (node) => {
      if (node === boundaryNode) {
        if (node.nodeType === Node.TEXT_NODE) {
          total += Math.min(boundaryOffset, node.textContent?.length || 0);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const children = Array.from(node.childNodes);
          for (let i = 0; i < Math.min(boundaryOffset, children.length); i += 1) {
            total += getNodeTextLength(children[i]);
          }
        }
        return true;
      }
      if (node.nodeType === Node.TEXT_NODE) {
        total += node.textContent?.length || 0;
        return false;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return false;
      const element = node;
      if (element.hasAttribute?.("data-placeholder-chip")) {
        if (element.contains(boundaryNode)) {
          if (boundaryNode.nodeType === Node.TEXT_NODE) {
            const rawLength = (boundaryNode.textContent || "").replaceAll(zeroWidth, "").length;
            total += 2 + Math.min(boundaryOffset, rawLength);
          } else {
            total += Math.min(boundaryOffset, 1) > 0 ? getNodeTextLength(element) : 0;
          }
          return true;
        }
        total += getNodeTextLength(element);
        return false;
      }
      if (element.tagName === "BR") {
        total += 1;
        return false;
      }
      const children = Array.from(element.childNodes);
      for (const child of children) {
        if (walk(child)) return true;
      }
      if (element.tagName === "DIV" || element.tagName === "P") {
        total += 1;
      }
      return false;
    };
    walk(root);
    return total;
  }, [getNodeTextLength]);

  const captureSelectionSnapshot = useCallback(() => {
    const root = rootRef.current;
    const selection = window.getSelection();
    if (!root || !selection || !selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
    return {
      start: getSelectionOffset(range.startContainer, range.startOffset),
      end: getSelectionOffset(range.endContainer, range.endOffset),
    };
  }, [getSelectionOffset]);

  const restoreSelectionSnapshot = useCallback((snapshot) => {
    const root = rootRef.current;
    const selection = window.getSelection();
    if (!root || !selection || !snapshot) return;
    const resolveBoundary = (targetOffset) => {
      let remaining = Math.max(0, targetOffset);
      const walk = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const textLength = node.textContent?.length || 0;
          if (remaining <= textLength) return { node, offset: remaining };
          remaining -= textLength;
          return null;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return null;
        const element = node;
        if (element.hasAttribute?.("data-placeholder-chip")) {
          const firstChild = element.firstChild;
          const logicalLength = getNodeTextLength(element);
          if (remaining <= logicalLength) {
            const rawLength = firstChild?.textContent?.replaceAll?.(zeroWidth, "").length ?? 0;
            const innerOffset = Math.max(0, Math.min(rawLength, remaining >= 2 ? remaining - 2 : 0));
            return firstChild
              ? { node: firstChild, offset: innerOffset }
              : { node: element, offset: 0 };
          }
          remaining -= logicalLength;
          return null;
        }
        if (element.tagName === "BR") {
          if (remaining <= 1) {
            const parent = element.parentNode;
            if (!parent) return { node: root, offset: root.childNodes.length };
            const index = Array.from(parent.childNodes).indexOf(element);
            return { node: parent, offset: Math.max(0, index) };
          }
          remaining -= 1;
          return null;
        }
        const children = Array.from(element.childNodes);
        for (const child of children) {
          const found = walk(child);
          if (found) return found;
        }
        if (element.tagName === "DIV" || element.tagName === "P") {
          if (remaining <= 1) return { node: element, offset: element.childNodes.length };
          remaining -= 1;
        }
        return null;
      };
      return walk(root) || { node: root, offset: root.childNodes.length };
    };

    const start = resolveBoundary(snapshot.start);
    const end = resolveBoundary(snapshot.end);
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    selection.removeAllRanges();
    selection.addRange(range);
  }, [getNodeTextLength]);

  const moveCaretInside = useCallback((element) => {
    if (!element) return;
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    const textNode = element.firstChild;
    if (!textNode) {
      element.appendChild(document.createTextNode(zeroWidth));
    }
    const target = element.firstChild;
    const len = target?.textContent?.length || 0;
    range.setStart(target, len);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }, []);

  const syncValueFromDom = useCallback(() => {
    const root = rootRef.current;
    if (root) {
      const chips = root.querySelectorAll('[data-placeholder-chip="1"]');
      chips.forEach((chip) => {
        if (!chip.textContent || chip.textContent.length === 0) {
          chip.textContent = zeroWidth;
        }
      });
    }
    const next = serializeDomToValue();
    internalValueRef.current = next;
    selfUpdateRef.current = true;
    onChange?.(next);
  }, [onChange, serializeDomToValue]);

  const getSelectionSnapshot = useCallback((fallbackToEnd = false) => {
    const snapshot = captureSelectionSnapshot();
    if (snapshot) {
      return {
        start: Math.min(snapshot.start, snapshot.end),
        end: Math.max(snapshot.start, snapshot.end),
      };
    }
    if (!fallbackToEnd) return null;
    const end = serializeDomToValue().length;
    return { start: end, end };
  }, [captureSelectionSnapshot, serializeDomToValue]);

  const replaceTextAtSelection = useCallback((insertText, snapshot) => {
    const root = rootRef.current;
    if (!root || !snapshot) return;
    const current = serializeDomToValue();
    const start = Math.max(0, Math.min(snapshot.start, current.length));
    const end = Math.max(start, Math.min(snapshot.end, current.length));
    const normalizedInsert = typeof insertText === "string" ? insertText.replace(/\r\n?/g, "\n") : "";
    const next = `${current.slice(0, start)}${normalizedInsert}${current.slice(end)}`;
    const caret = start + normalizedInsert.length;

    internalValueRef.current = next;
    selfUpdateRef.current = true;
    renderValueToDom(next);
    onChange?.(next);
    requestAnimationFrame(() => {
      restoreSelectionSnapshot({ start: caret, end: caret });
    });
  }, [onChange, renderValueToDom, restoreSelectionSnapshot, serializeDomToValue]);

  const focusEditor = useCallback((options = {}) => {
    const root = rootRef.current;
    if (!root) return;
    try {
      root.focus({ preventScroll: options.preventScroll ?? true });
    } catch {
      root.focus();
    }
    if (options.selectAll) {
      requestAnimationFrame(() => {
        restoreSelectionSnapshot({ start: 0, end: internalValueRef.current.length });
      });
      return;
    }
    if (options.end !== false) {
      requestAnimationFrame(() => {
        const end = internalValueRef.current.length;
        restoreSelectionSnapshot({ start: end, end });
      });
    }
  }, [restoreSelectionSnapshot]);

  const findChipBeforeCaret = useCallback((range) => {
    const root = rootRef.current;
    if (!root || !range) return null;
    const container = range.startContainer;
    const offset = range.startOffset;

    const isChip = (node) =>
      node &&
      node.nodeType === Node.ELEMENT_NODE &&
      node.hasAttribute &&
      node.hasAttribute("data-placeholder-chip");

    if (container === root) {
      const prev = root.childNodes[offset - 1];
      return isChip(prev) ? prev : null;
    }

    if (container.nodeType === Node.TEXT_NODE) {
      if (offset > 0) return null;
      const prev = container.previousSibling;
      if (isChip(prev)) return prev;
      return null;
    }

    if (container.nodeType === Node.ELEMENT_NODE) {
      const prev = container.childNodes[offset - 1];
      return isChip(prev) ? prev : null;
    }

    return null;
  }, []);

  const insertPlaceholderAtCaret = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    root.focus();
    deactivateAllChips();
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) {
      renderValueToDom(`${internalValueRef.current}{{}}`);
      internalValueRef.current = `${internalValueRef.current}{{}}`;
      onChange?.(internalValueRef.current);
      return;
    }
    const range = selection.getRangeAt(0);
    if (!root.contains(range.startContainer)) {
      const end = document.createRange();
      end.selectNodeContents(root);
      end.collapse(false);
      selection.removeAllRanges();
      selection.addRange(end);
    }
    const placeholderChip = document.createElement("span");
    placeholderChip.setAttribute("data-placeholder-chip", "1");
    placeholderChip.style.background = "rgba(59,130,246,0.24)";
    placeholderChip.style.color = "#bfdbfe";
    placeholderChip.style.border = "1px solid rgba(96,165,250,0.65)";
    placeholderChip.style.borderRadius = "6px";
    placeholderChip.style.padding = "1px 6px";
    placeholderChip.style.display = "inline-block";
    placeholderChip.style.minWidth = "12px";
    placeholderChip.style.margin = "0 1px";
    placeholderChip.contentEditable = "false";
    placeholderChip.textContent = zeroWidth;

    const liveRange = selection.getRangeAt(0);
    liveRange.deleteContents();
    liveRange.insertNode(placeholderChip);
    const after = document.createRange();
    after.setStartAfter(placeholderChip);
    after.collapse(true);
    selection.removeAllRanges();
    selection.addRange(after);
    const next = serializeDomToValue();
    internalValueRef.current = next;
    selfUpdateRef.current = true;
    onChange?.(next);
  }, [deactivateAllChips, onChange, renderValueToDom, serializeDomToValue]);

  const handleEditorKeyDown = useCallback((event) => {
    const root = rootRef.current;
    const selection = window.getSelection();
    const range = selection && selection.rangeCount ? selection.getRangeAt(0) : null;

    if (root && range && selection && selection.isCollapsed) {
      const startNode = range.startContainer.nodeType === Node.ELEMENT_NODE
        ? range.startContainer
        : range.startContainer.parentElement;
      const currentChip = startNode?.closest?.('[data-placeholder-chip="1"]');

      if ((event.key === "Backspace" || event.key === "Delete") && currentChip && root.contains(currentChip)) {
        const text = (currentChip.textContent || "").replaceAll(zeroWidth, "");
        if (text.length <= 1) {
          event.preventDefault();
          currentChip.textContent = zeroWidth;
          moveCaretInside(currentChip);
          syncValueFromDom();
          return;
        }
      }

      if (event.key === "Backspace" && !currentChip) {
        const chipBeforeCaret = findChipBeforeCaret(range);
        if (chipBeforeCaret && root.contains(chipBeforeCaret)) {
          event.preventDefault();
          const parent = chipBeforeCaret.parentNode;
          if (parent) {
            const index = Array.from(parent.childNodes).indexOf(chipBeforeCaret);
            chipBeforeCaret.remove();
            const nextRange = document.createRange();
            const safeOffset = Math.max(0, Math.min(index, parent.childNodes.length));
            nextRange.setStart(parent, safeOffset);
            nextRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(nextRange);
            syncValueFromDom();
          }
          return;
        }
      }
    }

    onKeyDown?.(event);
  }, [findChipBeforeCaret, moveCaretInside, onKeyDown, syncValueFromDom, zeroWidth]);

  useEffect(() => {
    if (selfUpdateRef.current) {
      selfUpdateRef.current = false;
      return;
    }
    const normalized = typeof value === "string" ? value : "";
    if (normalized === internalValueRef.current) return;
    const snapshot = captureSelectionSnapshot();
    internalValueRef.current = normalized;
    renderValueToDom(normalized);
    if (snapshot) {
      requestAnimationFrame(() => {
        restoreSelectionSnapshot(snapshot);
      });
    }
  }, [captureSelectionSnapshot, renderValueToDom, restoreSelectionSnapshot, value]);

  useEffect(() => {
    renderValueToDom(internalValueRef.current);
  }, [renderValueToDom]);

  const handleClick = useCallback((event) => {
    const root = rootRef.current;
    if (!root) return;
    const selection = window.getSelection();
    if (
      selection &&
      selection.rangeCount &&
      !selection.isCollapsed
    ) {
      const range = selection.getRangeAt(0);
      if (root.contains(range.startContainer) && root.contains(range.endContainer)) {
        return;
      }
    }
    const target = event.target instanceof Element ? event.target : null;
    const chip = target?.closest?.('[data-placeholder-chip="1"]');
    if (chip && root.contains(chip)) {
      deactivateAllChips();
      setChipEditingState(chip, true);
      activeChipRef.current = chip;
      moveCaretInside(chip);
      return;
    }
    deactivateAllChips();
  }, [deactivateAllChips, moveCaretInside, setChipEditingState]);

  useEffect(() => {
    if (!editorRef) return;
    editorRef.current = {
      insertPlaceholder: insertPlaceholderAtCaret,
      focus: focusEditor,
    };
    return () => {
      if (editorRef.current?.insertPlaceholder === insertPlaceholderAtCaret) {
        editorRef.current = null;
      }
    };
  }, [editorRef, focusEditor, insertPlaceholderAtCaret]);

  const handleInput = useCallback(() => {
    syncValueFromDom();
  }, [syncValueFromDom]);

  const handlePaste = useCallback((event) => {
    const clipboard = event.clipboardData || window.clipboardData;
    const text = clipboard?.getData("text/plain") || clipboard?.getData("text") || "";
    if (typeof text !== "string" || !text) return;
    event.preventDefault();
    focusEditor({ end: false });
    replaceTextAtSelection(text, getSelectionSnapshot(true));
  }, [focusEditor, getSelectionSnapshot, replaceTextAtSelection]);

  const handleCopy = useCallback((event) => {
    const snapshot = getSelectionSnapshot(false);
    if (!snapshot || snapshot.start === snapshot.end) return;
    const text = serializeDomToValue().slice(snapshot.start, snapshot.end);
    if (!text) return;
    const clipboard = event.clipboardData || window.clipboardData;
    if (!clipboard) return;
    clipboard.setData("text/plain", text);
    event.preventDefault();
  }, [getSelectionSnapshot, serializeDomToValue]);

  const handleCut = useCallback((event) => {
    const snapshot = getSelectionSnapshot(false);
    if (!snapshot || snapshot.start === snapshot.end) return;
    const text = serializeDomToValue().slice(snapshot.start, snapshot.end);
    if (!text) return;
    const clipboard = event.clipboardData || window.clipboardData;
    if (!clipboard) return;
    clipboard.setData("text/plain", text);
    event.preventDefault();
    replaceTextAtSelection("", snapshot);
  }, [getSelectionSnapshot, replaceTextAtSelection, serializeDomToValue]);

  const fixedHeight = Math.max(PROMPT_EDITOR_MIN_HEIGHT, rows * 24);

  return (
    <div
      ref={rootRef}
      contentEditable
      suppressContentEditableWarning
      onInput={handleInput}
      onPaste={handlePaste}
      onCopy={handleCopy}
      onCut={handleCut}
      onKeyDown={handleEditorKeyDown}
      onClick={handleClick}
      onBlur={(event) => {
        const nextFocus = event.relatedTarget;
        if (!nextFocus || !(nextFocus instanceof Node) || !rootRef.current?.contains(nextFocus)) {
          deactivateAllChips();
        }
      }}
      onFocus={onFocus}
      data-placeholder={placeholder}
      style={{ ...S.tokenEditor, height: fixedHeight, maxHeight: fixedHeight, overflowY: "auto" }}
    />
  );
}
