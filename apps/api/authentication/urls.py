from django.urls import path

from .views import (
    CookieAwareTokenRefreshView,
    CsrfCookieView,
    LogoutView,
    MyTokenObtainPairView,
    UserRegisterView,
)

urlpatterns = [
    path("register/", UserRegisterView.as_view(), name="auth_register"),
    path("csrf/", CsrfCookieView.as_view(), name="auth_csrf"),
    path("login/", MyTokenObtainPairView.as_view(), name="auth_login"),
    path("login/refresh/", CookieAwareTokenRefreshView.as_view(), name="auth_refresh"),
    path("logout/", LogoutView.as_view(), name="auth_logout"),
]
