from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


RiskLevel = Literal["critical", "high", "medium", "low", "info"]
FraudBand = Literal["low", "medium", "high"]


class FraudScoreRequest(BaseModel):
    title: str = Field(min_length=1)
    description: str = Field(min_length=1)
    company: str = Field(min_length=1)
    website: str | None = None
    vulnerability_type: str | None = None
    affected_urls: str | None = None
    risk_level: RiskLevel
    user_id: str = Field(min_length=1)
    created_at: datetime | None = None
    source: Literal["report_submission", "external_event"] = "report_submission"


class FraudScoreResponse(BaseModel):
    score: float
    label: FraudBand
    priority_score: float
    model_version: str
    features_used: list[str]
    confidence: float
    reason_codes: list[str]
