# ML Usage Flow (How The Model Is Used)

This document explains the real implementation flow of the fraud model in this repo: where scoring happens, how data moves, what gets stored, and what users/admins see.

## 1. What The Model Decides

- Primary decision: fraud/spam likelihood for a submitted vulnerability report.
- Secondary decision: priority score for admin triage ordering.

Outputs returned by backend scoring API:
- `score` (0 to 1)
- `label` (`low | medium | high`)
- `priority_score` (0 to 1)
- `model_version`
- `features_used`
- `confidence`
- `reason_codes`

Contract source: [docs/ml-model-contract.md](docs/ml-model-contract.md)

## 2. High-Level Architecture

- Frontend app sends report payload to backend ML service before local save.
- Backend service does feature engineering server-side (deterministic, trusted).
- Backend runs ONNX inference and returns score + metadata.
- Frontend stores report plus ML outputs in local report store.
- Dashboard/admin triage views display, filter, and sort by fraud outputs.

Why this design:
- Model logic is not trusted from client side.
- ONNX is served in backend for portability and operational safety.

## 3. Runtime Components

Frontend:
- Submit page: [src/pages/SubmitReport.tsx](src/pages/SubmitReport.tsx)
- ML API client: [src/lib/mlClient.ts](src/lib/mlClient.ts)
- Local report store: [src/lib/reportsStore.ts](src/lib/reportsStore.ts)
- Triage feed UI: [src/components/Dashboard/VulnerabilityFeed.tsx](src/components/Dashboard/VulnerabilityFeed.tsx)
- Admin report table: [src/components/Admin/SubmittedReports.tsx](src/components/Admin/SubmittedReports.tsx)

Backend ML service:
- API endpoints: [ml_service/app/main.py](ml_service/app/main.py)
- Feature engineering: [ml_service/app/feature_engineering.py](ml_service/app/feature_engineering.py)
- ONNX runtime adapter: [ml_service/app/model_runtime.py](ml_service/app/model_runtime.py)
- Schemas: [ml_service/app/schemas.py](ml_service/app/schemas.py)

## 4. Exact Report Submission Flow

### Step A: User submits report
- User fills report fields in submit form.
- Frontend creates payload with title, description, company, website, vulnerability type, affected URLs, risk level, user ID, timestamp.

### Step B: Frontend calls ML scoring API
- `scoreFraud(...)` sends `POST /ml/fraud-score`.
- Base URL is `VITE_ML_SERVICE_URL` (fallback: `http://localhost:8000`).

### Step C: Backend validates and transforms
- Backend validates payload schema.
- Backend computes model feature vector server-side (not from client precomputed features).
- Required field issues return fail-closed style error response (422).

### Step D: Backend runs ONNX inference
- ONNX model loaded from `MODEL_PATH` (default points to `model/fraud_detection_model.onnx`).
- Backend returns score, risk band label, confidence, model version, features used, reason codes, and priority score.

### Step E: Frontend stores report + ML metadata
Stored alongside report:
- `fraud_score`
- `fraud_label`
- `fraud_confidence`
- `fraud_reason_codes`
- `priority_score`
- `ml_model_version`
- `ml_features_used`
- `ml_status`

Storage location:
- Local store in browser localStorage via report store helpers.

## 5. Fallback / Error Behavior

If ML service is unavailable:
- Submission still continues (non-blocking path).
- Report is still saved.
- `ml_status = unavailable`
- `fraud_reason_codes` includes `ML_SERVICE_UNAVAILABLE`
- User gets warning toast, not a hard failure.

If backend returns fail-closed validation (e.g. missing required feature):
- Submission still continues.
- `ml_status = failed_closed`
- Reason code set accordingly.

## 6. Where Scores Are Used In UI

User/admin vulnerability feed:
- Fraud badge shown per report (`high/medium/low` + score).
- Additional states: `Unavailable`, `Failed Closed`, `Not Scored`.
- Sorting by fraud score descending is available.
- Filtering by fraud band is available.

Details panel:
- Fraud score/label shown in vulnerability details.

Admin table:
- Fraud status/score column shown for submitted reports.

Route visibility:
- Dedicated page exists at `/vulnerabilities` for score-centric triage view.

## 7. Optional External Event Scoring Path

For zero-day external stream data:
- Hook scores incoming events after fetch and before state update.
- File: [src/hooks/useZeroDayData.tsx](src/hooks/useZeroDayData.tsx)
- Uses same `scoreFraud` API with `source = external_event`.
- Keeps risk/fraud signal consistent across report submissions and external stream events.

## 8. Service Endpoints

ML service endpoints:
- `GET /ml/health`
- `GET /ml/model-metadata`
- `POST /ml/fraud-score`

Runbook:
- See [ml_service/README.md](ml_service/README.md)

## 9. Data + Security Rules In Practice

- Frontend never computes authoritative model features for serving.
- Backend owns validation and deterministic feature engineering.
- ONNX artifact is serving default.
- PKL is not used by serving path (debug/retraining only policy).
- Model metadata and version are returned for auditability.

## 10. Current Operating Mode

Current implementation is aligned with shadow/assisted workflow:
- Scores are computed and surfaced for triage.
- No hard auto-reject path is enforced by frontend flow.
- Human review remains in control of final report status.
