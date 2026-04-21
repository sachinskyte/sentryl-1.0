import React from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import VulnerabilityFeed, {
  RiskLevel,
  VulnerabilityStatus,
} from "@/components/Dashboard/VulnerabilityFeed";
import { getAllReports } from "@/lib/reportsStore";
import { useAuth } from "@/context/AuthContext";

const Vulnerabilities: React.FC = () => {
  const { user } = useAuth();

  const validateRiskLevel = (risk: string): RiskLevel => {
    const validRiskLevels: RiskLevel[] = [
      "critical",
      "high",
      "medium",
      "low",
      "info",
    ];
    return validRiskLevels.includes(risk as RiskLevel)
      ? (risk as RiskLevel)
      : "medium";
  };

  const validateStatus = (status: string): VulnerabilityStatus => {
    const validStatuses: VulnerabilityStatus[] = [
      "new",
      "verified",
      "fixed",
      "rejected",
    ];
    return validStatuses.includes(status as VulnerabilityStatus)
      ? (status as VulnerabilityStatus)
      : "new";
  };

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["vulnerabilitiesFeed"],
    queryFn: async () => {
      const data = getAllReports();
      return data.map((report) => ({
        id: report.id,
        title: report.title,
        company: report.company,
        risk_level: validateRiskLevel(report.risk_level),
        status: validateStatus(report.status),
        submitter_name: report.submitter_name,
        created_at: report.created_at,
        description: report.description,
        fraud_score: report.fraud_score ?? null,
        fraud_label: report.fraud_label ?? null,
        priority_score: report.priority_score ?? null,
        ml_status: report.ml_status,
      }));
    },
    enabled: !!user,
    refetchInterval: 5000,
  });

  return (
    <div className="p-4 animate-fadeIn">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="bg-cyber-teal/20 text-cyber-teal text-xs font-medium px-2.5 py-0.5 rounded border border-cyber-teal/30">
            ML Triage
          </span>
        </div>
        <h1 className="text-2xl font-bold text-white flex items-center">
          <AlertTriangle className="h-6 w-6 text-cyber-teal mr-2" />
          Vulnerability Fraud Triage
        </h1>
        <p className="text-gray-400 mt-2">
          Review vulnerability submissions with fraud risk scoring and priority
          context.
        </p>
      </div>

      <VulnerabilityFeed reports={reports} isLoading={isLoading} />
    </div>
  );
};

export default Vulnerabilities;
