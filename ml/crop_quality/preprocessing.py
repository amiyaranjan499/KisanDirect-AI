from io import BytesIO

from PIL import Image, UnidentifiedImageError


class InvalidCropImageError(ValueError):
    pass


class CropQualityPreprocessor:
    image_size = (224, 224)

    def preprocess(self, content: bytes) -> Image.Image:
        try:
            with Image.open(BytesIO(content)) as image:
                image.verify()
            with Image.open(BytesIO(content)) as image:
                return image.convert("RGB").resize(self.image_size, Image.Resampling.LANCZOS)
        except (UnidentifiedImageError, OSError) as exc:
            raise InvalidCropImageError("Uploaded file is not a valid image") from exc
