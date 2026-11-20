
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { JsonPipe } from '@angular/common';

import { AnalysisApiService } from '../../core/services/analysis-api.service';
import { AnalysisReportDto } from '../../api/generated/models/analysis-report-dto';

@Component({
  selector: 'vqa-analysis-report',
  standalone: true,
  imports: [JsonPipe],
  templateUrl: './analysis-report.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalysisReportComponent implements OnInit {
  readonly runId = input.required<string>();

  readonly report = signal<AnalysisReportDto | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');

  private readonly api = inject(AnalysisApiService);

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set('');

    this.api.report(this.runId()).subscribe({
      next: report => {
        this.report.set(report);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load analysis report.');
        this.loading.set(false);
      },
    });
  }
}
