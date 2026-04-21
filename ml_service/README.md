# Sentryl ML Service

FastAPI service for fraud scoring using ONNX.

## Endpoints

- `GET /ml/health`
- `GET /ml/model-metadata`
- `POST /ml/fraud-score`

## Run

```bash
cd ml_service
python -m venv .venv
.venv\\Scripts\\activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## Environment Variables

- `MODEL_PATH` (optional): absolute/relative path to ONNX file.
  - Default: `../model/fraud_detection_model.onnx`
- `MODEL_VERSION` (optional): model version string.
  - Default: `fraud-onnx-v1.0.0`

## Security Notes

- Service performs server-side schema validation and feature generation.
- Client-supplied precomputed features are ignored.
- Keep model files outside publicly served frontend static folders.
