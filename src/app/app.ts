import { ChangeDetectionStrategy, Component, afterNextRender, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NativeAppService } from './core/native/native-app.service';
import { ConfirmHostComponent } from './shared/components/confirm-host.component';
import { ShareProgressComponent } from './shared/components/share-progress.component';
import { ToastHostComponent } from './shared/components/toast-host.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastHostComponent, ConfirmHostComponent, ShareProgressComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <router-outlet />
    <app-share-progress />
    <app-toast-host />
    <app-confirm-host />
  `,
})
export class App {
  private native = inject(NativeAppService);

  constructor() {
    this.native.init();
    afterNextRender(() => this.native.hideSplash());
  }
}
