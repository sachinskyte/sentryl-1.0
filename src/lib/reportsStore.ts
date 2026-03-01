// Shared localStorage store for vulnerability reports
// This replaces the Supabase 'reports' table for local-only operation.

const REPORTS_KEY = 'sentryl_reports';

export type Report = {
  id: string;
  title: string;
  description: string;
  company: string;
  website: string | null;
  vulnerability_type: string | null;
  affected_urls: string | null;
  risk_level: string;
  status: string;
  user_id: string;
  submitter_name: string;
  created_at: string;
  bounty?: number;
};

export function getAllReports(): Report[] {
  try {
    const raw = localStorage.getItem(REPORTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveAllReports(reports: Report[]): void {
  localStorage.setItem(REPORTS_KEY, JSON.stringify(reports));
}

export function insertReport(data: Omit<Report, 'id' | 'created_at'>): Report {
  const reports = getAllReports();
  const newReport: Report = {
    ...data,
    id: `report-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    created_at: new Date().toISOString(),
  };
  reports.unshift(newReport);
  saveAllReports(reports);
  return newReport;
}

export function updateReportStatus(reportId: string, newStatus: string): void {
  const reports = getAllReports();
  const idx = reports.findIndex(r => r.id === reportId);
  if (idx !== -1) {
    reports[idx].status = newStatus;
    saveAllReports(reports);
  }
}

export function getReportsByUserId(userId: string): Report[] {
  return getAllReports().filter(r => r.user_id === userId);
}

export function getRecentReports(limit = 5): Report[] {
  return getAllReports().slice(0, limit);
}
