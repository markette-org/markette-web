import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { formatError } from '../../core/errors';
import { AnalyticsOverview } from '../../core/models';
import { IconComponent } from '../../shared/components/icon.component';
import { ProviderIconComponent } from '../../shared/components/provider-icon.component';
import { NumPipe } from '../../shared/pipes/num.pipe';

type SharedReport = AnalyticsOverview & { report: { name: string; workspace: string; period: string } };

/** A report shared with a read-only link: no account, no app chrome. */
@Component({
  selector: 'app-shared-report-page',
  imports: [IconComponent, ProviderIconComponent, NumPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="public">
      @if (error()) {
        <div class="card stack center">
          <app-icon name="lock" [size]="28" />
          <h1>Report unavailable</h1>
          <p class="muted">{{ error() }}</p>
        </div>
      } @else if (data(); as d) {
        <header class="row-wrap head">
          <div>
            <div class="eyebrow">{{ d.report.workspace }}</div>
            <h1>{{ d.report.name }}</h1>
            <p class="muted small">{{ d.from }} – {{ d.to }} · {{ d.report.period }}</p>
          </div>
          <span class="spacer"></span>
          <a class="btn" [href]="csvUrl" download><app-icon name="upload" [size]="16" /> Download CSV</a>
        </header>

        <div class="kpis">
          <div class="card kpi"><span class="muted small">Publications</span><strong>{{ d.totals.posts | num }}</strong></div>
          <div class="card kpi"><span class="muted small">Engagements</span><strong>{{ d.totals.engagements | num }}</strong></div>
          <div class="card kpi"><span class="muted small">Impressions</span><strong>{{ d.totals.impressions | num }}</strong></div>
          <div class="card kpi"><span class="muted small">Link clicks</span><strong>{{ d.totals.link_clicks | num }}</strong></div>
        </div>

        <section class="card">
          <h2 class="h">By channel</h2>
          <div class="scroll">
            <table class="table">
              <thead>
                <tr><th>Channel</th><th class="num">Posts</th><th class="num">Impressions</th><th class="num">Engagements</th><th class="num">Link clicks</th></tr>
              </thead>
              <tbody>
                @for (c of d.channels; track c.channel) {
                  <tr>
                    <td><span class="row"><app-provider-icon [provider]="c.provider" [size]="18" /> {{ c.name }}</span></td>
                    <td class="num">{{ c.posts | num }}</td>
                    <td class="num">{{ c.impressions | num }}</td>
                    <td class="num">{{ c.engagements | num }}</td>
                    <td class="num">{{ c.link_clicks | num }}</td>
                  </tr>
                } @empty {
                  <tr><td colspan="5" class="muted">Nothing published in this period.</td></tr>
                }
              </tbody>
            </table>
          </div>
        </section>

        @if (d.top_posts.length) {
          <section class="card stack-sm">
            <h2 class="h">Top publications</h2>
            @for (p of d.top_posts; track $index) {
              <div class="row">
                <app-provider-icon [provider]="p.provider" [size]="18" />
                @if (p.url) {
                  <a [href]="p.url" target="_blank" rel="noopener" class="truncate grow">{{ p.title || 'Untitled' }}</a>
                } @else {
                  <span class="truncate grow">{{ p.title || 'Untitled' }}</span>
                }
                <span class="muted small">{{ p.metrics.engagements ?? 0 | num }} engagements</span>
              </div>
            }
          </section>
        }
        <p class="tiny muted center">Shared from Markette. Numbers are as the networks reported them.</p>
      } @else {
        <div class="center"><span class="spinner"></span></div>
      }
    </main>
  `,
  styles: `
    .public {
      max-width: 960px;
      margin: 0 auto;
      padding: 32px 16px 48px;
      display: grid;
      gap: 16px;
    }
    .center {
      text-align: center;
      justify-items: center;
    }
    .head h1 {
      margin: 4px 0;
    }
    .kpis {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 12px;
    }
    .kpi {
      display: grid;
      gap: 4px;
    }
    .kpi strong {
      font-size: 1.6rem;
    }
    .h {
      font-size: 1rem;
      margin: 0 0 8px;
    }
    .scroll {
      overflow-x: auto;
    }
    .grow {
      flex: 1;
      min-width: 0;
    }
  `,
})
export class SharedReportPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  protected readonly data = signal<SharedReport | null>(null);
  protected readonly error = signal('');
  protected csvUrl = '';

  ngOnInit() {
    const token = this.route.snapshot.paramMap.get('token') ?? '';
    this.csvUrl = this.api.url(`public/reports/${token}/?download=csv`);
    this.api.get<SharedReport>(`public/reports/${token}/`).subscribe({
      next: (d) => this.data.set(d),
      error: (err) => this.error.set(formatError(err, 'This report is no longer shared.')),
    });
  }
}
