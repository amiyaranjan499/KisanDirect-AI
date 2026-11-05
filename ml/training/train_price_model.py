"""Training script for Fair-Price Prediction Model using RandomForestRegressor.

Attribution & Dataset:
- Real APMC Mandi Historical Pricing Dataset (Agmarknet DMI, MoA&FW)
- Quality premium and volume pricing modeled after ICAR post-harvest market economics.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

RANDOM_SEED = 42

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATASET_CSV = PROJECT_ROOT / "ml" / "datasets" / "price_prediction" / "mandi_historical_pricing.csv"
OUTPUT_DIR = PROJECT_ROOT / "ml" / "price_prediction" / "model_artifacts"
MODEL_SAVE_PATH = OUTPUT_DIR / "fair_price_model.joblib"
METADATA_SAVE_PATH = OUTPUT_DIR / "model_metadata.json"

CATEGORICAL_FEATURES = ["crop_name", "quality_grade", "state", "district"]
NUMERICAL_FEATURES = ["market_price", "quantity", "harvest_month"]
TARGET = "fair_price"


def train_price_model() -> dict[str, Any]:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    if not DATASET_CSV.exists():
        raise FileNotFoundError(f"Training dataset not found at {DATASET_CSV}")

    logger.info("Loading training data from %s...", DATASET_CSV)
    df = pd.read_csv(DATASET_CSV)

    X = df[CATEGORICAL_FEATURES + NUMERICAL_FEATURES]
    y = df[TARGET]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=RANDOM_SEED
    )
    logger.info("Train set: %d rows, Test set: %d rows", len(X_train), len(X_test))

    # Build preprocessing and model pipeline
    preprocessor = ColumnTransformer(
        transformers=[
            ("cat", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL_FEATURES),
            ("num", StandardScaler(), NUMERICAL_FEATURES),
        ]
    )

    regressor = RandomForestRegressor(
        n_estimators=100,
        max_depth=14,
        min_samples_split=3,
        random_state=RANDOM_SEED,
        n_jobs=-1,
    )

    pipeline = Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            ("regressor", regressor),
        ]
    )

    logger.info("Fitting RandomForestRegressor pipeline...")
    pipeline.fit(X_train, y_train)

    y_pred = pipeline.predict(X_test)
    r2 = r2_score(y_test, y_pred)
    mae = mean_absolute_error(y_test, y_pred)
    rmse = float(np.sqrt(mean_squared_error(y_test, y_pred)))

    logger.info("Test Evaluation: R^2 = %.4f, MAE = %.2f INR, RMSE = %.2f INR", r2, mae, rmse)

    # Save model artifact
    logger.info("Saving model artifact to %s...", MODEL_SAVE_PATH)
    joblib.dump(pipeline, MODEL_SAVE_PATH)

    metadata = {
        "model_name": "fair-price-random-forest",
        "model_version": "v1.0",
        "architecture": "RandomForestRegressor",
        "n_estimators": 100,
        "max_depth": 14,
        "random_seed": RANDOM_SEED,
        "r2_score": round(float(r2), 4),
        "mae": round(float(mae), 4),
        "rmse": round(float(rmse), 4),
        "categorical_features": CATEGORICAL_FEATURES,
        "numerical_features": NUMERICAL_FEATURES,
        "supported_crops": sorted(list(df["crop_name"].unique())),
        "supported_grades": ["Grade A", "Grade B", "Grade C"],
    }

    with open(METADATA_SAVE_PATH, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    logger.info("Model metadata saved to %s", METADATA_SAVE_PATH)
    return metadata


if __name__ == "__main__":
    train_price_model()
