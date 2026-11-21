import type { AnalysisService } from '../analysis/analysis.service';
import { telegramMessages, type TelegramLanguage } from './telegram-messages';

type Report = Awaited<ReturnType<AnalysisService['report']>>;

function timecode(seconds: number): string {
  const milliseconds = Math.round(seconds * 1000);
  const h = Math.floor(milliseconds / 3_600_000);
  const m = Math.floor(milliseconds / 60_000) % 60;
  const s = Math.floor(milliseconds / 1000) % 60;
  const ms = milliseconds % 1000;
  return `${[h, m, s].map((part) => String(part).padStart(2, '0')).join(':')}.${String(ms).padStart(3, '0')}`;
}

export function formatTelegramReport(report: Report, language: TelegramLanguage) {
  const messages = telegramMessages[language];
  const title = report.video.title || report.video.sourceUrl;
  const shortTitle = Array.from(title).slice(0, 140).join('');
  const header = [
    report.video.sourceUrl,
    `${messages.profile}: ${report.profile.name}, ${messages.version} ${report.profile.version}`,
    `${messages.verdict}: ${messages.conclusions[report.conclusion]}`,
  ];
  const counts = { PASS: 0, FAIL: 0, WARNING: 0, ERROR: 0, SKIPPED: 0 };
  for (const { status } of report.checks) counts[status]++;
  const summary = Object.entries(counts).map(([status, count]) =>
    `${messages.statuses[status as keyof typeof counts]}: ${count}`,
  );
  const details = report.checks.flatMap((check) => [
    '',
    `${check.checkType}: ${messages.statuses[check.status]}`,
    check.details,
    `${messages.measured}: ${JSON.stringify(check.measuredValue)}`,
    `${messages.expected}: ${JSON.stringify(check.expectedValue)}`,
    ...(check.evidence.length ? [messages.timecodes] : []),
    ...check.evidence.map((evidence) =>
      `${timecode(evidence.timestamp)}  ${evidence.problemType}  ${evidence.details}  ${JSON.stringify(evidence.measuredValue)}`,
    ),
  ]);
  return {
    caption: [shortTitle, ...header, `${messages.checks}: ${summary.join(' · ')}`, messages.report].join('\n'),
    document: [title, ...header, `${messages.checks}: ${summary.join(' · ')}`, ...details, ''].join('\n'),
  };
}
