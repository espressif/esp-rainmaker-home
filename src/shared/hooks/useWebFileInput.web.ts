/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import {
  DATA_TRANSFER_DROP_EFFECT_COPY,
  DOM_DRAG_DROP_LISTENER_OPTIONS,
  DOM_EVENT_DRAG_ENTER,
  DOM_EVENT_DRAG_LEAVE,
  DOM_EVENT_DRAG_OVER,
  DOM_EVENT_DROP,
  WEB_EMBED_MESSAGE_FILE_DROP,
} from "@shared/utils/constants";
import {
  getDataTransferPlainText,
  getFirstDataTransferFile,
} from "@shared/utils/webDataTransfer.web";

const DOM_EVENT_PASTE = "paste";
const DOM_EVENT_MESSAGE = "message";
const HTML_TAG_INPUT = "INPUT";
const HTML_TAG_TEXTAREA = "TEXTAREA";

/**
 * Per-screen plug-ins for {@link useWebFileInput}. Only these change between
 * provision QR and config scan; the paste/drop/postMessage plumbing is shared.
 */
export interface UseWebFileInputAdapter {
  /** Reads a picked / dropped / pasted file into the raw string to apply. */
  readFromFile: (file: File) => Promise<string>;
  /** Reads the system clipboard (image or text) into the raw string to apply. */
  readFromClipboard: () => Promise<string>;
  /** Whether a file should be handled as an image even inside a text field. */
  isImageFile: (file: File) => boolean;
  /** Maps a caught error to a user-visible (translated) string. */
  mapError: (error: unknown) => string;
  /** User-visible error when the trimmed input is empty. */
  emptyErrorText: string;
}

export interface UseWebFileInputReturn {
  draft: string;
  setDraft: (value: string) => void;
  isDragging: boolean;
  isDecoding: boolean;
  localError: string;
  fileName: string;
  fileInputRef: RefObject<HTMLInputElement | null>;
  handleChooseFile: () => void;
  handleFileChange: (event: {
    target: { files?: FileList | null; value: string };
  }) => void;
  handlePasteFromClipboard: () => Promise<void>;
  handleApply: () => Promise<void>;
  clearLocalError: () => void;
}

/**
 * Whether the paste target is a text field that should receive the paste itself
 * (so the user's Cmd/Ctrl+V into the textarea works normally).
 */
function isTextFieldTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return (
    tag === HTML_TAG_TEXTAREA ||
    tag === HTML_TAG_INPUT ||
    target.isContentEditable
  );
}

/**
 * Whether a window `message` payload is a forwarded file drop from the
 * `/embed` phone-frame host.
 */
function isEmbedFileDropMessage(data: unknown): data is { file: File } {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  if (!("type" in data) || !("file" in data)) {
    return false;
  }
  return data.type === WEB_EMBED_MESSAGE_FILE_DROP && data.file instanceof File;
}

/**
 * Blocks the browser's default file navigation and marks the drag as a copy.
 */
function preventFileNavigation(event: DragEvent): void {
  event.preventDefault();
  event.stopPropagation();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = DATA_TRANSFER_DROP_EFFECT_COPY;
  }
}

/**
 * Shared web input plumbing for paste, drag+drop, file picker, `/embed`
 * postMessage forwarding, and a raw-text textarea. Each screen supplies the
 * per-domain readers, image predicate, and error strings via `adapter`.
 * `enabled=false` gates the paste/drop/message pipeline (e.g. while
 * connecting) but leaves button-driven handlers (clipboard, file picker,
 * apply) responsive.
 * @param onScan - Applies a resolved raw value string to the screen's flow.
 * @param adapter - Per-screen plug-ins.
 * @param enabled - When false, ignores window-level paste/drop/message.
 * @returns Draft field, drop-zone flags, and input handlers.
 */
export function useWebFileInput(
  onScan: (value: string) => Promise<void>,
  adapter: UseWebFileInputAdapter,
  enabled: boolean = true,
): UseWebFileInputReturn {
  const [draft, setDraft] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isDecoding, setIsDecoding] = useState(false);
  const [localError, setLocalError] = useState("");
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);
  const submittingFileRef = useRef(false);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const adapterRef = useRef(adapter);
  adapterRef.current = adapter;

  const clearLocalError = useCallback(() => {
    setLocalError("");
  }, []);

  const submitValue = useCallback(async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setLocalError(adapterRef.current.emptyErrorText);
      return;
    }
    setLocalError("");
    await onScanRef.current(trimmed);
  }, []);

  const submitFile = useCallback(async (file: File) => {
    if (!enabledRef.current || submittingFileRef.current) {
      return;
    }
    submittingFileRef.current = true;
    setIsDecoding(true);
    setLocalError("");
    setFileName(file.name);
    try {
      const value = await adapterRef.current.readFromFile(file);
      await onScanRef.current(value);
    } catch (error) {
      setLocalError(adapterRef.current.mapError(error));
    } finally {
      submittingFileRef.current = false;
      setIsDecoding(false);
    }
  }, []);

  const submitFileRef = useRef(submitFile);
  submitFileRef.current = submitFile;
  const submitValueRef = useRef(submitValue);
  submitValueRef.current = submitValue;

  useEffect(() => {
    /** Cmd/Ctrl+V: images always, text only when not typing in a field. */
    const handleWindowPaste = (event: ClipboardEvent) => {
      if (!enabledRef.current) {
        return;
      }
      const file = getFirstDataTransferFile(event.clipboardData);
      if (file && adapterRef.current.isImageFile(file)) {
        event.preventDefault();
        void submitFileRef.current(file);
        return;
      }
      if (isTextFieldTarget(event.target)) {
        return;
      }
      if (file) {
        event.preventDefault();
        void submitFileRef.current(file);
        return;
      }
      const text = getDataTransferPlainText(event.clipboardData);
      if (text) {
        event.preventDefault();
        void submitValueRef.current(text);
      }
    };

    const handleDragEnter = (event: DragEvent) => {
      if (!enabledRef.current) {
        return;
      }
      preventFileNavigation(event);
      dragDepthRef.current += 1;
      setIsDragging(true);
    };

    /** Must preventDefault on dragover or the browser never fires `drop`. */
    const handleDragOver = (event: DragEvent) => {
      if (!enabledRef.current) {
        return;
      }
      preventFileNavigation(event);
    };

    const handleDragLeave = (event: DragEvent) => {
      event.preventDefault();
      dragDepthRef.current -= 1;
      if (dragDepthRef.current <= 0) {
        dragDepthRef.current = 0;
        setIsDragging(false);
      }
    };

    const handleWindowDrop = (event: DragEvent) => {
      if (!enabledRef.current) {
        return;
      }
      preventFileNavigation(event);
      dragDepthRef.current = 0;
      setIsDragging(false);
      const file = getFirstDataTransferFile(event.dataTransfer);
      if (file) {
        void submitFileRef.current(file);
      }
    };

    /**
     * Accepts a file forwarded from the `/embed` phone-frame host.
     * Origin check is intentional: refuse anything not from our own origin.
     */
    const handleHostFileMessage = (event: MessageEvent) => {
      if (!enabledRef.current) {
        return;
      }
      if (event.origin !== window.location.origin) {
        return;
      }
      if (!isEmbedFileDropMessage(event.data)) {
        return;
      }
      void submitFileRef.current(event.data.file);
    };

    window.addEventListener(DOM_EVENT_PASTE, handleWindowPaste);
    window.addEventListener(
      DOM_EVENT_DRAG_ENTER,
      handleDragEnter,
      DOM_DRAG_DROP_LISTENER_OPTIONS,
    );
    window.addEventListener(
      DOM_EVENT_DRAG_OVER,
      handleDragOver,
      DOM_DRAG_DROP_LISTENER_OPTIONS,
    );
    window.addEventListener(
      DOM_EVENT_DRAG_LEAVE,
      handleDragLeave,
      DOM_DRAG_DROP_LISTENER_OPTIONS,
    );
    window.addEventListener(
      DOM_EVENT_DROP,
      handleWindowDrop,
      DOM_DRAG_DROP_LISTENER_OPTIONS,
    );
    window.addEventListener(DOM_EVENT_MESSAGE, handleHostFileMessage);

    return () => {
      window.removeEventListener(DOM_EVENT_PASTE, handleWindowPaste);
      window.removeEventListener(
        DOM_EVENT_DRAG_ENTER,
        handleDragEnter,
        DOM_DRAG_DROP_LISTENER_OPTIONS,
      );
      window.removeEventListener(
        DOM_EVENT_DRAG_OVER,
        handleDragOver,
        DOM_DRAG_DROP_LISTENER_OPTIONS,
      );
      window.removeEventListener(
        DOM_EVENT_DRAG_LEAVE,
        handleDragLeave,
        DOM_DRAG_DROP_LISTENER_OPTIONS,
      );
      window.removeEventListener(
        DOM_EVENT_DROP,
        handleWindowDrop,
        DOM_DRAG_DROP_LISTENER_OPTIONS,
      );
      window.removeEventListener(DOM_EVENT_MESSAGE, handleHostFileMessage);
    };
  }, []);

  const handleChooseFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (event: { target: { files?: FileList | null; value: string } }) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (file) {
        void submitFile(file);
      }
    },
    [submitFile],
  );

  const handlePasteFromClipboard = useCallback(async () => {
    setIsDecoding(true);
    setLocalError("");
    try {
      const value = await adapterRef.current.readFromClipboard();
      await onScanRef.current(value);
    } catch (error) {
      setLocalError(adapterRef.current.mapError(error));
    } finally {
      setIsDecoding(false);
    }
  }, []);

  const handleApply = useCallback(async () => {
    await submitValue(draft);
  }, [draft, submitValue]);

  return {
    draft,
    setDraft,
    isDragging,
    isDecoding,
    localError,
    fileName,
    fileInputRef,
    handleChooseFile,
    handleFileChange,
    handlePasteFromClipboard,
    handleApply,
    clearLocalError,
  };
}
