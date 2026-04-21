# Fraud Model Contract (Frozen Interface)

## Primary And Secondary Decisions

- Primary decision: fraud/spam likelihood for submitted vulnerability reports.
- Secondary decision: admin triage priority score.

## Serving Artifact Policy

- Production serving artifact: `ONNX` only.
- Offline retraining/debug artifact: `PKL` only (not for production serving).
- Rationale: ONNX is portable and safer operationally; PKL is Python-version dependent and unsafe to deserialize broadly.

## Model Metadata

- Model name: `sentryl_fraud_detector`
- Model version: `fraud-onnx-v1.0.0`
- ONNX artifact: `model/fraud_detection_model.onnx`
- Input tensor name: resolved dynamically at runtime from ONNX graph.
- Feature count contract: `12`

## Output Contract

All `POST /ml/fraud-score` responses must include:

- `score`: number in `[0, 1]` (fraud likelihood)
- `label`: `low | medium | high` fraud risk band
- `priority_score`: number in `[0, 1]` for admin triage ordering
- `model_version`: string
- `features_used`: ordered string list (exact order below)
- `confidence`: number in `[0, 1]`
- `reason_codes`: string list

## Threshold Policy

- Fraud band thresholds:
  - `low`: `score < 0.35`
  - `medium`: `0.35 <= score < 0.70`
  - `high`: `score >= 0.70`
- Phase policy:
  - Shadow mode (1-2 weeks): score only, no auto-block.
  - Assisted mode: `high` goes to manual review queue.
  - Soft hold candidate: very high score with confidence/rule checks.
  - Hard auto-reject: disabled until precision is validated on production data.

## Feature Vector Schema (Exact Order)

| Index | Feature Name                 | Type      | Description                                    |
| ----- | ---------------------------- | --------- | ---------------------------------------------- |
| 0     | `title_length`               | `float32` | Length of report title in characters           |
| 1     | `description_length`         | `float32` | Length of report description in characters     |
| 2     | `description_entropy`        | `float32` | Shannon entropy of description text            |
| 3     | `suspicious_keyword_count`   | `float32` | Count of suspicious terms in title+description |
| 4     | `risk_level_encoded`         | `float32` | Encoded risk level value                       |
| 5     | `vulnerability_type_encoded` | `float32` | Encoded vulnerability type value               |
| 6     | `domain_reputation_risk`     | `float32` | Domain/company pattern risk signal             |
| 7     | `affected_url_count`         | `float32` | Number of affected URLs reported               |
| 8     | `user_submission_count_24h`  | `float32` | Number of submissions by user in trailing 24h  |
| 9     | `user_submission_count_7d`   | `float32` | Number of submissions by user in trailing 7d   |
| 10    | `hour_of_day`                | `float32` | UTC hour of submission `[0, 23]`               |
| 11    | `is_weekend`                 | `float32` | 1 if submission day is Sat/Sun, else 0         |

## Preprocessing Rules (Deterministic)

- Input text normalization:
  - Trim whitespace.
  - Lowercase for keyword scanning and categorical encoding.
- Missing values:
  - Required fields (`title`, `description`, `company`, `risk_level`, `user_id`) must exist.
  - If any required field missing: fail closed with reason code `MISSING_REQUIRED_FEATURE`.
  - Optional fields fallback:
    - `website`: empty string
    - `vulnerability_type`: `other`
    - `affected_urls`: empty string
    - `created_at`: server receive timestamp
- Numeric handling:
  - Cast all features to `float32`.
  - Clip ranges before scaling to prevent outliers from exploding inputs.
- Scaling:
  - `title_length`: `min(x, 300) / 300`
  - `description_length`: `min(x, 5000) / 5000`
  - `description_entropy`: `min(x, 8) / 8`
  - `suspicious_keyword_count`: `min(x, 20) / 20`
  - `risk_level_encoded`: encoded value already normalized to `[0, 1]`
  - `vulnerability_type_encoded`: encoded value already normalized to `[0, 1]`
  - `domain_reputation_risk`: normalized to `[0, 1]`
  - `affected_url_count`: `min(x, 20) / 20`
  - `user_submission_count_24h`: `min(x, 50) / 50`
  - `user_submission_count_7d`: `min(x, 200) / 200`
  - `hour_of_day`: `x / 23` (0 if invalid)
  - `is_weekend`: 0 or 1
- Encoding:
  - `risk_level` mapping:
    - `critical: 1.0`, `high: 0.8`, `medium: 0.55`, `low: 0.25`, `info: 0.1`
  - `vulnerability_type` mapping (normalized bucket map in backend):
    - `rce: 1.0`, `sqli: 0.9`, `auth: 0.85`, `idor: 0.75`, `ssrf: 0.85`, `xss: 0.65`, `csrf: 0.6`, `lfi: 0.8`, `xxe: 0.8`, `buglogic: 0.5`, `other: 0.4`

## Fail-Closed Conditions

Scoring endpoint returns explicit failure (no prediction) when:

- Required inputs are missing.
- Feature vector length != contract length.
- ONNX model input dimension is incompatible.
- ONNX runtime inference fails.

Example reason codes:

- `MISSING_REQUIRED_FEATURE`
- `FEATURE_VECTOR_MISMATCH`
- `MODEL_SCHEMA_MISMATCH`
- `MODEL_INFERENCE_ERROR`

## Audit And Monitoring Minimums

- Log model version and request id with every prediction.
- Do not log raw sensitive report content unless explicitly required.
- Track:
  - Offline: PR-AUC, recall@fixed precision, calibration.
  - Online: p95 latency, error rate, feature null rate, drift signals.
