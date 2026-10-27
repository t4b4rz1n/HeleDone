"""Shared username-based mention parsing and safety limits."""

import re

from django.db.models import Q
from django.db.models.functions import Lower

MENTION_REGEX = re.compile(r"(?<![\w.+-])@([\w.-]+)", re.UNICODE)
USERNAME_REGEX = re.compile(r"^[\w.-]+$", re.UNICODE)
MAX_MENTIONS_PER_MESSAGE = 10


class MentionLimitExceeded(ValueError):
    pass


def extract_mentioned_usernames(text: str) -> list[str]:
    """Return unique mentioned usernames in lowercase, preserving their order."""
    if not text:
        return []
    return list(dict.fromkeys(username.casefold() for username in MENTION_REGEX.findall(text)))


def validate_mention_limit(text: str) -> list[str]:
    usernames = extract_mentioned_usernames(text)
    if len(usernames) > MAX_MENTIONS_PER_MESSAGE:
        raise MentionLimitExceeded(
            f"You can mention at most {MAX_MENTIONS_PER_MESSAGE} users in one message."
        )
    return usernames


def get_project_mention_users(project, usernames):
    """Resolve only active users explicitly included in the project or its teams."""
    from django.contrib.auth import get_user_model

    lowered = [str(username).casefold() for username in usernames if username]
    if not lowered:
        return []

    User = get_user_model()
    project_membership = Q(
        project_memberships__project=project,
        project_memberships__is_active=True,
        project_memberships__is_deleted=False,
    )
    team_membership = Q(
        team_memberships__team__project_memberships__project=project,
        team_memberships__team__project_memberships__is_active=True,
        team_memberships__team__project_memberships__is_deleted=False,
        team_memberships__team__is_deleted=False,
        team_memberships__is_deleted=False,
    )
    return list(
        User.objects.annotate(lower_username=Lower("username"))
        .filter(lower_username__in=lowered, is_active=True, is_deleted=False)
        .filter(project_membership | team_membership)
        .distinct()
    )
