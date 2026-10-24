from django.db import migrations


def seed_default_ticket_types(apps, schema_editor):
    TicketType = apps.get_model("panel", "TicketType")
    default_types = [
        "پشتیبانی فنی",
        "امور مالی و صورت‌حساب",
        "گزارش خطا و باگ",
        "درخواست و پیشنهادات",
    ]
    for name in default_types:
        TicketType.objects.get_or_create(name=name)


def rollback_default_ticket_types(apps, schema_editor):
    TicketType = apps.get_model("panel", "TicketType")
    default_types = [
        "پشتیبانی فنی",
        "امور مالی و صورت‌حساب",
        "گزارش خطا و باگ",
        "درخواست و پیشنهادات",
    ]
    TicketType.objects.filter(name__in=default_types).delete()


class Migration(migrations.Migration):
    dependencies = [("panel", "0007_notification_message_data")]

    operations = [
        migrations.RunPython(seed_default_ticket_types, rollback_default_ticket_types),
    ]
