"""captcha_recognizer 单元测试 (R24 P2-9 补测试缺口)。

覆盖:
- OCR 不可用 (ddddocr 未装) 时返回 DEFAULT_CAPTCHA
- base64 前缀剥离 + URL unquote + classification 调用 (注入假 OCR)
- classification 抛异常 → 默认验证码兜底
- 从页面元素识别: 有效 src / 无 data:image / 异常兜底
"""

from main.recognition.captcha_recognizer import DEFAULT_CAPTCHA, CaptchaRecognizer


class FakeOcr:
    def __init__(self, result: str = "AB12", error: bool = False) -> None:
        self.result = result
        self.error = error
        self.calls: list[bytes] = []

    def classification(self, image_data: bytes) -> str:
        self.calls.append(image_data)
        if self.error:
            raise RuntimeError("ocr boom")
        return self.result


class FakePageElement:
    def __init__(self, src: str | None) -> None:
        self._src = src

    def get_attribute(self, name: str) -> str | None:
        return self._src if name == "src" else None


class FakePage:
    def __init__(self, element: FakePageElement) -> None:
        self._element = element

    def locator(self, selector: str):
        class _Locator:
            def nth(self, index: int):
                return self._page._element  # noqa: B018  (简化: 忽略 selector/index)

        loc = _Locator()
        loc._page = self
        return loc


def make_recognizer(ocr=None) -> CaptchaRecognizer:
    # 跳过 __init__ (不真初始化 ddddocr — 本机已装, 构造会慢且输出广告噪音),
    # 直接注入假 OCR, 聚焦识别逻辑本身
    r = object.__new__(CaptchaRecognizer)
    r.ocr = ocr
    return r


def test_ocr_unavailable_returns_default() -> None:
    r = make_recognizer(ocr=None)
    assert r.recognize_captcha_from_base64("aGVsbG8=") == DEFAULT_CAPTCHA
    assert r.recognize_captcha_from_element(FakePage(FakePageElement("data:image/png;base64,x"))) == DEFAULT_CAPTCHA


def test_recognize_strips_base64_prefix_and_unquotes() -> None:
    ocr = FakeOcr(result="AB12")
    r = make_recognizer(ocr)
    # data:image/png;base64, 前缀 + URL 编码的 '=' (%3D) — unquote 后 base64 解码
    encoded = "data:image/png;base64,aGVsbG8%3D"
    assert r.recognize_captcha_from_base64(encoded) == "AB12"
    assert ocr.calls[0] == b"hello"


def test_recognize_plain_base64_without_prefix() -> None:
    ocr = FakeOcr(result="XY")
    r = make_recognizer(ocr)
    assert r.recognize_captcha_from_base64("aGk=") == "XY"
    assert ocr.calls[0] == b"hi"


def test_recognize_ocr_exception_falls_back() -> None:
    r = make_recognizer(ocr=FakeOcr(error=True))
    assert r.recognize_captcha_from_base64("aGk=") == DEFAULT_CAPTCHA
    assert r.recognize_captcha_from_element(FakePage(FakePageElement("data:image/png;base64,aGk="))) == DEFAULT_CAPTCHA


def test_recognize_from_element_valid_src() -> None:
    ocr = FakeOcr(result="ZZ9")
    r = make_recognizer(ocr)
    page = FakePage(FakePageElement("data:image/png;base64,aGVsbG8="))
    assert r.recognize_captcha_from_element(page) == "ZZ9"
    assert ocr.calls[0] == b"hello"


def test_recognize_from_element_non_image_src_falls_back() -> None:
    r = make_recognizer(ocr=FakeOcr())
    page = FakePage(FakePageElement("https://example.com/captcha.png"))
    assert r.recognize_captcha_from_element(page) == DEFAULT_CAPTCHA


def test_recognize_from_element_missing_src_falls_back() -> None:
    r = make_recognizer(ocr=FakeOcr())
    page = FakePage(FakePageElement(None))
    assert r.recognize_captcha_from_element(page) == DEFAULT_CAPTCHA
