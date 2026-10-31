# ruff: noqa: F403, F405
from .settings import *

# Override cache backend for tests to use in-memory cache
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "test-cache",
    }
}

# Disable throttling limits for tests
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["login"] = "1000/minute"
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["anon"] = "1000/minute"
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["user"] = "1000/minute"

# Celery in-memory for tests
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True
CELERY_BROKER_URL = "memory://"
CELERY_RESULT_BACKEND = "cache+locmem://"
