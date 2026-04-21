from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .feature_engineering import FEATURE_NAMES, FeatureEngineer, SubmissionHistory
from .model_runtime import ONNXFraudModel
from .schemas import FraudScoreRequest, FraudScoreResponse

MODEL_VERSION = os.getenv("MODEL_VERSION", "fraud-onnx-v1.0.0")
DEFAULT_MODEL_PATH = Path(__file__).resolve().parents[2] / "model" / "fraud_detection_model.onnx"
MODEL_PATH = Path(os.getenv("MODEL_PATH", str(DEFAULT_MODEL_PATH))).resolve()

app = FastAPI(title="Sentryl ML Service", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

history = SubmissionHistory()
fe = FeatureEngineer(history)
model_error: str | None = None
model: ONNXFraudModel | None = None

try:
    model = ONNXFraudModel(MODEL_PATH)
except Exception as exc:  # pragma: no cover
    model_error = str(exc)


@app.get("/ml/health")
def health() -> dict:
    return {
        "ok": model is not None,
        "model_loaded": model is not None,
        "model_path": str(MODEL_PATH),
        "model_version": MODEL_VERSION,
        "error": model_error,
    }


@app.get("/ml/model-metadata")
def model_metadata() -> dict:
    return {
        "model_name": "sentryl_fraud_detector",
        "model_version": MODEL_VERSION,
        "model_path": str(MODEL_PATH),
        "features_used": FEATURE_NAMES,
        "feature_count": len(FEATURE_NAMES),
        "thresholds": {
            "low": "score < 0.35",
            "medium": "0.35 <= score < 0.70",
            "high": "score >= 0.70",
        },
        "serving_artifact": "onnx",
        "offline_debug_artifact": "pkl",
        "primary_decision": "fraud_spam_likelihood",
        "secondary_decision": "admin_triage_priority",
        "status": "ready" if model is not None else "degraded",
    }


@app.post("/ml/fraud-score", response_model=FraudScoreResponse)
def fraud_score(payload: FraudScoreRequest) -> FraudScoreResponse:
    if model is None:
        raise HTTPException(
            status_code=503,
            detail={"reason_codes": ["MODEL_NOT_READY"], "message": "Model service unavailable"},
        )

    feature_result = fe.transform(payload)
    if feature_result.reason_codes:
        raise HTTPException(
            status_code=422,
            detail={"reason_codes": feature_result.reason_codes, "message": "Feature generation failed"},
        )

    if model.expected_feature_count is not None and model.expected_feature_count != len(FEATURE_NAMES):
        raise HTTPException(
            status_code=500,
            detail={"reason_codes": ["MODEL_SCHEMA_MISMATCH"], "message": "Model input schema mismatch"},
        )

    try:
        prediction = model.predict_score(feature_result.vector)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail={"reason_codes": ["MODEL_INFERENCE_ERROR"], "message": str(exc)},
        ) from exc

    score = prediction.score
    if score >= 0.70:
        label = "high"
    elif score >= 0.35:
        label = "medium"
    else:
        label = "low"

    # Triage priority favors severe risk and likely non-spam reports.
    risk_weight = {
        "critical": 1.0,
        "high": 0.85,
        "medium": 0.6,
        "low": 0.3,
        "info": 0.1,
    }[payload.risk_level]
    priority_score = max(0.0, min(1.0, (0.65 * risk_weight) + (0.35 * (1.0 - score))))

    confidence = min(1.0, max(0.0, abs(score - 0.5) * 2.0))

    reason_codes: list[str] = []
    if score >= 0.70:
        reason_codes.append("FRAUD_RISK_HIGH")
    if confidence < 0.2:
        reason_codes.append("LOW_CONFIDENCE")

    return FraudScoreResponse(
        score=score,
        label=label,
        priority_score=priority_score,
        model_version=MODEL_VERSION,
        features_used=FEATURE_NAMES,
        confidence=confidence,
        reason_codes=reason_codes,
    )
