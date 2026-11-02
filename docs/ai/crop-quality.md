# Crop Quality Classification

## Overview

The Crop Quality Classification engine provides automated visual grading for farm produce uploaded by farmers during listing creation. It uses a lightweight MobileNetV2 architecture with transfer learning exported to ONNX Runtime for CPU inference.

## Supported Classes and Produce

- **Output Classes**: `Good`, `Average`, and `Poor` (project-specific visual quality grade mapping).
- **Supported Crops**: `Apple`, `Tomato`, `Mango`, and `Papaya`.
- **Unsupported Produce Guard**: If an image is submitted for an unsupported crop (e.g., wheat, rice, potatoes), the inference engine returns status `UNSUPPORTED_CROP` with `quality_label=None` and `confidence=None` to prevent misleading predictions.
- **Safety Notice**: This model evaluates surface visual condition only. It does not certify internal food safety, chemical residue levels, or microbial contamination.

## Preprocessing Pipeline

1. **Format Validation**: Validates image byte streams (JPEG, PNG, WebP) with Pillow. Corrupt or unidentifiable files raise `InvalidCropImageError` (HTTP 422).
2. **Standardization**: Converts image to 3-channel RGB and resizes to `(224, 224)` via bilinear interpolation, matching training.
3. **Tensor Normalization**: Converts pixels to range `[0.0, 1.0]`, transposes to NCHW `(1, 3, 224, 224)`, and applies ImageNet normalization:
   - Mean: `[0.485, 0.456, 0.406]`
   - Standard Deviation: `[0.229, 0.224, 0.225]`

## Model Architecture & Training

- **Backbone**: MobileNetV2 initialized with ImageNet pre-trained weights.
- **Backbone Status**: Frozen feature extractor during Stage 1 training to preserve low-level features and prevent overfitting.
- **Classification Head**: Dropout ($p=0.2$) followed by Linear layer mapping features to 3 output logits.
- **Dataset**: AFruitDB subset containing 720 verified, non-corrupted images across 4 fruit types (apple, tomato, mango, papaya) with 60 images per fruit-grade bucket.
- **Deduplication**: Exact duplicates removed via SHA-256. Near-duplicates excluded using 64-bit average perceptual hashing (aHash, Hamming distance $\le 3$).
- **Splits**: Stratified 70% train (504), 15% validation (108), and 15% held-out test (108).

## Evaluation Metrics (Held-Out Test Split)

Evaluated on 108 unseen test images using the exported ONNX model with ONNX Runtime CPU:

- **Overall Test Accuracy**: 80.56% (87 / 108)
- **Macro-Averaged F1-Score**: 0.8016
- **Per-Class Breakdown**:
  - `Good`: Precision = 0.8158, Recall = 0.7381, F1 = 0.7750
  - `Average`: Precision = 0.6875, Recall = 0.7097, F1 = 0.6984
  - `Poor`: Precision = 0.9189, Recall = 0.9444, F1 = 0.9315
- **Confusion Matrix**:
  - True Good $\rightarrow$ Pred Good: 31, Pred Average: 10, Pred Poor: 1
  - True Average $\rightarrow$ Pred Good: 6, Pred Average: 22, Pred Poor: 3
  - True Poor $\rightarrow$ Pred Good: 1, Pred Average: 1, Pred Poor: 34

## Production Inference & Runtime

- **Runtime Engine**: ONNX Runtime CPU (`CPUExecutionProvider`) configured with bounded thread counts.
- **Model Artifact**: `ml/crop_quality/model_artifacts/crop_quality_mobilenet_v2.onnx` (8.47 MB).
- **Inference Boundary**: `ml.crop_quality.inference.CropQualityInference`.
- **Softmax Probabilities**: Returns predicted class, top confidence score, and per-class probability distribution in `result_metadata["class_probabilities"]`.
- **Fallback Mechanism**: If the ONNX artifact is missing or corrupted, the inference service gracefully falls back to `prediction_status="MODEL_UNAVAILABLE"` with null labels, without throwing uncaught 500 errors.
