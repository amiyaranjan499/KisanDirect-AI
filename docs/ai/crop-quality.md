# Crop Quality Detection

## Supported Classes

The planned classifier supports `Good`, `Average`, and `Poor`.

## Preprocessing

Uploaded JPEG, PNG, and WebP content is validated with Pillow, decoded, converted to RGB, and resized to `224 x 224` using Lanczos resampling.

## Current Model Status

No trained or evaluated crop-quality model artifact is included. The inference service therefore returns `MODEL_UNAVAILABLE`, no quality class, and no confidence score. It does not fabricate predictions.

## Future Integration

A trained CNN or transfer-learning artifact should be loaded behind `ml.crop_quality.inference.CropQualityInference`. The implementation must return a supported class and confidence only after validation on an evaluation dataset. Training and evaluation code belongs under the ML module, not API routers.
