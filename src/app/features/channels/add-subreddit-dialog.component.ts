import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CatalogService } from '../../core/catalog.service';
import { formatError } from '../../core/errors';
import { Channel } from '../../core/models';
import { RedditService } from '../../core/reddit.service';
import { ToastService } from '../../core/toast.service';
import { ModalComponent } from '../../shared/components/modal.component';

/** Adds a specific subreddit as a channel, reusing the Reddit account of an existing channel. */
@Component({
  selector: 'app-add-subreddit-dialog',
  imports: [FormsModule, ModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal
      [open]="!!channel()"
      title="Add subreddit"
      [subtitle]="'Posts as u/' + username() + ' — one channel per subreddit.'"
      size="sm"
      (closed)="closed.emit()"
      [dismissible]="!busy()"
    >
      <form id="add-sr" class="stack" (ngSubmit)="submit()" novalidate>
        <div class="field">
          <label for="sr-name">Subreddit</label>
          <input id="sr-name" name="name" class="input" [ngModel]="name()" (ngModelChange)="name.set($event); error.set('')" placeholder="python, r/python or a reddit.com link" autocomplete="off" autocapitalize="off" spellcheck="false" />
          <span class="hint">You need permission to post there; the subreddit's rules, flairs and post types are loaded with it.</span>
        </div>
        @if (error()) {
          <div class="form-error" role="alert">{{ error() }}</div>
        }
      </form>
      <div modal-footer>
        <button type="button" class="btn" (click)="closed.emit()" [disabled]="busy()">Cancel</button>
        <button type="submit" form="add-sr" class="btn primary" [disabled]="busy() || !name().trim()">
          @if (busy()) {
            <span class="spinner"></span>
          }
          Add subreddit
        </button>
      </div>
    </app-modal>
  `,
})
export class AddSubredditDialogComponent {
  readonly channel = input<Channel | null>(null);
  readonly closed = output<void>();

  private readonly reddit = inject(RedditService);
  private readonly catalog = inject(CatalogService);
  private readonly toast = inject(ToastService);

  protected readonly name = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  constructor() {
    effect(() => {
      if (this.channel()) {
        this.name.set('');
        this.error.set('');
      }
    });
  }

  protected username(): string {
    const ch = this.channel();
    return (ch?.config?.['username'] as string) || ch?.handle?.replace(/^u\//, '') || 'you';
  }

  protected submit() {
    const ch = this.channel();
    const name = this.name().trim();
    if (!ch || !name) return;
    this.busy.set(true);
    this.error.set('');
    this.reddit.addSubreddit(ch.id, name).subscribe({
      next: (created) => {
        this.busy.set(false);
        this.catalog.upsertChannel(created);
        const sr = (created.config?.['subreddit'] as string) || created.name;
        this.toast.success(`r/${sr.replace(/^r\//, '')} added`, 'It is now a channel you can publish to.');
        this.closed.emit();
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(formatError(err));
      },
    });
  }
}
