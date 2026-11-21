import { requestError, RequestError } from '../../core/i18n/request-error';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';
import { MessageParamsPipe } from '../../core/i18n/message-params.pipe';

import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { DecimalPipe, JsonPipe } from '@angular/common';

import { AnalysisApiService } from '../../core/services/analysis-api.service';
import { AnalysisReportDto } from '../../api/generated/models/analysis-report-dto';

@Component({
  selector: 'vqa-analysis-report',
  standalone: true,
  imports: [TranslocoPipe, MessageParamsPipe, DecimalPipe, JsonPipe],
  templateUrl: './analysis-report.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalysisReportComponent implements OnInit {
  readonly language = inject(LanguageService);

  readonly runId = input.required<string>();

  readonly report = signal<AnalysisReportDto | null>(null);
  readonly loading = signal(false);
  readonly error = signal<RequestError | null>(null);

  private readonly api = inject(AnalysisApiService);

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);

    this.api.report(this.runId()).subscribe({
      next: report => {
        this.report.set(report);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(requestError(error, 'errors.loadReport'));
        this.loading.set(false);
      },
    });
  }
}
