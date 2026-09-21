# Fair Price Prediction

## Purpose

Provide a future regression-based estimate of a crop listing's fair price using listing information without inventing market data.

## Input Features

The feature boundary records crop name, category, quantity, unit, location when available, optional Step 7 quality grade, and harvest date. Historical prices are intentionally absent until verified historical data is provided.

## Preprocessing and Architecture

`ml.price_prediction.feature_engineering` creates a typed feature snapshot. The planned model architecture is `RandomForestRegressor`, loaded behind `FairPriceInference`. API routers do not contain training code.

## Current Model and Evaluation Status

No trained and evaluated price model artifact or historical market dataset is available. The API returns `MODEL_UNAVAILABLE`, a null predicted price, and null confidence. It never fabricates a market price or accuracy metric.

## Future Integration

A validated Random Forest artifact can be added under `ml/price_prediction/model_artifacts` and loaded by `FairPriceInference`. The artifact must be evaluated on held-out, documented data before the inference adapter returns a price. The adapter must preserve the input feature snapshot and model metadata for every prediction.
