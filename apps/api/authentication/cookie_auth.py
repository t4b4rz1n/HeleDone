from django.conf import settings
from django.middleware.csrf import get_token
from rest_framework.authentication import CSRFCheck
from rest_framework.exceptions import PermissionDenied
from rest_framework_simplejwt.authentication import JWTAuthentication

COOKIE_TRANSPORT_HEADER = "X-Auth-Transport"
COOKIE_TRANSPORT_VALUE = "cookie"


def uses_cookie_transport(request):
    return request.headers.get(COOKIE_TRANSPORT_HEADER, "").lower() == COOKIE_TRANSPORT_VALUE


def enforce_csrf(request):
    check = CSRFCheck(lambda _request: None)
    check.process_request(request)
    reason = check.process_view(request, lambda _request: None, (), {})
    if reason:
        raise PermissionDenied(f"CSRF verification failed: {reason}")


def set_auth_cookies(response, access, refresh=None):
    cookie_options = {
        "path": settings.AUTH_COOKIE_PATH,
        "domain": settings.AUTH_COOKIE_DOMAIN,
        "secure": settings.AUTH_COOKIE_SECURE,
        "httponly": True,
        "samesite": settings.AUTH_COOKIE_SAMESITE,
    }
    access_age = int(settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds())
    response.set_cookie(
        settings.AUTH_ACCESS_COOKIE_NAME,
        access,
        max_age=access_age,
        **cookie_options,
    )
    if refresh:
        refresh_age = int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds())
        response.set_cookie(
            settings.AUTH_REFRESH_COOKIE_NAME,
            refresh,
            max_age=refresh_age,
            **cookie_options,
        )


def clear_auth_cookies(response):
    response.delete_cookie(
        settings.AUTH_ACCESS_COOKIE_NAME,
        path=settings.AUTH_COOKIE_PATH,
        domain=settings.AUTH_COOKIE_DOMAIN,
        samesite=settings.AUTH_COOKIE_SAMESITE,
    )
    response.delete_cookie(
        settings.AUTH_REFRESH_COOKIE_NAME,
        path=settings.AUTH_COOKIE_PATH,
        domain=settings.AUTH_COOKIE_DOMAIN,
        samesite=settings.AUTH_COOKIE_SAMESITE,
    )


def set_csrf_cookie(response, request):
    token = get_token(request)
    response.set_cookie(
        settings.CSRF_COOKIE_NAME,
        request.META["CSRF_COOKIE"],
        max_age=settings.CSRF_COOKIE_AGE,
        path=settings.CSRF_COOKIE_PATH,
        domain=settings.CSRF_COOKIE_DOMAIN,
        secure=settings.AUTH_COOKIE_SECURE,
        httponly=False,
        samesite=settings.AUTH_COOKIE_SAMESITE,
    )
    return token


class CookieJWTAuthentication(JWTAuthentication):
    """Accept legacy Bearer headers or JWTs in HttpOnly cookies with CSRF checks."""

    def authenticate(self, request):
        if uses_cookie_transport(request) and request.method not in ("GET", "HEAD", "OPTIONS", "TRACE"):
            enforce_csrf(request)
        return super().authenticate(request)

    def get_header(self, request):
        header = super().get_header(request)
        if header:
            return header
        if not uses_cookie_transport(request):
            return None
        token = request.COOKIES.get(settings.AUTH_ACCESS_COOKIE_NAME)
        if not token:
            return None
        return self.header_types[0] + b" " + token.encode("ascii")
