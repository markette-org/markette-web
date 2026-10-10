import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent } from './icon.component';

@Component({
  selector: 'app-empty-state',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty">
      <div class="empty-icon"><app-icon [name]="icon()" [size]="26" /></div>
      <h3>{{ title() }}</h3>
      @if (text()) {
        <p>{{ text() }}</p>
      }
      <div class="row-wrap" style="justify-content: center"><ng-content /></div>
    </div>
  `,
})
export class EmptyStateComponent {
  readonly icon = input('inbox');
  readonly title = input.required<string>();
  readonly text = input('');
}
