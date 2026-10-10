import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { IconComponent } from './icon.component';

/**
 * Expander for the organization's channels that are not marked relevant for this workspace.
 * Usage:
 *   <app-more-channels [count]="catalog.otherChannels().length" [forceOpen]="anyOtherSelected()">
 *     …list of other channels…
 *   </app-more-channels>
 */
@Component({
  selector: 'app-more-channels',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (count() > 0) {
      <div class="more" [class.open]="isOpen()">
        <button type="button" class="more-toggle" (click)="open.set(!isOpen())" [attr.aria-expanded]="isOpen()">
          <app-icon [name]="isOpen() ? 'chevronDown' : 'chevronRight'" [size]="14" />
          <span>{{ label() }}</span>
          <span class="chip">{{ count() }}</span>
        </button>
        @if (isOpen()) {
          <div class="more-body">
            @if (hint()) {
              <p class="muted tiny hint-line">{{ hint() }}</p>
            }
            <ng-content />
          </div>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .more {
      margin-top: 10px;
    }
    .more-toggle {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: 0;
      background: none;
      padding: 4px 2px;
      font: inherit;
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--text-2);
      cursor: pointer;
    }
    .more-toggle:hover {
      color: var(--text);
    }
    .more-toggle .chip {
      height: 20px;
    }
    .more-body {
      margin-top: 8px;
    }
    .hint-line {
      margin-bottom: 8px;
    }
  `,
})
export class MoreChannelsComponent {
  readonly count = input(0);
  readonly label = input('More from your organization');
  readonly hint = input('Usable here too; not marked as relevant for this workspace.');
  /** Open when e.g. one of the hidden channels is selected. */
  readonly forceOpen = input(false);
  readonly startOpen = input(false);

  protected readonly open = signal<boolean | null>(null);
  protected readonly isOpen = computed(() => this.open() ?? (this.forceOpen() || this.startOpen()));

  constructor() {
    // Once forced open (a hidden channel got selected), stay open.
    effect(() => {
      if (this.forceOpen() && this.open() === false) this.open.set(true);
    });
  }
}
