import { Injectable, signal } from '@angular/core';
import { formatError } from './errors';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
  action?: { label: string; run: () => void };
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private seq = 0;
  readonly toasts = signal<Toast[]>([]);

  show(kind: ToastKind, title: string, message?: string, opts: { duration?: number; action?: Toast['action'] } = {}) {
    const id = ++this.seq;
    this.toasts.update((list) => [...list.slice(-4), { id, kind, title, message, action: opts.action }]);
    const duration = opts.duration ?? (kind === 'error' ? 8000 : 4500);
    if (duration > 0) setTimeout(() => this.dismiss(id), duration);
    return id;
  }

  success(title: string, message?: string) {
    return this.show('success', title, message);
  }
  info(title: string, message?: string) {
    return this.show('info', title, message);
  }
  warning(title: string, message?: string) {
    return this.show('warning', title, message);
  }
  error(title: string, err?: unknown) {
    return this.show('error', title, err === undefined ? undefined : typeof err === 'string' ? err : formatError(err));
  }

  dismiss(id: number) {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
