import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { formatError } from '../../core/errors';
import { Post, PostReview } from '../../core/models';
import { PostsService } from '../../core/posts.service';
import { ToastService } from '../../core/toast.service';
import { WorkspaceService } from '../../core/workspace.service';
import { IconComponent } from '../../shared/components/icon.component';
import { RelativeTimePipe, TzDatePipe } from '../../shared/pipes/tz-date.pipe';
import { ApprovalChipComponent } from './approval-chip.component';

const ACTIONS: Record<PostReview['action'], { icon: string; label: string; cls: string }> = {
  submitted: { icon: 'send', label: 'submitted for review', cls: 'info' },
  approved: { icon: 'check', label: 'approved', cls: 'success' },
  changes_requested: { icon: 'edit', label: 'requested changes', cls: 'danger' },
  reset: { icon: 'refresh', label: 'edited after approval — approval reset', cls: 'muted' },
};

/** Approval status, review history and reviewer actions for one post. */
@Component({
  selector: 'app-approval-panel',
  imports: [FormsModule, RouterLink, IconComponent, ApprovalChipComponent, TzDatePipe, RelativeTimePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let p = post();
    <section class="card approval" [class.attn]="p.approval_status === 'changes_requested' || p.can_review" aria-labelledby="approval-h">
      <div class="card-head">
        <h2 id="approval-h" class="row"><app-icon name="users" [size]="18" /> Review</h2>
        @if (p.approval_status) {
          <app-approval-chip [status]="p.approval_status" />
        } @else if (p.needs_approval) {
          <span class="chip outline">Needs approval before scheduling</span>
        }
      </div>

      @if (p.approval_status === 'changes_requested' && latestChangeRequest(); as r) {
        <div class="notice danger request" role="status">
          <app-icon name="edit" [size]="18" />
          <div class="stack-sm" style="flex: 1">
            <strong>{{ r.user || 'A reviewer' }} asked for changes</strong>
            <p class="pre-wrap">{{ r.comment }}</p>
            @if (ws.canWrite()) {
              <div><a class="btn sm primary" [routerLink]="['/posts', p.id, 'edit']"><app-icon name="edit" [size]="14" /> Edit post</a></div>
            }
          </div>
        </div>
      } @else if (p.approval_status === 'pending') {
        <p class="muted small">
          Waiting for a reviewer{{ p.submitted_by_name ? ' · submitted by ' + p.submitted_by_name : '' }}
          @if (p.submitted_at) {
            <span [attr.title]="p.submitted_at | tzDate">{{ p.submitted_at | relTime }}</span>
          }. Nothing is scheduled until it is approved.
        </p>
      } @else if (p.approval_status === 'approved') {
        <p class="muted small">
          Approved{{ p.reviewed_by_name ? ' by ' + p.reviewed_by_name : '' }}
          @if (p.reviewed_at) {
            <span [attr.title]="p.reviewed_at | tzDate">{{ p.reviewed_at | relTime }}</span>
          }.
          Editing it again sends it back for review.
        </p>
      } @else if (p.needs_approval) {
        <p class="muted small">This post goes to a channel whose team requires approval. Scheduling it submits it to a reviewer.</p>
      }

      @if (p.can_review) {
        <div class="review-box">
          <label for="review-comment" class="label">Your review</label>
          <textarea
            id="review-comment"
            class="textarea"
            rows="3"
            [(ngModel)]="comment"
            [class.invalid]="!!commentError()"
            placeholder="Optional for approval; required when requesting changes"
          ></textarea>
          @if (commentError()) {
            <span class="error small">{{ commentError() }}</span>
          }
          <div class="row-wrap">
            <button type="button" class="btn primary" (click)="approve()" [disabled]="busy()">
              @if (busy() === 'approve') {
                <span class="spinner"></span>
              } @else {
                <app-icon name="check" [size]="16" />
              }
              Approve
            </button>
            <button type="button" class="btn" (click)="requestChanges()" [disabled]="busy()">
              @if (busy() === 'changes') {
                <span class="spinner"></span>
              } @else {
                <app-icon name="edit" [size]="16" />
              }
              Request changes
            </button>
          </div>
        </div>
      }

      @if (reviews().length) {
        <h3 class="h-hist">History</h3>
        <ol class="timeline list-reset">
          @for (r of reviews(); track r.id) {
            <li>
              <span class="dot {{ meta(r).cls }}"><app-icon [name]="meta(r).icon" [size]="12" /></span>
              <div class="stack-sm" style="gap: 2px; min-width: 0">
                <div class="small">
                  <strong>{{ r.user || 'Someone' }}</strong> {{ meta(r).label }}
                  <span class="muted" [attr.title]="r.created_at | tzDate">· {{ r.created_at | relTime }}</span>
                </div>
                @if (r.comment) {
                  <p class="pre-wrap comment">{{ r.comment }}</p>
                }
              </div>
            </li>
          }
        </ol>
      } @else if (loadingReviews()) {
        <div class="skeleton" style="height: 40px; margin-top: 12px"></div>
      }
    </section>
  `,
  styles: `
    .approval.attn {
      border-color: var(--warning);
    }
    .request {
      margin-bottom: 12px;
    }
    .review-box {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 12px;
      padding: 14px;
      border-radius: 12px;
      background: var(--surface-2);
      border: 1px solid var(--border);
    }
    .label {
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--text-2);
    }
    .error {
      color: var(--danger);
    }
    .h-hist {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
      margin: 18px 0 10px;
    }
    .timeline {
      display: flex;
      flex-direction: column;
      gap: 12px;
      position: relative;
    }
    .timeline li {
      display: flex;
      gap: 10px;
      align-items: flex-start;
    }
    .dot {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      flex: none;
      background: var(--bg-sunken);
      color: var(--muted);
    }
    .dot.info {
      background: var(--accent-soft);
      color: var(--accent);
    }
    .dot.success {
      background: var(--success-soft);
      color: var(--success);
    }
    .dot.danger {
      background: var(--danger-soft);
      color: var(--danger);
    }
    .comment {
      font-size: 0.88rem;
      background: var(--surface-2);
      border-radius: 8px;
      padding: 6px 10px;
      word-break: break-word;
    }
  `,
})
export class ApprovalPanelComponent {
  readonly post = input.required<Post>();
  readonly changed = output<Post>();

  protected readonly ws = inject(WorkspaceService);
  private readonly posts = inject(PostsService);
  private readonly toast = inject(ToastService);

  protected readonly reviews = signal<PostReview[]>([]);
  protected readonly loadingReviews = signal(false);
  protected readonly comment = signal('');
  protected readonly commentError = signal('');
  protected readonly busy = signal<'approve' | 'changes' | null>(null);

  protected readonly latestChangeRequest = computed(() =>
    [...this.reviews()].reverse().find((r) => r.action === 'changes_requested') ?? null,
  );

  private lastKey = '';

  constructor() {
    effect(() => {
      const p = this.post();
      const key = `${p.id}:${p.approval_status}:${p.reviewed_at}:${p.submitted_at}:${p.updated_at}`;
      if (key === this.lastKey) return;
      this.lastKey = key;
      untracked(() => this.loadReviews(p.id));
    });
  }

  protected meta(r: PostReview) {
    return ACTIONS[r.action] ?? { icon: 'info', label: r.action, cls: '' };
  }

  private loadReviews(id: number) {
    this.loadingReviews.set(true);
    this.posts.reviews(id).subscribe({
      next: (rows) => {
        this.reviews.set(rows);
        this.loadingReviews.set(false);
      },
      error: () => this.loadingReviews.set(false),
    });
  }

  protected approve() {
    const p = this.post();
    this.commentError.set('');
    this.busy.set('approve');
    this.posts.approve(p.id, this.comment().trim()).subscribe({
      next: (res) => {
        this.busy.set(null);
        this.comment.set('');
        const outcome = res.approval_outcome;
        if (outcome?.scheduled) {
          this.toast.success('Approved and scheduled', 'The publications are now on the calendar.');
        } else if (outcome && outcome.detail !== undefined && outcome.detail !== null && outcome.detail !== '') {
          this.toast.show(
            'warning',
            'Approved, but not scheduled',
            `${formatError(outcome.detail)}\nPick a new time and schedule it again.`,
            { duration: 12000 },
          );
        } else {
          this.toast.success('Approved', 'The author can now schedule it.');
        }
        const { approval_outcome: _ignored, ...post } = res;
        this.changed.emit(post as Post);
      },
      error: (err) => {
        this.busy.set(null);
        this.toast.error('Could not approve', err);
      },
    });
  }

  protected requestChanges() {
    const p = this.post();
    const text = this.comment().trim();
    if (!text) {
      this.commentError.set('Tell the author what to change.');
      return;
    }
    this.commentError.set('');
    this.busy.set('changes');
    this.posts.requestChanges(p.id, text).subscribe({
      next: (post) => {
        this.busy.set(null);
        this.comment.set('');
        this.toast.success('Changes requested', 'The author will see your comment.');
        this.changed.emit(post);
      },
      error: (err) => {
        this.busy.set(null);
        this.toast.error('Could not request changes', err);
      },
    });
  }
}
