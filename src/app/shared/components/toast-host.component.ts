import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../../core/toast.service';
import { IconComponent } from './icon.component';

const ICON = { success: 'check', error: 'alert', info: 'info', warning: 'alert' } as const;

@Component({
  selector: 'app-toast-host',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toasts" aria-live="polite" aria-relevant="additions" role="status">
      @for (t of toast.toasts(); track t.id) {
        <div class="toast {{ t.kind }}" [attr.role]="t.kind === 'error' ? 'alert' : null">
          <span class="ic"><app-icon [name]="icon[t.kind]" [size]="16" /></span>
          <div class="body">
            <div class="title">{{ t.title }}</div>
            @if (t.message) {
              <div class="msg">{{ t.message }}</div>
            }
            @if (t.action) {
              <button type="button" class="link-btn small" (click)="t.action.run(); toast.dismiss(t.id)">{{ t.action.label }}</button>
            }
          </div>
          <button type="button" class="close" (click)="toast.dismiss(t.id)" aria-label="Dismiss notification">
            <app-icon name="x" [size]="14" />
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    .toasts {
      position: fixed;
      right: calc(20px + env(safe-area-inset-right, 0px));
      bottom: calc(20px + env(safe-area-inset-bottom, 0px));
      z-index: 1000;
      display: flex;
      flex-direction: column;
      gap: 10px;
      width: min(380px, calc(100vw - 32px));
      pointer-events: none;
    }
    .toast {
      pointer-events: auto;
      display: flex;
      gap: 12px;
      align-items: flex-start;
      padding: 12px 12px 12px 14px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      box-shadow: var(--shadow-md);
      animation: pop-in 0.18s var(--ease);
    }
    .ic {
      width: 28px;
      height: 28px;
      border-radius: 9px;
      display: grid;
      place-items: center;
      flex: none;
    }
    .success .ic {
      background: var(--success-soft);
      color: var(--success);
    }
    .error .ic {
      background: var(--danger-soft);
      color: var(--danger);
    }
    .info .ic {
      background: var(--accent-soft);
      color: var(--accent);
    }
    .warning .ic {
      background: var(--warning-soft);
      color: var(--warning);
    }
    .body {
      flex: 1;
      min-width: 0;
      padding-top: 3px;
    }
    .title {
      font-weight: 700;
      font-size: 0.9rem;
    }
    .msg {
      font-size: 0.85rem;
      color: var(--text-2);
      white-space: pre-line;
      word-break: break-word;
      margin-top: 2px;
    }
    .close {
      border: 0;
      background: transparent;
      color: var(--muted);
      cursor: pointer;
      padding: 4px;
      border-radius: 6px;
    }
    .close:hover {
      background: var(--surface-hover);
    }
  `,
})
export class ToastHostComponent {
  protected readonly toast = inject(ToastService);
  protected readonly icon = ICON;
}
