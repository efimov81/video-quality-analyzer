import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { AnalysisService } from '../../api/generated/services/analysis.service';
import { AnalysisSummaryDto } from '../../api/generated/models/analysis-summary-dto';
import { AnalysisReportDto } from '../../api/generated/models/analysis-report-dto';

@Injectable({ providedIn: 'root' })
export class AnalysisApiService {
  private readonly api = inject(AnalysisService);

  list(): Observable<AnalysisSummaryDto[]> {
    return this.api.analysisControllerList();
  }

  report(runId: string): Observable<AnalysisReportDto> {
    return this.api.analysisControllerReport({ id: runId });
  }
}
