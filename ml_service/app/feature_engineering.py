from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from math import log2
from typing import Iterable

import numpy as np

from .schemas import FraudScoreRequest

FEATURE_NAMES = [
    "title_length",
    "description_length",
    "description_entropy",
    "suspicious_keyword_count",
    "risk_level_encoded",
    "vulnerability_type_encoded",
    "domain_reputation_risk",
    "affected_url_count",
    "user_submission_count_24h",
    "user_submission_count_7d",
    "hour_of_day",
    "is_weekend",
]

SUSPICIOUS_KEYWORDS = {
    "urgent",
    "click",
    "password",
    "crypto",
    "wallet",
    "airdrop",
    "bonus",
    "wire transfer",
    "telegram",
    "dm me",
    "pay now",
    "proof attached",
}

RISK_LEVEL_MAP = {
    "critical": 1.0,
    "high": 0.8,
    "medium": 0.55,
    "low": 0.25,
    "info": 0.1,
}

VULN_TYPE_MAP = {
    "rce": 1.0,
    "sqli": 0.9,
    "auth": 0.85,
    "idor": 0.75,
    "ssrf": 0.85,
    "xss": 0.65,
    "csrf": 0.6,
    "lfi": 0.8,
    "xxe": 0.8,
    "buglogic": 0.5,
    "other": 0.4,
}


@dataclass
class FeatureResult:
    vector: np.ndarray
    reason_codes: list[str]


class SubmissionHistory:
    """Tracks timestamps by user id for deterministic behavioral features."""

    def __init__(self) -> None:
        self._events: dict[str, list[datetime]] = defaultdict(list)

    def get_counts(self, user_id: str, at: datetime) -> tuple[int, int]:
        entries = self._events[user_id]
        d1 = at - timedelta(hours=24)
        d7 = at - timedelta(days=7)
        c24 = sum(1 for ts in entries if ts >= d1)
        c7 = sum(1 for ts in entries if ts >= d7)
        return c24, c7

    def register(self, user_id: str, at: datetime) -> None:
        self._events[user_id].append(at)


class FeatureEngineer:
    def __init__(self, history: SubmissionHistory) -> None:
        self._history = history

    def transform(self, payload: FraudScoreRequest) -> FeatureResult:
        reason_codes: list[str] = []

        title = payload.title.strip()
        description = payload.description.strip()
        company = payload.company.strip()
        if not title or not description or not company or not payload.user_id.strip():
            return FeatureResult(
                vector=np.array([], dtype=np.float32),
                reason_codes=["MISSING_REQUIRED_FEATURE"],
            )

        created_at = payload.created_at or datetime.now(timezone.utc)
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)

        vuln_type = (payload.vulnerability_type or "other").strip().lower() or "other"
        normalized_text = f"{title.lower()} {description.lower()}"

        title_length = len(title)
        description_length = len(description)
        description_entropy = self._entropy(description)
        suspicious_keyword_count = self._keyword_count(normalized_text, SUSPICIOUS_KEYWORDS)
        risk_level_encoded = RISK_LEVEL_MAP[payload.risk_level]
        vulnerability_type_encoded = self._encode_vuln_type(vuln_type)
        domain_reputation_risk = self._domain_risk(payload.website, company)
        affected_url_count = self._affected_url_count(payload.affected_urls)
        user_24h, user_7d = self._history.get_counts(payload.user_id, created_at)
        hour_of_day = created_at.hour
        is_weekend = 1 if created_at.weekday() >= 5 else 0

        vector = np.array(
            [
                min(title_length, 300) / 300,
                min(description_length, 5000) / 5000,
                min(description_entropy, 8) / 8,
                min(suspicious_keyword_count, 20) / 20,
                risk_level_encoded,
                vulnerability_type_encoded,
                domain_reputation_risk,
                min(affected_url_count, 20) / 20,
                min(user_24h, 50) / 50,
                min(user_7d, 200) / 200,
                hour_of_day / 23 if 0 <= hour_of_day <= 23 else 0,
                float(is_weekend),
            ],
            dtype=np.float32,
        )

        if vector.shape[0] != len(FEATURE_NAMES):
            return FeatureResult(
                vector=np.array([], dtype=np.float32),
                reason_codes=["FEATURE_VECTOR_MISMATCH"],
            )

        self._history.register(payload.user_id, created_at)
        return FeatureResult(vector=vector, reason_codes=reason_codes)

    @staticmethod
    def _keyword_count(text: str, keywords: Iterable[str]) -> int:
        return sum(text.count(keyword) for keyword in keywords)

    @staticmethod
    def _entropy(text: str) -> float:
        if not text:
            return 0.0
        counts = Counter(text)
        length = len(text)
        return -sum((count / length) * log2(count / length) for count in counts.values())

    @staticmethod
    def _encode_vuln_type(vuln_type: str) -> float:
        for key, val in VULN_TYPE_MAP.items():
            if key in vuln_type:
                return val
        return VULN_TYPE_MAP["other"]

    @staticmethod
    def _affected_url_count(raw: str | None) -> int:
        if not raw:
            return 0
        return len([url for url in raw.split(",") if url.strip()])

    @staticmethod
    def _domain_risk(website: str | None, company: str) -> float:
        seed = f"{website or ''} {company}".lower()
        risky_fragments = ["test", "sandbox", "staging", "demo", "temp", "localhost"]
        score = 0.2
        if any(fragment in seed for fragment in risky_fragments):
            score += 0.4
        if website and website.count(".") >= 2:
            score += 0.15
        if len(company.strip()) < 4:
            score += 0.15
        return min(score, 1.0)
