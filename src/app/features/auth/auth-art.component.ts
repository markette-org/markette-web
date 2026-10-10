import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PlatformInfoService } from '../../core/platform-info.service';
import { ProviderIconComponent } from '../../shared/components/provider-icon.component';

@Component({
  selector: 'app-auth-art',
  imports: [ProviderIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `
    <div class="floating">
      <div class="float-card">
        <app-provider-icon provider="linkedin" [size]="30" />
        <div><div class="t">Tue 09:10 · LinkedIn</div><div class="s">Best time for your audience</div></div>
      </div>
      <div class="float-card">
        <app-provider-icon provider="instagram" [size]="30" />
        <div><div class="t">Tue 19:40 · Instagram</div><div class="s">Engagement peaks after work</div></div>
      </div>
      <div class="float-card">
        <app-provider-icon provider="mastodon" [size]="30" />
        <div><div class="t">Wed 12:30 · Mastodon</div><div class="s">Queued · next free slot</div></div>
      </div>
    </div>
    <h2>Write once. Land everywhere, at the right moment.</h2>
    <p>{{ name() }} publishes to social networks and blogs, picks the best time for each audience, and shows you what worked.</p>
  `,
  styleUrl: './auth-art.scss',
})
export class AuthArtComponent {
  protected readonly name = inject(PlatformInfoService).instanceName;
}
