import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { formatError } from '../../core/errors';
import { WorkspaceService } from '../../core/workspace.service';

/** Landing page after the identity provider: trades the one-time ticket for tokens. */
@Component({
  selector: 'app-sso-complete-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap" role="status" aria-live="polite">
      <span class="spinner big"></span>
      <p>{{ message() }}</p>
    </div>
  `,
  styles: `
    .wrap {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      color: var(--text-2);
    }
    .big {
      width: 32px;
      height: 32px;
      border-width: 3px;
      color: var(--accent);
    }
  `,
})
export class SsoCompletePage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly ws = inject(WorkspaceService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly message = signal('Signing you in…');

  ngOnInit() {
    const ticket = this.route.snapshot.queryParamMap.get('ticket');
    if (!ticket) {
      this.fail('The sign-in link is incomplete. Please try again.');
      return;
    }
    this.auth.exchangeSsoTicket(ticket).subscribe({
      next: async (r) => {
        this.message.set('Loading your workspaces…');
        this.ws.clear();
        await this.ws.ensureLoaded().catch(() => undefined);
        const next = r.next && r.next.startsWith('/') && !r.next.startsWith('//') ? r.next : '/';
        this.router.navigateByUrl(next, { replaceUrl: true });
      },
      error: (err) => this.fail(formatError(err, 'Single sign-on failed. Please try again.')),
    });
  }

  private fail(message: string) {
    this.router.navigate(['/login'], { queryParams: { sso_error: message }, replaceUrl: true });
  }
}
