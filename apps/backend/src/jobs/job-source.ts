export const jobSources = ['web', 'telegram', 'mcp'] as const;
export type JobSource = (typeof jobSources)[number];
export const defaultJobSource: JobSource = 'web';
