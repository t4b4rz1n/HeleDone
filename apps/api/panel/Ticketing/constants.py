from django.utils.translation import get_language

CATEGORY_TRANSLATIONS = {
    "پشتیبانی فنی": {
        "fa": "پشتیبانی فنی",
        "en": "Technical Support",
    },
    "امور مالی و صورت‌حساب": {
        "fa": "امور مالی و صورت‌حساب",
        "en": "Billing & Finance",
    },
    "گزارش خطا و باگ": {
        "fa": "گزارش خطا و باگ",
        "en": "Bug Report",
    },
    "درخواست و پیشنهادات": {
        "fa": "درخواست و پیشنهادات",
        "en": "Feature Request & Feedback",
    },
    "Technical Support": {
        "fa": "پشتیبانی فنی",
        "en": "Technical Support",
    },
    "Billing & Finance": {
        "fa": "امور مالی و صورت‌حساب",
        "en": "Billing & Finance",
    },
    "Bug Report": {
        "fa": "گزارش خطا و باگ",
        "en": "Bug Report",
    },
    "Feature Request & Feedback": {
        "fa": "درخواست و پیشنهادات",
        "en": "Feature Request & Feedback",
    },
}


def get_translated_category_name(name: str, lang: str = None) -> str:
    if not name:
        return ""
    if not lang:
        lang = (get_language() or "fa").split("-")[0].lower()
    mapping = CATEGORY_TRANSLATIONS.get(name)
    if mapping and lang in mapping:
        return mapping[lang]
    return name
