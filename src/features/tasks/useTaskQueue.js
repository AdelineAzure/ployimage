import { useState, useEffect, useRef, useCallback } from "react";
import { DEFAULT_API_BASE_URL, IMAGE_MODELS } from "../../config/appConfig";
import { localizeRuntimeMessage } from "../../i18n";
import { setRuntimeConfig } from "../../services/runtimeConfig";
import {
  ensureDirectoryPermission,
  generateImage,
  getApiConfigForModel,
  getResultPromptKey,
  getTurnPromptVariants,
  isAbortError,
  isSameResultTask,
  normalizeAspectRatio,
  normalizeImageInputs,
  saveTurnToLocalFolder,
} from "../../services/appCore";

export function useTaskQueue({ turns, setTurns, apiKeys, historyDirHandle, setHistoryFolderMsg, t }) {
  const [isProcessing, setIsProcessing] = useState(false);
  const controllersRef = useRef({});
  const savingToFolderRef = useRef(new Set());
  const mountedRef = useRef(true);

  const cancelModelTask = useCallback((turnId, modelId, promptKey = "single") => {
    const key = `${turnId}:${modelId}:${promptKey}`;
    const ctl = controllersRef.current[key];
    if (ctl) {
      try { ctl.abort(); } catch {}
      delete controllersRef.current[key];
    }
    setTurns((prev) =>
      prev.map((turnItem) =>
        turnItem.id !== turnId
          ? turnItem
          : {
              ...turnItem,
              results: (Array.isArray(turnItem.results) ? turnItem.results : []).map((r) =>
                isSameResultTask(r, modelId, promptKey) && r.status === "loading"
                  ? { ...r, status: "cancelled", error: t("status.cancelledByUser") }
                  : r
              ),
            }
      )
    );
  }, [setTurns, t]);

  const abortTurnTasks = useCallback((turnId) => {
    Object.keys(controllersRef.current).forEach((key) => {
      if (!key.startsWith(`${turnId}:`)) return;
      try { controllersRef.current[key].abort(); } catch {}
      delete controllersRef.current[key];
    });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      Object.values(controllersRef.current).forEach((controller) => {
        try { controller?.abort?.(); } catch {}
      });
      controllersRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (isProcessing) return;
    const queued = turns.filter((turn) => turn.status === "queued").sort((a, b) => a.seq - b.seq);
    const next = queued[0];
    if (!next) return;

    // Queue progress updates also change `turns`, so this effect must not self-cancel on rerender.
    (async () => {
      if (!mountedRef.current) return;
      setIsProcessing(true);
      try {
        setRuntimeConfig({ apiBaseUrl: next.apiBaseUrl || DEFAULT_API_BASE_URL });
        if (mountedRef.current) {
          setTurns((prev) => prev.map((turn) => (turn.id === next.id ? { ...turn, status: "running", startedAt: Date.now() } : turn)));
        }
        const promptVariants = getTurnPromptVariants(next);
        const promptLookup = new Map(promptVariants.map((variant) => [variant.key, variant]));
        const turnImageInputs = normalizeImageInputs(next.referenceImage, next.styleReferenceImages);
        const resultSeeds =
          Array.isArray(next.results) && next.results.length
            ? next.results
            : promptVariants.flatMap((variant) =>
                (next.selectedModelIds || []).map((modelId) => ({
                  modelId,
                  promptKey: variant.key,
                  promptLabel: variant.label,
                  promptText: variant.prompt || "",
                  requestedCount: next.modelCounts?.[modelId] || 1,
                }))
              );
        const queuedTasks = resultSeeds.map((result) => {
          const promptKey = getResultPromptKey(result);
          const promptVariant = promptLookup.get(promptKey) || promptVariants[0];
          return {
            modelId: result.modelId,
            promptKey,
            promptLabel: result.promptLabel || promptVariant?.label || "PROMPT",
            promptText: typeof result.promptText === "string" ? result.promptText : promptVariant?.prompt || next.prompt || "",
            requestedCount: result.requestedCount || next.modelCounts?.[result.modelId] || 1,
          };
        });

        const patchTaskResult = (task, updater) => {
          if (!mountedRef.current) return;
          setTurns((prev) =>
            prev.map((turn) =>
              turn.id !== next.id
                ? turn
                : {
                    ...turn,
                    results: turn.results.map((result) => {
                      if (!isSameResultTask(result, task.modelId, task.promptKey)) return result;
                      const base = {
                        ...result,
                        promptLabel: task.promptLabel,
                        promptText: task.promptText,
                      };
                      if (typeof updater === "function") return updater(base);
                      return { ...base, ...updater };
                    }),
                  }
            )
          );
        };

        const runQueuedTask = async (task) => {
          const model = IMAGE_MODELS.find((item) => item.id === task.modelId);
          if (!model) {
            patchTaskResult(task, (current) => ({ ...current, status: "error", error: `Model not found: ${task.modelId}` }));
            return;
          }
          const key = `${next.id}:${task.modelId}:${task.promptKey}`;
          const controller = new AbortController();
          controllersRef.current[key] = controller;
          try {
            const requestedCount = Math.max(1, Number(task.requestedCount || next.modelCounts?.[task.modelId] || 1));
            let partialImages = [];
            let lastNonAbortError = null;
            const requestConfig = getApiConfigForModel(model, next.apiKeys || apiKeys);

            for (let index = 0; index < requestedCount; index += 1) {
              try {
                const generated = await generateImage(next.proxyUrl, model, task.promptText, next.referenceImage, {
                  signal: controller.signal,
                  count: 1,
                  ...requestConfig,
                  aspectRatio: normalizeAspectRatio(next.aspectRatio ?? next.geminiAspectRatio),
                  imageInputs: turnImageInputs,
                });
                const nextImage = Array.isArray(generated) && generated.length ? generated[0] : null;
                if (!nextImage) {
                  lastNonAbortError = new Error("No images returned");
                  continue;
                }
                partialImages = [...partialImages, nextImage];
                patchTaskResult(task, (current) => ({
                  ...current,
                  status: "loading",
                  error: null,
                  images: [...(Array.isArray(current.images) ? current.images : []), nextImage],
                }));
              } catch (err) {
                if (isAbortError(err)) throw err;
                lastNonAbortError = err;
              }
            }

            if (!partialImages.length) throw lastNonAbortError || new Error("No images returned");

            patchTaskResult(task, {
              status: "success",
              error: null,
              images: partialImages,
            });
          } catch (err) {
            patchTaskResult(
              task,
              isAbortError(err)
                ? (current) => ({ ...current, status: "cancelled", error: t("status.cancelledByUser") })
                : (current) => ({ ...current, status: "error", error: err?.message || t("common.unknownError") })
            );
          } finally {
            delete controllersRef.current[key];
          }
        };

        const shouldRunQueuedTasksSerially =
          queuedTasks.length > 1 &&
          queuedTasks.some((task) => IMAGE_MODELS.find((item) => item.id === task.modelId)?.apiType === "bailian");

        if (shouldRunQueuedTasksSerially) {
          // Bailian style batches are much less tolerant of many large concurrent requests with shared references.
          for (const task of queuedTasks) {
            await runQueuedTask(task);
          }
        } else {
          await Promise.allSettled(queuedTasks.map((task) => runQueuedTask(task)));
        }

        if (mountedRef.current) {
          setTurns((prev) => prev.map((turn) => (turn.id === next.id ? { ...turn, status: "done", endedAt: Date.now() } : turn)));
        }
      } finally {
        if (mountedRef.current) setIsProcessing(false);
      }
    })();
  }, [apiKeys, isProcessing, setTurns, t, turns]);

  useEffect(() => {
    if (!historyDirHandle) return;
    const pending = turns.filter((turn) => turn.status === "done" && !turn.folderSyncedAt && !savingToFolderRef.current.has(turn.id));
    if (!pending.length) return;

    let cancelled = false;
    (async () => {
      const canWrite = await ensureDirectoryPermission(historyDirHandle, true);
      if (!canWrite) {
        setHistoryFolderMsg(t("history.folderWriteDeniedAutosave"));
        return;
      }

      for (const turn of pending) {
        if (cancelled) return;
        savingToFolderRef.current.add(turn.id);
        try {
          await saveTurnToLocalFolder(historyDirHandle, turn);
          setTurns((prev) => prev.map((item) => (item.id === turn.id ? { ...item, folderSyncedAt: Date.now(), folderSyncError: null } : item)));
          setHistoryFolderMsg(t("history.wroteLocal", { seq: turn.seq }));
        } catch (err) {
          setTurns((prev) =>
            prev.map((item) => (item.id === turn.id ? { ...item, folderSyncError: err?.message || "write failed" } : item))
          );
          setHistoryFolderMsg(t("history.writeLocalFailed", { seq: turn.seq, error: localizeRuntimeMessage(err?.message || t("common.unknownError"), t) }));
        } finally {
          savingToFolderRef.current.delete(turn.id);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [historyDirHandle, setHistoryFolderMsg, setTurns, t, turns]);

  return {
    isProcessing,
    cancelModelTask,
    abortTurnTasks,
  };
}
