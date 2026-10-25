from datetime import timedelta
from pathlib import Path

import environ
from corsheaders.defaults import default_headers
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env(
    DEBUG=(bool, True),
    USE_SQLITE=(bool, False),
    USE_MINIO=(bool, False),
    ENABLE_FIELD_FILTER_PAGINATION=(bool, False),
    SANDBOX=(bool, True),
    ALLOWED_HOSTS=(list, ["localhost", "127.0.0.1"]),
    ALLOWED_CORS=(list, ["http://localhost:3000"]),
    CORS_ALLOW_CREDENTIALS=(bool, False),
    CSRF_TRUSTED_ORIGINS=(list, ["http://localhost"]),
    SECURE_SSL_REDIRECT=(bool, False),
    SESSION_COOKIE_SECURE=(bool, False),
    CSRF_COOKIE_SECURE=(bool, False),
)

environ.Env.read_env(BASE_DIR / ".env")

# --- Cache Configuration is defined below after DB config ---
REDIS_CACHE_URL = env("REDIS_CACHE_URL", default="redis://redis:6379/1")

SECRET_KEY = env("SECRET_KEY", default="django-insecure-CHANGE-ME-IN-PRODUCTION")
DEBUG = env("DEBUG")
ENABLE_FIELD_FILTER_PAGINATION = env("ENABLE_FIELD_FILTER_PAGINATION")
ALLOWED_HOSTS = env("ALLOWED_HOSTS")

if not DEBUG and SECRET_KEY == "django-insecure-CHANGE-ME-IN-PRODUCTION":
    raise ImproperlyConfigured("Set a production SECRET_KEY before running with DEBUG=False.")

# --- Application Definitions ---
DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "storages",
    "django_filters",
    "drf_spectacular",
]

LOCAL_APPS = [
    "accounts.apps.AccountsConfig",
    "authentication.apps.AuthenticationConfig",
    "billing.apps.BillingConfig",
    "common",
    "panel.apps.PanelConfig",
    "dashboard.apps.DashboardConfig",
    "organizations.apps.OrganizationsConfig",
    "projects.apps.ProjectsConfig",
    "tasks.apps.TasksConfig",
    "attendance.apps.AttendanceConfig",
    "automations.apps.AutomationsConfig",
    "reports.apps.ReportsConfig",
    "finance.apps.FinanceConfig",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

# --- Middleware ---
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.locale.LocaleMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

# --- URLs and WSGI ---
ROOT_URLCONF = "config.urls"

# --- Templates ---
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]
WSGI_APPLICATION = "config.wsgi.application"

# --- Custom User Model ---
AUTH_USER_MODEL = "accounts.User"

# --- Database Configuration ---
USE_SQLITE = env("USE_SQLITE")

if USE_SQLITE:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": env("DB_NAME", default="base_project_db"),
            "USER": env("DB_USER", default="base_project_user"),
            "PASSWORD": env("DB_PASSWORD", default="strong_password_123"),
            "HOST": env("DB_HOST", default="localhost"),
            "PORT": env("DB_PORT", default="5432"),
            "CONN_MAX_AGE": env.int("CONN_MAX_AGE", default=60),
        }
    }

# --- Cache Configuration ---
import socket


def _redis_available(url):
    try:
        from urllib.parse import urlparse

        parsed = urlparse(url)
        host = parsed.hostname or "localhost"
        port = parsed.port or 6379
        s = socket.create_connection((host, port), timeout=1)
        s.close()
        return True
    except Exception:
        return False


if _redis_available(REDIS_CACHE_URL):
    CACHES = {
        "default": {
            "BACKEND": "django_redis.cache.RedisCache",
            "LOCATION": REDIS_CACHE_URL,
            "OPTIONS": {
                "CLIENT_CLASS": "django_redis.client.DefaultClient",
            },
        }
    }
else:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        }
    }

# --- Password Validation ---
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
    {"NAME": "accounts.validators.ContainsUppercaseValidator"},
]

# --- Internationalization ---
LANGUAGE_CODE = "en-us"
# Business timezone for date boundaries (grid "today", standup locking).
# DB keeps storing UTC thanks to USE_TZ = True.
TIME_ZONE = "Asia/Tehran"
USE_I18N = True
USE_TZ = True
LOCALE_PATHS = [BASE_DIR / "locale"]
LANGUAGES = [
    ("en", "English"),
    ("fa", "Persian"),
]

# --- CORS (Cross-Origin Resource Sharing) ---
if DEBUG:
    CORS_ALLOW_ALL_ORIGINS = True
    CORS_ALLOW_CREDENTIALS = True
    CSRF_TRUSTED_ORIGINS = [
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
else:
    CORS_ALLOWED_ORIGINS = env("ALLOWED_CORS")
    CORS_ALLOW_CREDENTIALS = env("CORS_ALLOW_CREDENTIALS")
    CSRF_TRUSTED_ORIGINS = env("CSRF_TRUSTED_ORIGINS")

CORS_ALLOW_HEADERS = (*default_headers, "x-auth-transport")

# --- Static and Media Files (with MinIO/S3) ---
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "mediafiles"

# --- Ticket Attachments ---
TICKET_ATTACHMENT_MAX_FILE_SIZE = env.int(
    "TICKET_ATTACHMENT_MAX_FILE_SIZE",
    default=100 * 1024 * 1024,
)
TICKET_ATTACHMENT_MAX_FILES = env.int("TICKET_ATTACHMENT_MAX_FILES", default=5)
TICKET_ATTACHMENT_BLOCKED_EXTENSIONS = env.list(
    "TICKET_ATTACHMENT_BLOCKED_EXTENSIONS",
    default=[".exe", ".bat", ".cmd", ".sh"],
)

# MinIO (S3) Storage Settings
USE_MINIO = env("USE_MINIO")

if USE_MINIO:
    AWS_ACCESS_KEY_ID = env("AWS_ACCESS_KEY_ID", default=None)
    AWS_SECRET_ACCESS_KEY = env("AWS_SECRET_ACCESS_KEY", default=None)
    AWS_STORAGE_BUCKET_NAME = env("AWS_STORAGE_BUCKET_NAME", default=None)
    AWS_S3_ENDPOINT_URL = env("AWS_S3_ENDPOINT_URL", default=None)
    AWS_S3_CUSTOM_DOMAIN = env("AWS_S3_CUSTOM_DOMAIN", default=None)
    AWS_S3_OBJECT_PARAMETERS = {"CacheControl": "max-age=86400"}
    AWS_S3_FILE_OVERWRITE = False
    # Uploaded media can contain private project, attendance, and ticket data.
    # Honor explicit deployment settings while keeping uploads private by default.
    AWS_DEFAULT_ACL = env("AWS_DEFAULT_ACL", default="private")
    AWS_QUERYSTRING_AUTH = env.bool("AWS_QUERYSTRING_AUTH", default=True)
    AWS_S3_SIGNATURE_VERSION = "s3v4"
    AWS_S3_ADDRESSING_STYLE = "path"
    AWS_S3_REGION_NAME = "us-east-1"

    STORAGES = {
        "default": {
            "BACKEND": "storages.backends.s3boto3.S3Boto3Storage",
        },
        "staticfiles": {
            "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
        },
    }

    # Construct the media URL from the custom domain
    AWS_S3_URL_PROTOCOL = env("AWS_S3_URL_PROTOCOL", default="http:")
    if AWS_S3_CUSTOM_DOMAIN:
        MEDIA_URL = f"{AWS_S3_URL_PROTOCOL}//{AWS_S3_CUSTOM_DOMAIN}/"
    else:
        MEDIA_URL = f"{AWS_S3_ENDPOINT_URL}/{AWS_STORAGE_BUCKET_NAME}/"

# --- Default Primary Key Type ---
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

API_AUTHENTICATION_CLASSES = [
    "authentication.cookie_auth.CookieJWTAuthentication",
]

if DEBUG:
    API_AUTHENTICATION_CLASSES.append("rest_framework.authentication.SessionAuthentication")

# --- Django REST Framework (DRF) & JWT Settings ---
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": tuple(API_AUTHENTICATION_CLASSES),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_RENDERER_CLASSES": (
        "config.renderers.ApiRenderer",
        "rest_framework.renderers.BrowsableAPIRenderer",
    ),
    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ),
    "DEFAULT_PAGINATION_CLASS": "config.pagination.DefaultPagination",
    "PAGE_SIZE": 10,
    "EXCEPTION_HANDLER": "config.exception_handler.custom_exception_handler",
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_THROTTLE_CLASSES": (
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ),
    "DEFAULT_THROTTLE_RATES": {
        "anon": env("THROTTLE_RATE_ANON", default="60/minute"),
        "user": env("THROTTLE_RATE_USER", default="300/minute"),
        "login": env("THROTTLE_RATE_LOGIN", default="5/minute"),
    },
}

# --- SimpleJWT Settings ---
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(days=env.int("JWT_ACCESS_LIFETIME_DAYS", default=365)),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=env.int("JWT_REFRESH_LIFETIME_DAYS", default=730)),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

# JWT cookies are sent only to API paths and are protected from JavaScript.
# Secure defaults to enabled; local HTTP development must opt out explicitly.
AUTH_ACCESS_COOKIE_NAME = env("AUTH_ACCESS_COOKIE_NAME", default="madaar_access")
AUTH_REFRESH_COOKIE_NAME = env("AUTH_REFRESH_COOKIE_NAME", default="madaar_refresh")
AUTH_COOKIE_PATH = env("AUTH_COOKIE_PATH", default="/api/")
AUTH_COOKIE_DOMAIN = env("AUTH_COOKIE_DOMAIN", default=None)
AUTH_COOKIE_SECURE = env.bool("AUTH_COOKIE_SECURE", default=True)
AUTH_COOKIE_SAMESITE = "Lax"

SPECTACULAR_SETTINGS = {
    "TITLE": "Madaar API",
    "DESCRIPTION": "Madaar backend API documentation",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "SWAGGER_UI_SETTINGS": {
        "persistAuthorization": True,
        "deepLinking": True,
        "displayOperationId": True,
        "filter": True,
        "tryItOutEnabled": True,
    },
    "COMPONENT_SPLIT_REQUEST": True,
    "TAGS": [
        {"name": "auth", "description": "Authentication endpoints"},
        {"name": "accounts", "description": "User account management"},
        {"name": "organizations", "description": "Organisation and team management"},
        {"name": "projects", "description": "Project, member, milestone and activity management"},
        {"name": "panel", "description": "Panel management"},
        {"name": "dashboard", "description": "Dashboard endpoints"},
        {"name": "support", "description": "Support endpoints"},
        {"name": "billing", "description": "Billing and payments"},
    ],
    "SCHEMA_PATH_PREFIX": "/api/v1/",
    "SERVE_PERMISSIONS": ["rest_framework.permissions.AllowAny"],
    "SERVERS": [
        {
            "url": env("API_PUBLIC_URL", default="/"),
            "description": "Current API server",
        },
    ],
}


# --- Email Settings ---
EMAIL_BACKEND = env("EMAIL_BACKEND", default="django.core.mail.backends.dummy.EmailBackend")
EMAIL_HOST = env("EMAIL_HOST", default="")
EMAIL_PORT = env.int("EMAIL_PORT", default=587)
EMAIL_HOST_USER = env("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", default="")
EMAIL_USE_TLS = env.bool("EMAIL_USE_TLS", default=True)
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="Madaar <noreply@madaar.io>")

# --- Payment Settings ---
SANDBOX = env("SANDBOX")
NOWPAYMENTS_API_KEY = env("NOWPAYMENTS_API_KEY", default=None)
NOWPAYMENTS_SANDBOX_API_KEY = env("NOWPAYMENTS_SANDBOX_API_KEY", default=None)

ZARINPAL_MERCHANT_ID = env("ZARINPAL_MERCHANT_ID", default=None)
CALLBACK_URL = env("CALLBACK_URL", default="https://example.com/payment/verify/")
CANCEL_URL = env("CANCEL_URL", default="https://example.com/payment/cancel/")

# --- Logging ---
LOGS_DIR = Path(env("LOGS_DIR", default=str(BASE_DIR / "logs")))
LOGS_DIR.mkdir(parents=True, exist_ok=True)
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "{levelname} {asctime} [{module}:{lineno}] {message}",
            "style": "{",
        },
        "simple": {
            "format": "{levelname} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "info_file": {
            "level": "INFO",
            "class": "logging.handlers.RotatingFileHandler",
            "filename": LOGS_DIR / "info.log",
            "maxBytes": 1024 * 1024 * 10,
            "backupCount": 5,
            "formatter": "verbose",
            "encoding": "utf-8",
        },
        "warning_file": {
            "level": "WARNING",
            "class": "logging.handlers.RotatingFileHandler",
            "filename": LOGS_DIR / "warning.log",
            "maxBytes": 1024 * 1024 * 10,
            "backupCount": 5,
            "formatter": "verbose",
            "encoding": "utf-8",
        },
        "error_file": {
            "level": "ERROR",
            "class": "logging.handlers.RotatingFileHandler",
            "filename": LOGS_DIR / "error.log",
            "maxBytes": 1024 * 1024 * 10,
            "backupCount": 5,
            "formatter": "verbose",
            "encoding": "utf-8",
        },
        "console": {
            "level": "DEBUG",
            "class": "logging.StreamHandler",
            "formatter": "simple",
        },
    },
    "loggers": {
        "django": {
            "handlers": ["console", "info_file", "warning_file", "error_file"],
            "level": "INFO",
            "propagate": True,
        },
        "django.request": {
            "handlers": ["error_file", "console"],
            "level": "ERROR",
            "propagate": False,
        },
    },
}

# --- Celery Settings ---
CELERY_BROKER_URL = env("CELERY_BROKER_URL", default="redis://localhost:6379/0")
CELERY_RESULT_BACKEND = env("CELERY_RESULT_BACKEND", default="redis://localhost:6379/0")
CELERY_TASK_ALWAYS_EAGER = env.bool("CELERY_TASK_ALWAYS_EAGER", default=DEBUG)

# --- Production Security ---
SECURE_SSL_REDIRECT = env("SECURE_SSL_REDIRECT")
# Enable only behind a trusted proxy that sanitizes X-Forwarded-Proto.
if env.bool("TRUST_PROXY_PROTO", default=False):
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = env("SESSION_COOKIE_SECURE")
SESSION_COOKIE_AGE = env.int("SESSION_COOKIE_AGE", default=365 * 24 * 60 * 60)
CSRF_COOKIE_SECURE = env("CSRF_COOKIE_SECURE")
SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_HTTPONLY = False
X_FRAME_OPTIONS = "DENY"

# Telegram Config
TELEGRAM_BOT_TOKEN = env("TELEGRAM_BOT_TOKEN", default=None)
TELEGRAM_BOT_USERNAME = env("TELEGRAM_BOT_USERNAME", default="")
TELEGRAM_WEBHOOK_SECRET = env("TELEGRAM_WEBHOOK_SECRET", default="")

# GitHub Config
GITHUB_WEBHOOK_SECRET = env("GITHUB_WEBHOOK_SECRET", default="")

# Celery Beat Schedule

from celery.schedules import crontab

CELERY_BEAT_SCHEDULE = {
    "check_approaching_tasks_daily": {
        "task": "tasks.tasks.check_approaching_tasks",
        "schedule": crontab(hour=8, minute=0),
    },
    "check_approaching_milestones_daily": {
        "task": "projects.tasks.check_approaching_milestones",
        "schedule": crontab(hour=8, minute=15),
    },
}
