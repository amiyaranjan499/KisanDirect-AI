import logging
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from backend.app.dependencies import get_current_user
from backend.app.models import User, UserRole
from backend.app.schemas.crop_classifier import CropClassificationResponse
from backend.app.services.gemini_service import GeminiVisionService
from ml.crop_classification.inference import CropClassifierInference
from ml.crop_classification.model_metadata import (
    CLASS_DISPLAY_NAMES,
    CLASS_TO_CATEGORY,
    CLASSES,
    CONFIDENCE_THRESHOLD,
    MODEL_NAME,
    MODEL_VERSION,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai/crop", tags=["ai-crop-classification"])

_inference_engine: CropClassifierInference | None = None
_gemini_service: GeminiVisionService | None = None


def get_crop_inference() -> CropClassifierInference:
    global _inference_engine
    if _inference_engine is None:
        _inference_engine = CropClassifierInference()
    return _inference_engine


def get_gemini_service() -> GeminiVisionService:
    global _gemini_service
    if _gemini_service is None:
        _gemini_service = GeminiVisionService()
    return _gemini_service


async def require_farmer(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    if current_user.role is not UserRole.FARMER:
        raise HTTPException(status_code=403, detail="Farmer role required")
    return current_user


@router.post("/classify", response_model=CropClassificationResponse, status_code=status.HTTP_200_OK)
async def classify_crop_image(
    image: Annotated[UploadFile, File()],
    _farmer: Annotated[User, Depends(require_farmer)],
    inference: Annotated[CropClassifierInference, Depends(get_crop_inference)],
    gemini: Annotated[GeminiVisionService, Depends(get_gemini_service)],
) -> CropClassificationResponse:
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=422, detail="Only image files are accepted.")

    try:
        content = await image.read()
        if len(content) == 0:
            raise HTTPException(status_code=422, detail="Uploaded image file is empty.")
        if len(content) > 15 * 1024 * 1024:
            raise HTTPException(status_code=422, detail="Image file exceeds maximum 15MB limit.")

        # Step 1: Run Local Deep Learning Model
        local_result = inference.predict(content)
        local_crop = local_result.crop_name
        local_candidate = local_result.metadata.get("top_candidate") or local_crop or "Unknown"

        # Check if local prediction is reliable and completed.
        if local_result.prediction_status == "COMPLETED" and local_crop:
            logger.info(
                "LOCAL CLASSIFIER: Predicted: %s, Decision: SUPPORTED, Action: LOCAL INFERENCE",
                local_crop,
            )
            return CropClassificationResponse(
                crop_name=local_crop,
                category=local_result.category,
                source="local",
                prediction_status="COMPLETED",
                metadata={
                    "model": "MobileNetV2-Local",
                    "reason": local_result.metadata.get("reason", "Identified by local deep learning model."),
                },
            )

        # Step 2: Automatic Fallback to Gemini Vision for Unknown / Unsupported / Ambiguous Crops
        if gemini.is_available():
            gemini_result = gemini.identify_crop(content)
            gemini_crop = gemini_result.get("crop_name")
            gemini_cat = gemini_result.get("category", "Fruits")

            if gemini_result.get("prediction_status") == "COMPLETED" and gemini_crop:
                clean_gem = gemini_crop.lower().strip()
                if clean_gem == "eggplant":
                    clean_gem = "brinjal"

                matched_class = next((c for c in CLASSES if c.lower() == clean_gem), None)

                if matched_class is not None:
                    # Gemini confirms this is indeed one of the 10 supported crops (e.g. Mango)
                    display_name = CLASS_DISPLAY_NAMES.get(matched_class, matched_class.capitalize())
                    category = CLASS_TO_CATEGORY.get(matched_class, gemini_cat)
                    logger.info(
                        "LOCAL CLASSIFIER: Predicted: %s, Decision: SUPPORTED, Action: LOCAL INFERENCE",
                        display_name,
                    )
                    return CropClassificationResponse(
                        crop_name=display_name,
                        category=category,
                        source="local",
                        prediction_status="COMPLETED",
                        metadata={
                            "model": "MobileNetV2-Local",
                            "reason": f"Identified as {display_name} ({category}) by local model.",
                        },
                    )
                else:
                    # Image is an unsupported crop outside the 10 trained classes (e.g. Dragon Fruit, Papaya, Watermelon, Pineapple, Guava)
                    logger.info(
                        "LOCAL CLASSIFIER: Predicted: %s, Decision: UNSUPPORTED, Action: GEMINI FALLBACK",
                        local_candidate,
                    )
                    logger.info(
                        "GEMINI: Identified crop: %s, Category: %s",
                        gemini_crop,
                        gemini_cat,
                    )
                    return CropClassificationResponse(
                        crop_name=gemini_crop,
                        category=gemini_cat,
                        source="gemini",
                        prediction_status="COMPLETED",
                        metadata={
                            "model": "Gemini-Vision-Fallback",
                            "reason": f"Crop outside 10 local classes; automatically identified as {gemini_crop} via Gemini Vision.",
                        },
                    )

        # Fallback if Gemini unavailable or failed
        if local_result.prediction_status == "COMPLETED" and local_crop:
            logger.info(
                "LOCAL CLASSIFIER: Predicted: %s, Decision: SUPPORTED, Action: LOCAL INFERENCE (fallback)",
                local_crop,
            )
            return CropClassificationResponse(
                crop_name=local_crop,
                category=local_result.category,
                source="local",
                prediction_status="COMPLETED",
                metadata={"model": "MobileNetV2-Local", "reason": "Identified by local deep learning model."},
            )

        logger.warning(
            "LOCAL CLASSIFIER: Predicted: %s, Decision: UNSUPPORTED, Action: UNIDENTIFIED",
            local_candidate,
        )
        return CropClassificationResponse(
            crop_name=None,
            category=None,
            source="unknown",
            prediction_status="UNKNOWN_CROP",
            metadata={"reason": "Crop could not be reliably identified by local model or fallback."},
        )

    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Classification failure: {exc}") from exc


@router.get("/supported")
async def get_supported_crops() -> dict:
    return {
        "model_name": MODEL_NAME,
        "model_version": MODEL_VERSION,
        "supported_crops": list(CLASSES),
        "display_names": CLASS_DISPLAY_NAMES,
        "categories": CLASS_TO_CATEGORY,
        "confidence_threshold": CONFIDENCE_THRESHOLD,
    }
