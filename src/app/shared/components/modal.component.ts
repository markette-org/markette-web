import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  input,
  output,
  viewChild,
} from '@angular/core';
import { IconComponent } from './icon.component';

let seq = 0;

/**
 * Accessible modal built on <dialog>: focus is trapped by the browser, Escape closes,
 * focus returns to the opener. Render content with <div modal-footer> for the action bar.
 */
@Component({
  selector: 'app-modal',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog
      #dlg
      class="modal {{ size() }}"
      [attr.aria-labelledby]="titleId"
      (cancel)="onCancel($event)"
      (close)="onNativeClose()"
      (click)="onBackdrop($event)"
    >
      <div class="modal-inner">
        <header class="modal-head">
          <div class="head-text">
            <h2 [id]="titleId">{{ title() }}</h2>
            @if (subtitle()) {
              <p class="muted small">{{ subtitle() }}</p>
            }
          </div>
          <button type="button" class="btn ghost icon sm" (click)="close()" aria-label="Close dialog">
            <app-icon name="x" />
          </button>
        </header>
        <div class="modal-body">
          <ng-content />
        </div>
        <footer class="modal-foot">
          <ng-content select="[modal-footer]" />
        </footer>
      </div>
    </dialog>
  `,
  styles: `
    .modal {
      padding: 0;
      border: 1px solid var(--border);
      border-radius: 20px;
      background: var(--surface);
      color: var(--text);
      box-shadow: var(--shadow-lg);
      width: min(560px, calc(100vw - 24px));
      max-height: calc(100dvh - 32px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
      overflow: hidden;
    }
    .modal.lg {
      width: min(820px, calc(100vw - 24px));
    }
    .modal.xl {
      width: min(1100px, calc(100vw - 24px));
    }
    .modal.sm {
      width: min(420px, calc(100vw - 24px));
    }
    .modal[open] {
      animation: pop-in 0.16s var(--ease);
    }
    .modal::backdrop {
      background: rgba(15, 12, 30, 0.45);
      backdrop-filter: blur(2px);
    }
    .modal-inner {
      display: flex;
      flex-direction: column;
      max-height: calc(100dvh - 34px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
    }
    .modal-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      padding: 18px 20px 12px;
    }
    .head-text {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .modal-head h2 {
      font-size: 1.1rem;
    }
    .modal-body {
      padding: 4px 20px 20px;
      overflow-y: auto;
      flex: 1;
    }
    .modal-foot {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 14px 20px;
      border-top: 1px solid var(--border);
      background: var(--surface-2);
      flex-wrap: wrap;
    }
    .modal-foot:empty {
      display: none;
    }
  `,
})
export class ModalComponent {
  readonly open = input(false);
  readonly title = input('');
  readonly subtitle = input('');
  readonly size = input<'sm' | 'md' | 'lg' | 'xl'>('md');
  /** When false, Escape / backdrop clicks do not close (e.g. while saving). */
  readonly dismissible = input(true);
  readonly closed = output<void>();

  protected readonly titleId = `modal-title-${++seq}`;
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  constructor() {
    afterRenderEffect(() => {
      const el = this.dlg().nativeElement;
      if (this.open() && !el.open) el.showModal();
      else if (!this.open() && el.open) el.close();
    });
  }

  close() {
    if (this.dlg().nativeElement.open) this.dlg().nativeElement.close();
    else this.closed.emit();
  }

  protected onCancel(e: Event) {
    if (!this.dismissible()) e.preventDefault();
  }

  protected onNativeClose() {
    if (this.open()) this.closed.emit();
  }

  protected onBackdrop(e: MouseEvent) {
    if (!this.dismissible()) return;
    // Clicks on the ::backdrop target the dialog element itself.
    if (e.target === this.dlg().nativeElement) {
      const r = this.dlg().nativeElement.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) this.close();
    }
  }
}
