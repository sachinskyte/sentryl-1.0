import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { getAllReports, updateReportStatus } from '@/lib/reportsStore';
import VulnerabilityDetails from '@/components/Dashboard/VulnerabilityDetails';
import { useQueryClient } from '@tanstack/react-query';

// Adapter: reportsStore Report → VulnerabilityFeed Report shape
const toFeedReport = (r: ReturnType<typeof getAllReports>[number]) => ({
  id: r.id,
  title: r.title,
  company: r.company,
  risk_level: r.risk_level as any,
  status: r.status as any,
  submitter_name: r.submitter_name,
  created_at: r.created_at,
  description: r.description,
});

const AdminReportDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // First try sessionStorage (set by SubmittedReports navigate), then fall back to full scan
  let report: ReturnType<typeof getAllReports>[number] | undefined;
  try {
    const fromSession = sessionStorage.getItem('reportDetails');
    if (fromSession) {
      const parsed = JSON.parse(fromSession);
      if (parsed.id === id) report = parsed;
    }
  } catch { /* ignore */ }

  if (!report) {
    report = getAllReports().find(r => r.id === id);
  }

  if (!report) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-400">Report not found.</p>
        <button
          className="mt-4 cyber-button-outline px-4 py-2 text-sm"
          onClick={() => navigate('/admin')}
        >
          Back to Admin
        </button>
      </div>
    );
  }

  const handleClose = () => {
    sessionStorage.removeItem('reportDetails');
    navigate('/admin');
  };

  const handleStatusUpdate = () => {
    queryClient.invalidateQueries({ queryKey: ['adminReports'] });
    queryClient.invalidateQueries({ queryKey: ['recentReports'] });
    // Reload the report from store so the UI reflects the new status
    const updated = getAllReports().find(r => r.id === id);
    if (updated) {
      sessionStorage.setItem('reportDetails', JSON.stringify(updated));
    }
  };

  return (
    <div className="p-4 animate-fade-in">
      <button
        className="flex items-center text-cyber-teal hover:text-white mb-6 transition-colors"
        onClick={handleClose}
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Admin
      </button>

      <VulnerabilityDetails
        report={toFeedReport(report)}
        onClose={handleClose}
        onStatusUpdate={handleStatusUpdate}
      />
    </div>
  );
};

export default AdminReportDetail;
