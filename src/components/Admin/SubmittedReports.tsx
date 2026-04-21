import React, { useState } from "react";
import {
  AlertTriangle,
  Check,
  X,
  Eye,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getAllReports, updateReportStatus } from "@/lib/reportsStore";

type Report = {
  id: string;
  title: string;
  company: string;
  website: string | null;
  vulnerability_type: string | null;
  affected_urls: string | null;
  risk_level: string;
  status: string;
  submitter_name: string;
  created_at: string;
  user_id: string;
  description: string;
  fraud_score?: number | null;
  fraud_label?: "low" | "medium" | "high" | null;
  priority_score?: number | null;
  ml_status?: "ok" | "unavailable" | "failed_closed";
};

const SubmittedReports: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const {
    data: reports = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["adminReports", selectedUserId],
    queryFn: async (): Promise<Report[]> => {
      let data = getAllReports() as Report[];
      if (selectedUserId) {
        data = data.filter((r) => r.user_id === selectedUserId);
      }
      return data;
    },
    refetchInterval: 5000,
  });

  const { data: userIds = [] } = useQuery({
    queryKey: ["uniqueReportUsers"],
    queryFn: async () => {
      const data = getAllReports();
      const userMap = new Map<string, string>();
      data.forEach((report) => {
        if (report.user_id && !userMap.has(report.user_id)) {
          userMap.set(report.user_id, report.submitter_name);
        }
      });
      return Array.from(userMap.entries()).map(([id, name]) => ({
        id,
        name: name || "Unknown User",
      }));
    },
  });

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
      toast({
        title: "Reports Refreshed",
        description: "The latest reports have been loaded",
      });
    } catch (error) {
      console.error("Manual refresh error:", error);
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const handleStatusChange = async (reportId: string, newStatus: string) => {
    try {
      updateReportStatus(reportId, newStatus);
      queryClient.invalidateQueries({ queryKey: ["adminReports"] });
      queryClient.invalidateQueries({ queryKey: ["recentReports"] });
      toast({
        title: "Status Updated",
        description: `Report status changed to ${newStatus}`,
      });
    } catch (error: any) {
      console.error("Error updating report status:", error);
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update report status",
        variant: "destructive",
      });
    }
  };

  const handleViewDetails = (report: Report) => {
    sessionStorage.setItem("reportDetails", JSON.stringify(report));
    navigate(`/admin/report/${report.id}`);
  };

  const getSeverityBadgeClass = (severity: string) => {
    switch (severity.toLowerCase()) {
      case "critical":
        return "bg-red-500/20 text-red-300 border-red-500/30";
      case "high":
        return "bg-orange-500/20 text-orange-300 border-orange-500/30";
      case "medium":
        return "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";
      case "low":
        return "bg-blue-500/20 text-blue-300 border-blue-500/30";
      default:
        return "bg-gray-500/20 text-gray-300 border-gray-500/30";
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status.toLowerCase()) {
      case "new":
        return "bg-blue-500/20 text-blue-300 border-blue-500/30";
      case "verified":
        return "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";
      case "fixed":
        return "bg-green-500/20 text-green-300 border-green-500/30";
      case "rejected":
        return "bg-red-500/20 text-red-300 border-red-500/30";
      default:
        return "bg-gray-500/20 text-gray-300 border-gray-500/30";
    }
  };

  const totalReports = reports.length;
  const newReports = reports.filter((report) => report.status === "new").length;
  const verifiedReports = reports.filter(
    (report) => report.status === "verified",
  ).length;
  const fixedReports = reports.filter(
    (report) => report.status === "fixed",
  ).length;
  const criticalReports = reports.filter(
    (report) => report.risk_level === "critical",
  ).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="text-cyber-teal" />
          <h2 className="text-xl font-bold text-white">Submitted Reports</h2>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="bg-cyber-light/20 border border-cyber-teal/30 text-gray-300 rounded px-2 py-1 text-sm"
            value={selectedUserId || ""}
            onChange={(e) => setSelectedUserId(e.target.value || null)}
          >
            <option value="">All Users</option>
            {userIds.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
          <button
            className={`flex items-center gap-1 px-2 py-1 rounded bg-cyber-teal/20 hover:bg-cyber-teal/30 text-cyber-teal ${isRefreshing ? "opacity-70" : ""}`}
            onClick={handleManualRefresh}
            disabled={isRefreshing || isLoading}
          >
            <RefreshCw
              className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
            />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-4 mb-6">
        <div className="bg-cyber-light/10 p-4 rounded-md border border-cyber-teal/20">
          <p className="text-xs text-gray-400">Total Reports</p>
          <p className="text-2xl font-bold text-white">{totalReports}</p>
        </div>
        <div className="bg-blue-500/10 p-4 rounded-md border border-blue-500/20">
          <p className="text-xs text-gray-400">New</p>
          <p className="text-2xl font-bold text-blue-300">{newReports}</p>
        </div>
        <div className="bg-yellow-500/10 p-4 rounded-md border border-yellow-500/20">
          <p className="text-xs text-gray-400">Verified</p>
          <p className="text-2xl font-bold text-yellow-300">
            {verifiedReports}
          </p>
        </div>
        <div className="bg-green-500/10 p-4 rounded-md border border-green-500/20">
          <p className="text-xs text-gray-400">Fixed</p>
          <p className="text-2xl font-bold text-green-300">{fixedReports}</p>
        </div>
        <div className="bg-red-500/10 p-4 rounded-md border border-red-500/20">
          <p className="text-xs text-gray-400">Critical</p>
          <p className="text-2xl font-bold text-red-300">{criticalReports}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin h-8 w-8 border-4 border-cyber-teal border-t-transparent rounded-full"></div>
        </div>
      ) : reports.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-300">
            <thead className="text-xs uppercase bg-cyber-light/20 text-gray-400">
              <tr>
                <th scope="col" className="px-6 py-3">
                  ID
                </th>
                <th scope="col" className="px-6 py-3">
                  Title
                </th>
                <th scope="col" className="px-6 py-3">
                  Company
                </th>
                <th scope="col" className="px-6 py-3">
                  Website
                </th>
                <th scope="col" className="px-6 py-3">
                  Type
                </th>
                <th scope="col" className="px-6 py-3">
                  Severity
                </th>
                <th scope="col" className="px-6 py-3">
                  Fraud
                </th>
                <th scope="col" className="px-6 py-3">
                  Status
                </th>
                <th scope="col" className="px-6 py-3">
                  Submitter
                </th>
                <th scope="col" className="px-6 py-3">
                  Date
                </th>
                <th scope="col" className="px-6 py-3">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <tr
                  key={report.id}
                  className="border-b border-cyber-teal/10 animate-fadeIn"
                >
                  <td className="px-6 py-4">{report.id.substring(0, 8)}</td>
                  <td className="px-6 py-4">{report.title}</td>
                  <td className="px-6 py-4">{report.company}</td>
                  <td className="px-6 py-4">
                    {report.website && (
                      <a
                        href={
                          report.website.startsWith("http")
                            ? report.website
                            : `https://${report.website}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center text-cyber-teal hover:underline"
                      >
                        {report.website
                          .replace(/^https?:\/\//, "")
                          .substring(0, 15)}
                        {report.website.replace(/^https?:\/\//, "").length > 15
                          ? "..."
                          : ""}
                        <ExternalLink size={12} className="ml-1" />
                      </a>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {report.vulnerability_type || "N/A"}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-1 rounded-full text-xs border ${getSeverityBadgeClass(report.risk_level)}`}
                    >
                      {report.risk_level}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {report.ml_status === "unavailable" ? (
                      <span className="px-2 py-1 rounded-full text-xs border bg-gray-500/20 text-gray-300 border-gray-500/30">
                        Unavailable
                      </span>
                    ) : report.ml_status === "failed_closed" ? (
                      <span className="px-2 py-1 rounded-full text-xs border bg-red-500/20 text-red-300 border-red-500/30">
                        Failed Closed
                      </span>
                    ) : report.fraud_score != null && report.fraud_label ? (
                      <span className="px-2 py-1 rounded-full text-xs border bg-cyber-teal/20 text-cyber-teal border-cyber-teal/30">
                        {report.fraud_label.toUpperCase()} (
                        {report.fraud_score.toFixed(2)})
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded-full text-xs border bg-gray-500/20 text-gray-300 border-gray-500/30">
                        Not Scored
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-1 rounded-full text-xs border ${getStatusBadgeClass(report.status)}`}
                    >
                      {report.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">{report.submitter_name}</td>
                  <td className="px-6 py-4">
                    {new Date(report.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 flex gap-2">
                    <button
                      className="p-1 rounded-full bg-cyber-teal/20 hover:bg-cyber-teal/40 text-cyber-teal"
                      title="View Details"
                      onClick={() => handleViewDetails(report)}
                    >
                      <Eye size={16} />
                    </button>
                    {report.status === "new" ? (
                      <>
                        <button
                          className="p-1 rounded-full bg-green-500/20 hover:bg-green-500/40 text-green-400"
                          title="Verify"
                          onClick={() =>
                            handleStatusChange(report.id, "verified")
                          }
                        >
                          <Check size={16} />
                        </button>
                        <button
                          className="p-1 rounded-full bg-red-500/20 hover:bg-red-500/40 text-red-400"
                          title="Reject"
                          onClick={() =>
                            handleStatusChange(report.id, "rejected")
                          }
                        >
                          <X size={16} />
                        </button>
                      </>
                    ) : report.status === "verified" ? (
                      <button
                        className="p-1 rounded-full bg-green-500/20 hover:bg-green-500/40 text-green-400"
                        title="Mark as Fixed"
                        onClick={() => handleStatusChange(report.id, "fixed")}
                      >
                        <Check size={16} />
                      </button>
                    ) : null}

                    <button
                      className="p-1 rounded-full bg-blue-500/20 hover:bg-blue-500/40 text-blue-400"
                      title="View User Dashboard"
                      onClick={() => {
                        const url = `/dashboard?user_id=${report.user_id}`;
                        window.open(url, "_blank");
                      }}
                    >
                      <ExternalLink size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-10">
          <AlertTriangle className="h-10 w-10 text-gray-500 mx-auto mb-4" />
          <h3 className="text-white font-medium mb-1">No reports found</h3>
          <p className="text-gray-400 text-sm">
            No vulnerability reports have been submitted yet
          </p>
        </div>
      )}
    </div>
  );
};

export default SubmittedReports;
