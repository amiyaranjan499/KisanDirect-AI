# AI Overview

The AI layer is integrated through explicit inference boundaries and persisted prediction records. Farmer-only API routes invoke the quality or price service, which validates ownership, calls the inference boundary, stores metadata, and returns a prediction response.

The current project does not include trained production artifacts or measured model performance. When artifacts are unavailable, the API reports `MODEL_UNAVAILABLE` with null prediction values rather than fabricating results.

See [crop-quality](crop-quality.md), [price-recommendation](price-recommendation.md), and [model-evaluation](model-evaluation.md).
