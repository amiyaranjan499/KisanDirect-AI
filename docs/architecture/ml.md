# ML Architecture

The ML code is under `ml/`, with separate crop-quality and price-prediction boundaries. Preprocessing and feature-engineering modules prepare inputs; inference classes return typed prediction results and metadata; backend services persist prediction records.

The current inference implementations intentionally report `MODEL_UNAVAILABLE` when trained artifacts are not configured. Training, evaluation, datasets, and model storage directories are present as project structure but do not imply trained production models.
