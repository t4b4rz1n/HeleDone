"""Rate limits for mention-bearing API requests."""

from collections.abc import Mapping

from rest_framework.throttling import SimpleRateThrottle

from common.mentions import extract_mentioned_usernames


def _contains_mention(value) -> bool:
    if isinstance(value, str):
        return bool(extract_mentioned_usernames(value))
    if isinstance(value, Mapping):
        return any(_contains_mention(child) for child in value.values())
    if isinstance(value, (list, tuple)):
        return any(_contains_mention(child) for child in value)
    return False


class MentionRateThrottle(SimpleRateThrottle):
    """Limit mention-bearing requests per authenticated user across endpoints."""

    scope = "mention"

    def allow_request(self, request, view):
        if not _contains_mention(request.data):
            return True
        return super().allow_request(request, view)
