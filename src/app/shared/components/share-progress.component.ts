import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ShareIntakeService } from '../../core/native/share-intake.service';

/** Upload progress while files shared from another app are attached. */
@Component({
  selector: 'app-share-progress',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (share.progress(); as p) {
      <div class="share-progress" role="status" aria-live="polite">
        <span class="spinner"></span>
        <div class="txt">
          <strong>Preparing your draft</strong>
          <span class="small muted">
            @if (p.total) {
              Uploading {{ p.done + 1 > p.total ? p.total : p.done + 1 }} of {{ p.total }}{{ p.current ? ' · ' + p.current : '' }}
            } @else {
              Opening the composer…
            }
          </span>
          <span class="bar"><span [style.width.%]="p.total ? (p.done / p.total) * 100 : 100"></span></span>
        </div>
      </div>
    }
  `,
  styles: `
    .share-progress {
      position: fixed;
      left: 50%;
      bottom: calc(20px + env(safe-area-inset-bottom, 0px));
      transform: translateX(-50%);
      z-index: 1001;
      display: flex;
      gap: 12px;
      align-items: center;
      width: min(360px, calc(100vw - 32px));
      padding: 12px 14px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      box-shadow: var(--shadow-md);
    }
    .txt {
      display: flex;
      flex-direction: column;
      gap: 4px;
      flex: 1;
      min-width: 0;
    }
    .bar {
      height: 4px;
      border-radius: 2px;
      background: var(--bg-sunken);
      overflow: hidden;
    }
    .bar span {
      display: block;
      height: 100%;
      background: var(--accent);
      transition: width 0.2s;
    }
  `,
})
export class ShareProgressComponent {
  protected readonly share = inject(ShareIntakeService);
}
