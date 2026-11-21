import type { CreateJobDto } from '../../api/generated/models/create-job-dto';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { JobsService } from '../../api/generated/services/jobs.service';
import { JobResponseDto } from '../../api/generated/models/job-response-dto';
import { JobDetailsDto } from '../../api/generated/models/job-details-dto';

@Injectable({ providedIn: 'root' })
export class JobsApiService {
  private readonly jobs = inject(JobsService);

  list(): Observable<JobDetailsDto[]> {
    return this.jobs.jobsControllerList();
  }

  create(body: CreateJobDto): Observable<JobResponseDto> {
    return this.jobs.jobsControllerCreate({ body });
  }
}
