import uuid
import django.core.validators
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models
import projects.models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("projects", "0016_add_progress_mode_to_project"),
    ]

    operations = [
        migrations.AlterField(
            model_name="projectactivity",
            name="entity_type",
            field=models.CharField(
                choices=[
                    ("project", "Project"),
                    ("member", "Member"),
                    ("milestone", "Milestone"),
                    ("board", "Board"),
                    ("task", "Task"),
                    ("file", "File"),
                ],
                max_length=20,
                verbose_name="Entity type",
            ),
        ),
        migrations.AlterField(
            model_name="projectactivity",
            name="event_type",
            field=models.CharField(
                choices=[
                    ("project_created", "Project created"),
                    ("project_updated", "Project updated"),
                    ("project_deleted", "Project deleted"),
                    ("member_added", "Member added"),
                    ("member_updated", "Member updated"),
                    ("member_removed", "Member removed"),
                    ("milestone_created", "Milestone created"),
                    ("milestone_updated", "Milestone updated"),
                    ("milestone_completed", "Milestone completed"),
                    ("milestone_deleted", "Milestone deleted"),
                    ("board_created", "Board created"),
                    ("board_updated", "Board updated"),
                    ("board_deleted", "Board deleted"),
                    ("status_added", "Status added"),
                    ("status_removed", "Status removed"),
                    ("task_created", "Task created"),
                    ("task_updated", "Task updated"),
                    ("task_completed", "Task completed"),
                    ("task_deleted", "Task deleted"),
                    ("task_comment_added", "Task comment added"),
                    ("task_checklist_updated", "Task checklist updated"),
                    ("file_uploaded", "File uploaded"),
                    ("file_deleted", "File deleted"),
                ],
                max_length=30,
                verbose_name="Event type",
            ),
        ),
        migrations.CreateModel(
            name="ProjectFile",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("is_deleted", models.BooleanField(db_index=True, default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "file",
                    models.FileField(
                        upload_to="project_files/%Y/%m/",
                        validators=[
                            django.core.validators.FileExtensionValidator(
                                allowed_extensions=[
                                    "pdf",
                                    "png",
                                    "jpg",
                                    "jpeg",
                                    "gif",
                                    "webp",
                                    "svg",
                                    "zip",
                                    "rar",
                                    "7z",
                                    "tar",
                                    "gz",
                                    "doc",
                                    "docx",
                                    "xls",
                                    "xlsx",
                                    "txt",
                                    "md",
                                    "csv",
                                ]
                            ),
                            projects.models.validate_project_file_size,
                        ],
                        verbose_name="File",
                    ),
                ),
                (
                    "name",
                    models.CharField(max_length=255, verbose_name="Original Name"),
                ),
                (
                    "description",
                    models.TextField(
                        blank=True, verbose_name="Description & Mentions"
                    ),
                ),
                (
                    "file_size",
                    models.CharField(
                        blank=True, max_length=50, verbose_name="File Size"
                    ),
                ),
                (
                    "file_type",
                    models.CharField(
                        blank=True, max_length=50, verbose_name="File Type"
                    ),
                ),
                (
                    "project",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="uploaded_files",
                        to="projects.project",
                        verbose_name="Project",
                    ),
                ),
                (
                    "uploaded_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="uploaded_project_files",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Uploaded by",
                    ),
                ),
            ],
            options={
                "verbose_name": "Project File",
                "verbose_name_plural": "Project Files",
                "ordering": ["-created_at"],
            },
        ),
    ]
