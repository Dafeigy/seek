"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

const STORAGE_KEY = "seek:sidebar-compact";

let compactSnapshot = false;
const listeners = new Set<() => void>();

function readStoredCompact() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "true";
}

function notify() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    compactSnapshot = event.newValue === "true";
    notify();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot() {
  return compactSnapshot;
}

function getServerSnapshot() {
  return false;
}

export function useSidebarCompact() {
  const compact = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    const storedCompact = readStoredCompact();
    if (storedCompact !== compactSnapshot) {
      compactSnapshot = storedCompact;
      notify();
    }
  }, []);

  const setCompact = useCallback((value: boolean | ((current: boolean) => boolean)) => {
    const next = typeof value === "function" ? value(compactSnapshot) : value;
    compactSnapshot = next;
    window.localStorage.setItem(STORAGE_KEY, String(next));
    notify();
  }, []);

  return [compact, setCompact] as const;
}
