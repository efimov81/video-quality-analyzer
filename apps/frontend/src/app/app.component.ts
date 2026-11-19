import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'vqa-root',
  standalone: true,
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {}
