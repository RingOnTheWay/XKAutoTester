"""
验证码识别工具模块
使用ddddocr库实现验证码OCR识别
"""

import base64
import logging

logger = logging.getLogger(__name__)

# OCR 不可用 / 识别失败时的默认验证码
DEFAULT_CAPTCHA = "0721"


class CaptchaRecognizer:
    """验证码识别工具类"""

    def __init__(self):
        self.ocr = None
        self._init_ocr()

    def _init_ocr(self):
        """初始化OCR引擎"""
        try:
            import ddddocr

            self.ocr = ddddocr.DdddOcr()
            logger.info("ddddocr初始化成功")
        except ImportError:
            logger.warning("ddddocr库未安装，将使用固定验证码")
            self.ocr = None
        except Exception as e:
            logger.warning(f"ddddocr初始化失败: {e}，将使用固定验证码")
            self.ocr = None

    def recognize_captcha_from_base64(self, base64_data: str) -> str:
        """
        从base64数据识别验证码

        Args:
            base64_data: base64编码的图片数据

        Returns:
            识别出的验证码文本
        """
        if not self.ocr:
            logger.warning("OCR不可用，使用固定验证码")
            return DEFAULT_CAPTCHA  # 默认验证码

        try:
            # 移除base64前缀（如果有）
            if "," in base64_data:
                base64_data = base64_data.split(",")[1]

            # 对URL编码的base64数据进行解码
            import urllib.parse

            base64_data = urllib.parse.unquote(base64_data)

            # 解码base64数据
            image_data = base64.b64decode(base64_data)

            # 使用ddddocr识别验证码
            captcha_text = self.ocr.classification(image_data)

            logger.info(f"验证码识别结果: {captcha_text}")
            return captcha_text

        except Exception as e:
            logger.error(f"验证码识别失败: {e}")
            return DEFAULT_CAPTCHA  # 识别失败时使用默认验证码

    def recognize_captcha_from_element(self, page, selector: str = "img") -> str:
        """
        从页面元素识别验证码

        Args:
            page: Playwright页面对象
            selector: 验证码图片选择器，默认为"img"

        Returns:
            识别出的验证码文本
        """
        if not self.ocr:
            logger.warning("OCR不可用，使用固定验证码")
            return DEFAULT_CAPTCHA

        try:
            # 获取验证码图片元素
            captcha_img = page.locator(selector).nth(1)  # 第二个img元素

            # 获取base64数据
            base64_data = captcha_img.get_attribute("src")

            if not base64_data or not base64_data.startswith("data:image"):
                logger.warning("未找到有效的验证码图片，使用固定验证码")
                return DEFAULT_CAPTCHA

            return self.recognize_captcha_from_base64(base64_data)

        except Exception as e:
            logger.error(f"从元素识别验证码失败: {e}")
            return DEFAULT_CAPTCHA
