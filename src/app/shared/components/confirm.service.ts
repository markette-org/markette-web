import { Injectable, signal } from '@angular/core';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** When set, the user must type this text to enable the confirm button. */
  typeToConfirm?: string;
}

interface Pending extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

/** Promise-based confirmation dialog: `if (await confirm.ask({...})) …` */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly pending = signal<Pending | null>(null);

  ask(opts: ConfirmOptions): Promise<boolean> {
    this.pending()?.resolve(false);
    return new Promise((resolve) => this.pending.set({ ...opts, resolve }));
  }

  settle(ok: boolean) {
    const p = this.pending();
    this.pending.set(null);
    p?.resolve(ok);
  }
}
