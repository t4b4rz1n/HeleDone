import re

import requests
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.urls import reverse


class Command(BaseCommand):
    help = "Sets up the Telegram Webhook for the local development server or production."

    def add_arguments(self, parser):
        parser.add_argument(
            "domain",
            type=str,
            help="The public domain (e.g. https://your-ngrok-url.ngrok-free.app)",
        )

    def handle(self, *args, **kwargs):
        domain = kwargs["domain"]

        # Ensure domain starts with https
        if not domain.startswith("https://"):
            self.stdout.write(self.style.ERROR("Domain must start with https://"))
            return

        # Strip trailing slash
        if domain.endswith("/"):
            domain = domain[:-1]

        bot_token = getattr(settings, "TELEGRAM_BOT_TOKEN", None)
        if not bot_token:
            self.stdout.write(self.style.ERROR("TELEGRAM_BOT_TOKEN is not set in settings/.env"))
            return

        secret_token = getattr(settings, "TELEGRAM_WEBHOOK_SECRET", "")
        if not secret_token or not re.fullmatch(r"[A-Za-z0-9_-]{1,256}", secret_token):
            raise CommandError(
                "TELEGRAM_WEBHOOK_SECRET must contain 1-256 letters, digits, underscores, or hyphens."
            )

        webhook_path = reverse("telegram_webhook")
        full_webhook_url = f"{domain}{webhook_path}"

        url = f"https://api.telegram.org/bot{bot_token}/setWebhook"
        payload = {"url": full_webhook_url}
        payload["secret_token"] = secret_token

        try:
            response = requests.post(url, json=payload, timeout=15)
            response.raise_for_status()
            data = response.json()
            if data.get("ok"):
                self.stdout.write(
                    self.style.SUCCESS(f"Successfully set webhook to: {full_webhook_url}")
                )
            else:
                self.stdout.write(
                    self.style.ERROR(f"Failed to set webhook: {data.get('description')}")
                )
        except requests.exceptions.RequestException as e:
            self.stdout.write(self.style.ERROR(f"Error making request to Telegram API: {e}"))
