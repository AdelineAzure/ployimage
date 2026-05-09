import { useState, useRef, useCallback } from "react";

export function useUndoRedoText(initialValue = "") {
  const [value, setValue] = useState(initialValue);
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);

  const setText = useCallback((nextValue, options = {}) => {
    const { record = true } = options;
    setValue((prev) => {
      const resolved = typeof nextValue === "function" ? nextValue(prev) : nextValue;
      const normalized = typeof resolved === "string" ? resolved : String(resolved ?? "");
      if (record && normalized !== prev) {
        undoStackRef.current.push(prev);
        if (undoStackRef.current.length > 200) undoStackRef.current.shift();
        redoStackRef.current = [];
      }
      return normalized;
    });
  }, []);

  const resetText = useCallback((nextValue = "") => {
    const normalized = typeof nextValue === "string" ? nextValue : String(nextValue ?? "");
    undoStackRef.current = [];
    redoStackRef.current = [];
    setValue(normalized);
  }, []);

  const undo = useCallback(() => {
    setValue((prev) => {
      if (!undoStackRef.current.length) return prev;
      const next = undoStackRef.current.pop();
      redoStackRef.current.push(prev);
      return next;
    });
  }, []);

  const redo = useCallback(() => {
    setValue((prev) => {
      if (!redoStackRef.current.length) return prev;
      const next = redoStackRef.current.pop();
      undoStackRef.current.push(prev);
      return next;
    });
  }, []);

  const handleKeyDown = useCallback((event) => {
    const withMeta = event.metaKey || event.ctrlKey;
    if (!withMeta || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === "z" && !event.shiftKey) {
      event.preventDefault();
      undo();
      return;
    }
    if (key === "y" || (key === "z" && event.shiftKey)) {
      event.preventDefault();
      redo();
    }
  }, [redo, undo]);

  return { value, setText, resetText, undo, redo, handleKeyDown };
}
