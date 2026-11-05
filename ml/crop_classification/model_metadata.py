"""Metadata and class mapping configuration for 10-Crop Species Classification."""

MODEL_NAME = "crop-classifier-mobilenet-v2"
MODEL_VERSION = "v2.0-10crops"
MODEL_STATUS = "COMPLETED"

CLASSES = (
    "apple",
    "banana",
    "brinjal",
    "cabbage",
    "carrot",
    "mango",
    "onion",
    "orange",
    "potato",
    "tomato",
)

CLASS_TO_IDX = {name: i for i, name in enumerate(CLASSES)}
IDX_TO_CLASS = {i: name for i, name in enumerate(CLASSES)}

CLASS_TO_CATEGORY = {
    "apple": "Fruits",
    "banana": "Fruits",
    "brinjal": "Vegetables",
    "cabbage": "Vegetables",
    "carrot": "Vegetables",
    "mango": "Fruits",
    "onion": "Vegetables",
    "orange": "Fruits",
    "potato": "Vegetables",
    "tomato": "Vegetables",
}

CLASS_DISPLAY_NAMES = {
    "apple": "Apple",
    "banana": "Banana",
    "brinjal": "Brinjal",
    "cabbage": "Cabbage",
    "carrot": "Carrot",
    "mango": "Mango",
    "onion": "Onion",
    "orange": "Orange",
    "potato": "Potato",
    "tomato": "Tomato",
}

# Calibrated decision thresholds:
# 1. Base threshold for top softmax probability
CONFIDENCE_THRESHOLD = 0.70
MARGIN_THRESHOLD = 0.15

# 2. Embedding centroid cosine similarity threshold (128-dim prototype space)
CENTROID_SIMILARITY_THRESHOLD = 0.84
