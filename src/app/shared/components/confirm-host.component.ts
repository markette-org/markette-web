import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmService } from './confirm.service';
import { ModalComponent } from './modal.component';

@Component({
  selector: 'app-confirm-host',
  imports: [ModalComponent, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (confirm.pending(); as p) {
      <app-modal [open]="true" [title]="p.title" size="sm" (closed)="confirm.settle(false)">
        @if (p.message) {
          <p class="pre-wrap muted">{{ p.message }}</p>
        }
        @if (p.typeToConfirm) {
          <div class="field" style="margin-top: 14px">
            <label for="confirm-type">Type <strong>{{ p.typeToConfirm }}</strong> to confirm</label>
            <input id="confirm-type" class="input" [(ngModel)]="typed" autocomplete="off" />
          </div>
        }
        <div modal-footer>
          <button type="button" class="btn" (click)="confirm.settle(false)">{{ p.cancelLabel || 'Cancel' }}</button>
          <button
            type="button"
            class="btn"
            [class.danger]="p.danger"
            [class.primary]="!p.danger"
            [disabled]="!!p.typeToConfirm && typed() !== p.typeToConfirm"
            (click)="typed.set(''); confirm.settle(true)"
          >
            {{ p.confirmLabel || 'Confirm' }}
          </button>
        </div>
      </app-modal>
    }
  `,
})
export class ConfirmHostComponent {
  protected readonly confirm = inject(ConfirmService);
  protected readonly typed = signal('');
}
