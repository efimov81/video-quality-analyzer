import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';

import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';

import { JobResponseDto } from '../../api/generated/models/job-response-dto';
import { AnalysisSummaryDto } from '../../api/generated/models/analysis-summary-dto';
import { AnalysisReportComponent } from '../analysis-report/analysis-report.component';

@Component({
  selector: 'vqa-video-card',
  standalone: true,
  imports: [TranslocoPipe, DatePipe, AnalysisReportComponent],
  templateUrl: './video-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideoCardComponent {
  readonly language = inject(LanguageService);

  readonly job = input.required<JobResponseDto>();
  readonly ownerName = input<string | null>(null);
  readonly runs = input<AnalysisSummaryDto[]>([]);

  readonly selectedRunId = signal<string | null>(null);

  toggleReport(runId: string): void {
    this.selectedRunId.update(current => current === runId ? null : runId);
  }
}
