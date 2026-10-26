from django.conf import settings
from django.contrib.auth import get_user_model, logout
from django.middleware.csrf import get_token
from django.shortcuts import redirect
from django.urls import reverse
from django.utils.http import url_has_allowed_host_and_scheme
from django.views import View
from rest_framework import generics, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .cookie_auth import (
    clear_auth_cookies,
    enforce_csrf,
    set_auth_cookies,
    set_csrf_cookie,
    uses_cookie_transport,
)
from .serializers import (
    CookieAwareTokenRefreshSerializer,
    LogoutSerializer,
    MyTokenObtainPairSerializer,
    UserRegisterSerializer,
)

User = get_user_model()


class SwaggerSessionLogoutView(View):
    http_method_names = ["get", "post", "head", "options"]

    def get(self, request, *args, **kwargs):
        return self.logout(request)

    def post(self, request, *args, **kwargs):
        return self.logout(request)

    def logout(self, request):
        next_url = (
            request.GET.get("next") or request.POST.get("next") or reverse("schema-swagger-ui")
        )
        allowed_hosts = {request.get_host(), *settings.ALLOWED_HOSTS}

        if not url_has_allowed_host_and_scheme(
            next_url,
            allowed_hosts=allowed_hosts,
            require_https=request.is_secure(),
        ):
            next_url = reverse("schema-swagger-ui")

        logout(request)
        return redirect(next_url)


from rest_framework.throttling import ScopedRateThrottle


class UserRegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    permission_classes = (AllowAny,)
    serializer_class = UserRegisterSerializer
    throttle_classes = (ScopedRateThrottle,)
    throttle_scope = "login"


class MyTokenObtainPairView(TokenObtainPairView):
    serializer_class = MyTokenObtainPairSerializer
    authentication_classes = ()
    throttle_classes = (ScopedRateThrottle,)
    throttle_scope = "login"

    def post(self, request, *args, **kwargs):
        if uses_cookie_transport(request):
            enforce_csrf(request)
        response = super().post(request, *args, **kwargs)
        if response.status_code == status.HTTP_200_OK and uses_cookie_transport(request):
            access = response.data.get("access")
            refresh = response.data.get("refresh")
            if access and refresh:
                set_auth_cookies(response, access, refresh)
                response.data.pop("access", None)
                response.data.pop("refresh", None)
        return response


class CookieAwareTokenRefreshView(TokenRefreshView):
    serializer_class = CookieAwareTokenRefreshSerializer
    authentication_classes = ()

    def post(self, request, *args, **kwargs):
        if uses_cookie_transport(request):
            enforce_csrf(request)
        response = super().post(request, *args, **kwargs)
        if uses_cookie_transport(request):
            access = (
                response.data.get("access") if response.status_code == status.HTTP_200_OK else None
            )
            refresh = (
                response.data.get("refresh") if response.status_code == status.HTTP_200_OK else None
            )
            if access:
                set_auth_cookies(response, access, refresh)
                response.data.pop("access", None)
                response.data.pop("refresh", None)
            else:
                clear_auth_cookies(response)
        return response


class CsrfCookieView(APIView):
    permission_classes = (AllowAny,)
    authentication_classes = ()

    def get(self, request):
        response = Response({"csrfToken": get_token(request)})
        set_csrf_cookie(response, request)
        return response


class LogoutView(APIView):
    permission_classes = (AllowAny,)
    authentication_classes = ()

    def post(self, request):
        if uses_cookie_transport(request):
            enforce_csrf(request)
            refresh_token = request.COOKIES.get(settings.AUTH_REFRESH_COOKIE_NAME)
            response = Response(status=status.HTTP_204_NO_CONTENT)
            if refresh_token:
                try:
                    RefreshToken(refresh_token).blacklist()
                except TokenError:
                    pass
            clear_auth_cookies(response)
            return response

        serializer = LogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            refresh_token = serializer.validated_data["refresh"]
            token = RefreshToken(refresh_token)
            token.blacklist()

            return Response(status=status.HTTP_204_NO_CONTENT)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
