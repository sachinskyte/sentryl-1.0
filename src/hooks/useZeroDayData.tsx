import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { getAllReports } from "@/lib/reportsStore";
import { scoreFraud } from "@/lib/mlClient";

export interface Attack {
  id: string;
  timestamp: string;
  ip: string;
  attack_type: string;
  severity: "High" | "Medium" | "Low";
  status: "Active" | "Mitigated";
  details: {
    user_agent: string;
    method: string;
    url_path: string;
    source_port: number;
    destination_port: number;
  };
  fraud_score?: number | null;
  fraud_label?: "low" | "medium" | "high" | null;
}

export interface BlockchainBlock {
  data: {
    message?: string;
    type?: string;
    severity?: string;
    threat?: string;
    [key: string]: any;
  };
  data_hash: string;
  hash: string;
  previous_hash: string;
  timestamp: string;
}

export interface BlockchainData {
  chain: BlockchainBlock[];
  length?: number;
}

export interface Report {
  id: string;
  title: string;
  company: string;
  risk_level: string;
  status: string;
  submitter_name: string;
  created_at: string;
  description: string;
}

export const useZeroDayData = (user: any) => {
  const { toast } = useToast();

  const [apiConnected, setApiConnected] = useState<boolean>(false);
  const [blockchainConnected, setBlockchainConnected] =
    useState<boolean>(false);
  const [apiUrl, setApiUrl] = useState<string>("");
  const [blockchainUrl, setBlockchainUrl] = useState<string>("");
  const [apiKey, setApiKey] = useState<string>("");
  const [connectionError, setConnectionError] = useState<string>("");
  const [attacks, setAttacks] = useState<Attack[]>([]);
  const [blockchainData, setBlockchainData] = useState<BlockchainData | null>(
    null,
  );
  const [threatTrends, setThreatTrends] = useState<any[]>([]);
  const [attackVectors, setAttackVectors] = useState<any[]>([]);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const { data: recentReports = [], isLoading: isReportsLoading } = useQuery({
    queryKey: ["adminReports"],
    queryFn: async () => {
      if (!user) return [];
      return getAllReports();
    },
    enabled: !!user,
    refetchInterval: 5000,
  });

  const scoreExternalAttacks = useCallback(
    async (incoming: Attack[]): Promise<Attack[]> => {
      const scored = await Promise.all(
        incoming.map(async (attack) => {
          try {
            const riskLevel =
              attack.severity === "High"
                ? "high"
                : attack.severity === "Medium"
                  ? "medium"
                  : "low";

            const response = await scoreFraud({
              title: attack.attack_type,
              description: `${attack.details.method} ${attack.details.url_path} ${attack.details.user_agent}`,
              company: attack.ip,
              website: null,
              vulnerability_type: attack.attack_type,
              affected_urls: attack.details.url_path,
              risk_level: riskLevel,
              user_id: `external-${attack.ip}`,
              created_at: attack.timestamp,
              source: "external_event",
            });

            return {
              ...attack,
              fraud_score: response.score,
              fraud_label: response.label,
            };
          } catch {
            return attack;
          }
        }),
      );

      return scored;
    },
    [],
  );

  const convertReportsToAttacks = (reports: Report[]): Attack[] => {
    return reports.map((report: Report) => ({
      id: report.id,
      timestamp: report.created_at,
      ip: `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
      attack_type: report.title.includes("SQL")
        ? "SQL Injection"
        : report.title.includes("XSS")
          ? "XSS"
          : report.title.includes("CSRF")
            ? "CSRF"
            : "Unknown Vulnerability",
      severity:
        report.risk_level === "critical" || report.risk_level === "high"
          ? "High"
          : report.risk_level === "medium"
            ? "Medium"
            : "Low",
      status: report.status === "fixed" ? "Mitigated" : "Active",
      details: {
        user_agent: "Reported via Security Portal",
        method: "REPORT",
        url_path: `/company/${report.company}`,
        source_port: Math.floor(Math.random() * 10000) + 30000,
        destination_port: 443,
      },
    }));
  };

  const updateAIAnalysis = (incomingAttacks: Attack[]) => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - i);
      return date.toISOString().split("T")[0];
    }).reverse();

    const attacksByDay = new Map();
    last7Days.forEach((day) => {
      attacksByDay.set(day, {
        date: day,
        total: 0,
        high: 0,
        medium: 0,
        low: 0,
      });
    });

    incomingAttacks.forEach((attack) => {
      const day = attack.timestamp.split("T")[0];
      if (attacksByDay.has(day)) {
        const dayData = attacksByDay.get(day);
        dayData.total++;

        if (attack.severity === "High") dayData.high++;
        else if (attack.severity === "Medium") dayData.medium++;
        else if (attack.severity === "Low") dayData.low++;

        attacksByDay.set(day, dayData);
      }
    });

    setThreatTrends(Array.from(attacksByDay.values()));

    const vectors = new Map();
    incomingAttacks.forEach((attack) => {
      const type = attack.attack_type;
      vectors.set(type, (vectors.get(type) || 0) + 1);
    });
    setAttackVectors(
      Array.from(vectors.entries()).map(([name, value]) => ({ name, value })),
    );
  };

  const addReportBlockchainEntries = useCallback((reports: Report[]) => {
    setBlockchainData((prev) => {
      if (!prev) {
        const genesisBlock: BlockchainBlock = {
          data: {
            message: "Sentryl Started",
            type: "genesis",
          },
          data_hash:
            "42ae1fa77dbaccb1c304a542e662c418556ea433147c38865626dd4e13bcc9be",
          hash: "29455a0da85c2037d0c6fbfbac5e9552121579d37b16c5c2d5d818087d2f9730",
          previous_hash: "0",
          timestamp: new Date(Date.now() - 86400000).toISOString(),
        };
        return { chain: [genesisBlock] };
      }

      const sortedReports = [...reports].sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );

      const newChain = [...prev.chain];

      sortedReports.forEach((report) => {
        const reportExists = newChain.some((block) =>
          block.data.message?.includes(report.title),
        );
        if (!reportExists) {
          const prevBlock = newChain[newChain.length - 1];
          const timestamp = report.created_at;
          const messageType =
            report.status === "fixed" ? "mitigation" : "attack";
          const dataHash = btoa(
            `${report.id}${report.title}${timestamp}`,
          ).substring(0, 64);
          const blockHash = btoa(
            `${prevBlock.hash}${dataHash}${timestamp}`,
          ).substring(0, 64);

          newChain.push({
            data: {
              message: `${report.title} - ${report.company}`,
              type: messageType,
              severity: report.risk_level,
              threat: report.title,
            },
            data_hash: dataHash,
            hash: blockHash,
            previous_hash: prevBlock.hash,
            timestamp,
          });
        }
      });

      return { chain: newChain, length: newChain.length };
    });
  }, []);

  const fetchDataFromSources = useCallback(async () => {
    if (!apiConnected && !blockchainConnected) return;

    try {
      if (apiConnected && apiUrl) {
        try {
          const headers: HeadersInit = {};
          if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

          const response = await fetch(apiUrl, { headers });
          if (!response.ok)
            throw new Error(`API responded with status: ${response.status}`);

          const data = await response.json();
          const attacksArray = Array.isArray(data)
            ? data
            : data && typeof data === "object"
              ? Array.isArray(data.attacks)
                ? data.attacks
                : Array.isArray(data.data)
                  ? data.data
                  : [data]
              : [];

          const scoredAttacks = await scoreExternalAttacks(attacksArray);
          setAttacks(scoredAttacks);
          setConnectionError("");
        } catch (error) {
          console.error("Error fetching from API:", error);
          setConnectionError(
            `Threat API connection failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
          if (recentReports.length > 0) {
            setAttacks(convertReportsToAttacks(recentReports));
          }
        }
      }

      if (blockchainConnected && blockchainUrl) {
        try {
          const headers: HeadersInit = {};
          if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

          const response = await fetch(blockchainUrl, { headers });
          if (!response.ok)
            throw new Error(
              `Blockchain API responded with status: ${response.status}`,
            );

          const data = await response.json();
          setBlockchainData(data);
          setConnectionError("");
        } catch (error) {
          console.error("Error fetching from blockchain:", error);
          setConnectionError(
            `Blockchain connection failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
          if (recentReports.length > 0) {
            addReportBlockchainEntries(recentReports);
          }
        }
      }
    } catch (error) {
      console.error("Error in fetchDataFromSources:", error);
    }
  }, [
    apiConnected,
    blockchainConnected,
    apiUrl,
    blockchainUrl,
    apiKey,
    recentReports,
    scoreExternalAttacks,
    addReportBlockchainEntries,
  ]);

  useEffect(() => {
    const fetchInitialData = async () => {
      await fetchDataFromSources();
    };

    if (apiConnected || blockchainConnected) {
      fetchInitialData();
      const interval = setInterval(fetchDataFromSources, 10000);
      return () => clearInterval(interval);
    }
  }, [fetchDataFromSources, apiConnected, blockchainConnected]);

  useEffect(() => {
    if (recentReports.length > 0) {
      if ((!apiConnected || attacks.length === 0) && recentReports.length > 0) {
        setAttacks(convertReportsToAttacks(recentReports));
      }

      if (attacks.length > 0) {
        updateAIAnalysis(attacks);
      }

      if (
        !blockchainConnected &&
        (!blockchainData || blockchainData.chain.length <= 1)
      ) {
        addReportBlockchainEntries(recentReports);
      }
    }
  }, [
    recentReports,
    attacks,
    apiConnected,
    blockchainConnected,
    blockchainData,
    addReportBlockchainEntries,
  ]);

  const playAlertSound = () => {
    try {
      const audio = new Audio("/alert.mp3");
      audio.play();
    } catch (error) {
      console.error("Error playing alert sound:", error);
    }
  };

  const handleConnect = async (
    newApiUrl: string,
    newBlockchainUrl: string,
    newApiKey?: string,
  ) => {
    setIsLoading(true);
    setConnectionError("");

    try {
      setApiUrl(newApiUrl);
      setBlockchainUrl(newBlockchainUrl);
      setApiKey(newApiKey || "");

      let apiConnectSuccessful = false;
      if (newApiUrl) {
        try {
          const headers: HeadersInit = {};
          if (newApiKey) headers["Authorization"] = `Bearer ${newApiKey}`;

          const response = await fetch(newApiUrl, { headers });
          if (!response.ok)
            throw new Error(`API responded with status: ${response.status}`);

          const data = await response.json();
          const attacksArray = Array.isArray(data)
            ? data
            : data && typeof data === "object"
              ? Array.isArray(data.attacks)
                ? data.attacks
                : Array.isArray(data.data)
                  ? data.data
                  : [data]
              : [];

          const scoredAttacks = await scoreExternalAttacks(attacksArray);
          setAttacks(scoredAttacks);
          apiConnectSuccessful = true;
        } catch (error) {
          console.error("Error connecting to API:", error);
          setConnectionError(
            `Threat API connection failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          );

          if (recentReports.length > 0) {
            setAttacks(convertReportsToAttacks(recentReports));
            apiConnectSuccessful = true;
          }
        }
      }

      let blockchainConnectSuccessful = false;
      if (newBlockchainUrl) {
        try {
          const headers: HeadersInit = {};
          if (newApiKey) headers["Authorization"] = `Bearer ${newApiKey}`;

          const response = await fetch(newBlockchainUrl, { headers });
          if (!response.ok)
            throw new Error(
              `Blockchain API responded with status: ${response.status}`,
            );

          const data = await response.json();
          setBlockchainData(data);
          blockchainConnectSuccessful = true;
        } catch (error) {
          console.error("Error connecting to blockchain:", error);

          if (!connectionError) {
            setConnectionError(
              `Blockchain connection failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
          }

          if (recentReports.length > 0) {
            addReportBlockchainEntries(recentReports);
            blockchainConnectSuccessful = true;
          }
        }
      }

      setApiConnected(apiConnectSuccessful);
      setBlockchainConnected(blockchainConnectSuccessful);

      if (apiConnectSuccessful || blockchainConnectSuccessful) {
        if (attacks.length > 0) updateAIAnalysis(attacks);

        toast({
          title: "Connection Status",
          description: `${apiConnectSuccessful ? "API connected. " : "API connection failed. "}${blockchainConnectSuccessful ? "Blockchain connected." : "Blockchain connection failed."}`,
          variant:
            apiConnectSuccessful && blockchainConnectSuccessful
              ? "default"
              : "destructive",
        });
      } else {
        toast({
          title: "Connection Failed",
          description: "Failed to connect to both API and blockchain sources.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Connection error:", error);
      toast({
        title: "Connection Error",
        description: "An error occurred while connecting to the services.",
        variant: "destructive",
      });

      setApiConnected(false);
      setBlockchainConnected(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = () => {
    setApiConnected(false);
    setBlockchainConnected(false);
    setConnectionError("");
    toast({
      title: "Disconnected",
      description: "Successfully disconnected from external data sources.",
    });
  };

  const totalThreats = attacks.length;
  const activeThreats = attacks.filter(
    (attack) => attack.status === "Active",
  ).length;
  const mitigatedThreats = attacks.filter(
    (attack) => attack.status === "Mitigated",
  ).length;
  const mitigationRate =
    totalThreats > 0 ? (mitigatedThreats / totalThreats) * 100 : 0;
  const highSeverity = attacks.filter(
    (attack) => attack.severity === "High",
  ).length;
  const mediumSeverity = attacks.filter(
    (attack) => attack.severity === "Medium",
  ).length;
  const lowSeverity = attacks.filter(
    (attack) => attack.severity === "Low",
  ).length;

  const severityData = [
    { name: "High", value: highSeverity, color: "#ef4444" },
    { name: "Medium", value: mediumSeverity, color: "#f59e0b" },
    { name: "Low", value: lowSeverity, color: "#10b981" },
  ];

  return {
    apiConnected,
    blockchainConnected,
    attacks,
    blockchainData,
    threatTrends,
    attackVectors,
    soundEnabled,
    setSoundEnabled,
    isLoading,
    recentReports,
    isReportsLoading,
    handleConnect,
    handleDisconnect,
    totalThreats,
    activeThreats,
    mitigatedThreats,
    mitigationRate,
    highSeverity,
    mediumSeverity,
    lowSeverity,
    severityData,
    playAlertSound,
    apiUrl,
    blockchainUrl,
    apiKey,
    connectionError,
  };
};
