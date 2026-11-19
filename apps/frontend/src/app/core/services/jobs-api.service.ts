import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { JobsService } from '../../api/generated/services/jobs.service';
import { Job } from '../../api/generated/models/job';

@Injectable({ providedIn: 'root' })
export class JobsApiService {
  private readonly jobs = inject(JobsService);

  list(): Observable<Job[]> {
    return this.jobs.jobsControllerList();
  }

  create(sourceUrl: string): Observable<Job> {
    return this.jobs.jobsControllerCreate({ body: { sourceUrl } });
  }
}
