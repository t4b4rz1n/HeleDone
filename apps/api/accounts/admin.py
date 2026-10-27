from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import User, WorkStyleProfile


class CustomUserAdmin(UserAdmin):
    def has_change_permission(self, request, obj=None):
        if obj and obj.is_superuser and obj.pk != request.user.pk:
            return False
        return super().has_change_permission(request, obj)

    def has_delete_permission(self, request, obj=None):
        if obj and obj.is_superuser and obj.pk != request.user.pk:
            return False
        return super().has_delete_permission(request, obj)

    fieldsets = (
        *UserAdmin.fieldsets,
        (
            "Custom Fields",
            {
                "fields": ("avatar", "phone_number"),
            },
        ),
    )

    list_display = ("username", "email", "first_name", "last_name", "phone_number", "is_staff")
    search_fields = ("username", "email", "first_name", "last_name", "phone_number")


@admin.register(WorkStyleProfile)
class WorkStyleProfileAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "communication_preference",
        "preferred_working_hours_start",
        "preferred_working_hours_end",
    )
    list_filter = ("communication_preference",)
    search_fields = ("user__username", "user__email", "disc_result", "neo_result")
    raw_id_fields = ("user",)


admin.site.register(User, CustomUserAdmin)
