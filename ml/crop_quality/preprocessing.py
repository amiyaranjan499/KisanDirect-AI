from io import BytesIO

import numpy as np
from PIL import Image, UnidentifiedImageError


class InvalidCropImageError(ValueError):
    pass


class CropQualityPreprocessor:
    image_size = (224, 224)
    # ImageNet normalization statistics matching PyTorch/torchvision training
    _mean = np.array([0.485, 0.456, 0.406], dtype=np.float32).reshape(1, 3, 1, 1)
    _std = np.array([0.229, 0.224, 0.225], dtype=np.float32).reshape(1, 3, 1, 1)

    def load_image(self, content: bytes) -> Image.Image:
        """Decode image bytes and return an RGB PIL Image resized to (224, 224)."""
        try:
            with Image.open(BytesIO(content)) as image:
                image.verify()
            with Image.open(BytesIO(content)) as image:
                return image.convert("RGB").resize(self.image_size, Image.Resampling.BILINEAR)
        except (UnidentifiedImageError, OSError) as exc:
            raise InvalidCropImageError("Uploaded file is not a valid image") from exc

    def to_normalized_tensor(self, image: Image.Image) -> np.ndarray:
        """Convert PIL Image to ImageNet-normalized Float32 NCHW tensor (1, 3, 224, 224)."""
        rgb_image = image.convert("RGB")
        if rgb_image.size != self.image_size:
            rgb_image = rgb_image.resize(self.image_size, Image.Resampling.BILINEAR)

        # Convert to float array in range [0.0, 1.0]
        arr = np.array(rgb_image, dtype=np.float32) / 255.0
        # HWC (224, 224, 3) -> CHW (3, 224, 224)
        chw = np.transpose(arr, (2, 0, 1))
        # Add batch dimension: NCHW (1, 3, 224, 224)
        nchw = np.expand_dims(chw, axis=0)
        # Apply ImageNet normalization: (x - mean) / std
        normalized = (nchw - self._mean) / self._std
        return normalized.astype(np.float32)

    def preprocess(self, content: bytes) -> np.ndarray:
        """Decode image bytes and return normalized NCHW Float32 tensor for ONNX inference."""
        image = self.load_image(content)
        return self.to_normalized_tensor(image)
