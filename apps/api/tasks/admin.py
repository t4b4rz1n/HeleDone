from django.contrib import admin

from .models import (
    AsyncStandup,
    Board,
    Task,
    TaskChecklistItem,
    TaskComment,
    TaskStatus,
)


@admin.register(Board)
class BoardAdmin(admin.ModelAdmin):
    list_display = ("title", "project", "order", "created_by", "created_at")
    list_select_related = ("project", "created_by")
    list_filter = ("project", "created_by", "is_deleted")
    search_fields = ("title", "project__name")
    ordering = ("order", "-created_at")

    def get_queryset(self, request):
        return self.model.all_objects.all()

    def save_model(self, request, obj, form, change):
        if change:
            old_obj = self.model.all_objects.get(pk=obj.pk)
            super().save_model(request, obj, form, change)
            if old_obj.is_deleted != obj.is_deleted:
                from .cascade_services import TaskCascadeService

                if obj.is_deleted:
                    TaskCascadeService.soft_delete_board(obj)
                else:
                    TaskCascadeService.restore_board(obj)
        else:
            super().save_model(request, obj, form, change)

    def delete_model(self, request, obj):
        obj.hard_delete()

    def delete_queryset(self, request, queryset):
        for obj in queryset:
            obj.hard_delete()


@admin.register(TaskStatus)
class TaskStatusAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "board", "order", "created_at")
    list_select_related = ("board",)
    list_filter = ("board", "is_deleted")
    search_fields = ("name", "code", "board__title")
    ordering = ("board", "order")

    def get_queryset(self, request):
        return self.model.all_objects.all()

    def save_model(self, request, obj, form, change):
        if change:
            old_obj = self.model.all_objects.get(pk=obj.pk)
            super().save_model(request, obj, form, change)
            if old_obj.is_deleted != obj.is_deleted:
                from .cascade_services import TaskCascadeService

                if obj.is_deleted:
                    TaskCascadeService.soft_delete_status(obj)
                else:
                    TaskCascadeService.restore_status(obj)
        else:
            super().save_model(request, obj, form, change)

    def delete_model(self, request, obj):
        obj.hard_delete()

    def delete_queryset(self, request, queryset):
        for obj in queryset:
            obj.hard_delete()


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = (
        "key",
        "title",
        "project",
        "milestone",
        "status",
        "priority",
        "get_assignees",
        "reporter",
        "due_date",
        "is_finished",
        "created_at",
    )
    list_select_related = ("project", "milestone", "status", "reporter")
    list_filter = ("project", "status", "priority", "is_deleted")
    search_fields = (
        "title",
        "description",
        "project__name",
        "assignees__username",
        "reporter__username",
    )
    ordering = ("-created_at",)
    raw_id_fields = ("project", "milestone", "reporter", "parent_task")
    filter_horizontal = ("assignees",)
    readonly_fields = ("number", "key")

    def get_assignees(self, obj):
        return ", ".join(u.username for u in obj.assignees.all())
    get_assignees.short_description = "Assignees"


    def get_queryset(self, request):
        return self.model.all_objects.all()

    def save_model(self, request, obj, form, change):
        if change:
            old_obj = self.model.all_objects.get(pk=obj.pk)
            super().save_model(request, obj, form, change)
            if old_obj.is_deleted != obj.is_deleted:
                from .cascade_services import TaskCascadeService

                if obj.is_deleted:
                    TaskCascadeService.soft_delete_task(obj)
                else:
                    TaskCascadeService.restore_task(obj)
        else:
            super().save_model(request, obj, form, change)

    def delete_model(self, request, obj):
        obj.hard_delete()

    def delete_queryset(self, request, queryset):
        for obj in queryset:
            obj.hard_delete()


@admin.register(TaskChecklistItem)
class TaskChecklistItemAdmin(admin.ModelAdmin):
    list_display = ("task", "description", "is_completed")
    list_select_related = ("task",)
    list_filter = ("is_completed", "is_deleted")
    search_fields = ("task__title", "description")

    def get_queryset(self, request):
        return self.model.all_objects.all()

    def delete_model(self, request, obj):
        obj.hard_delete()

    def delete_queryset(self, request, queryset):
        for obj in queryset:
            obj.hard_delete()


@admin.register(TaskComment)
class TaskCommentAdmin(admin.ModelAdmin):
    list_display = ("task", "author", "created_at", "attached_file")
    list_select_related = ("task", "author")
    list_filter = ("is_deleted",)
    raw_id_fields = ("task", "author")
    search_fields = ("task__title", "author__username", "content")

    def get_queryset(self, request):
        return self.model.all_objects.all()

    def delete_model(self, request, obj):
        obj.hard_delete()

    def delete_queryset(self, request, queryset):
        for obj in queryset:
            obj.hard_delete()


@admin.register(AsyncStandup)
class AsyncStandupAdmin(admin.ModelAdmin):
    list_display = ("user", "created_at")
    list_select_related = ("user",)
    list_filter = ("created_at", "is_deleted")
    raw_id_fields = ("user",)
    search_fields = ("user__username", "yesterday_work", "today_work", "blockers")

    def get_queryset(self, request):
        return self.model.all_objects.all()

    def delete_model(self, request, obj):
        obj.hard_delete()

    def delete_queryset(self, request, queryset):
        for obj in queryset:
            obj.hard_delete()
