export type FraudBand = "low" | "medium" | "high";

export type FraudScoreRequest = {
  title: string;
  description: string;
  company: string;
  website: string | null;
  vulnerability_type: string | null;
  affected_urls: string | null;
  risk_level: "critical" | "high" | "medium" | "low" | "info";
  user_id: string;
  created_at?: string;
  source?: "report_submission" | "external_event";
};

export type FraudScoreResponse = {
  score: number;
  label: FraudBand;
  priority_score: number;
  model_version: string;
  features_used: string[];
  confidence: number;
  reason_codes: string[];
};

const ML_BASE_URL =
  (import.meta.env.VITE_ML_SERVICE_URL as string | undefined)?.trim() ||
  "http://localhost:8000";

export async function scoreFraud(
  payload: FraudScoreRequest,
): Promise<FraudScoreResponse> {
  const response = await fetch(`${ML_BASE_URL}/ml/fraud-score`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...payload,
      source: payload.source || "report_submission",
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`ML scoring failed (${response.status}): ${message}`);
  }

  return response.json();
}
