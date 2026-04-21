from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import onnxruntime as ort


@dataclass
class ModelPrediction:
    score: float


class ONNXFraudModel:
    def __init__(self, model_path: Path) -> None:
        self._session = ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])
        self.input_name = self._session.get_inputs()[0].name
        input_shape = self._session.get_inputs()[0].shape
        self.expected_feature_count = input_shape[-1] if len(input_shape) >= 2 and isinstance(input_shape[-1], int) else None

    def predict_score(self, vector: np.ndarray) -> ModelPrediction:
        batch = vector.reshape(1, -1).astype(np.float32)
        outputs = self._session.run(None, {self.input_name: batch})
        first_output = np.asarray(outputs[0], dtype=np.float32).squeeze()

        # Common conventions: direct probability, logit, or class score.
        raw = float(first_output.item() if np.ndim(first_output) == 0 else first_output.flat[0])
        if 0.0 <= raw <= 1.0:
            score = raw
        else:
            # Sigmoid fallback if model emits logits.
            score = 1.0 / (1.0 + np.exp(-raw))

        return ModelPrediction(score=float(np.clip(score, 0.0, 1.0)))
