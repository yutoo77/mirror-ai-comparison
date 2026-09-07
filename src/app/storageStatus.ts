import { useSyncExternalStore } from 'react';

let storageError: string | null = null;
const listeners = new Set<() => void>();
const getSnapshot = () => storageError;
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Surface quota/security failures without discarding the live, still-exportable workspace. */
export function persistWorkspace(key: string, value: unknown): void {
  let next: string | null = null;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    next =
      'このブラウザに保存できていません。容量不足や保存制限の可能性があります。このタブを閉じず、「バックアップと復元」から必要なWorkspaceを書き出してください。';
  }
  reportStorageError(next);
}

export function reportStorageError(next: string | null): void {
  if (next !== storageError) {
    storageError = next;
    listeners.forEach((listener) => listener());
  }
}

export function useStorageError() {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
