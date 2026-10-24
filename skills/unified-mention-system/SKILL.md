---
name: unified-mention-system
description: Standardized 4-layer guide and production checklist for implementing, reviewing, and extending the unified @mention and notification system across Madaar (frontend MentionTextarea/MentionText, backend regex/signals, event dispatcher automations, and i18n).
---

# Unified Mention System (@mention)

This skill serves as the single source of truth for adding or maintaining `@mention` capabilities anywhere in Madaar (Task Descriptions, Task Comments, Ticket Discussions, File Comments, Knowledge Wiki, Chat, etc.).

Whenever a feature requires user tagging via `@`:
1. Follow the **4-Layer Architecture Contract** below.
2. Comply with the **Production Checklists** before marking the task complete.

---

## 1. Layer 1: Frontend (UI & Interaction)

### Core Components & Utilities
* **Input Component:** `apps/web/src/components/MentionTextarea.tsx`
  * Always use `<MentionTextarea>` instead of a plain `<textarea>`.
  * Renders floating suggestions via `createPortal(..., document.body)` with `position: fixed` to completely avoid clipping by parent dialogs, drawers, or `overflow: hidden` containers.
  * Calculates caret pixel coordinates using `apps/web/src/utils/caretPosition.ts` which uses an element recycling pattern to eliminate layout thrashing.
  * Provides keyboard navigation (`ArrowUp`, `ArrowDown`, `Enter`, `Tab`, `Escape`).
* **Display Component:** `apps/web/src/components/MentionText.tsx`
  * Renders stored text containing `@username` into highlighted, styled interactive badges (`MentionBadge`).
  * Links to user profiles or provides user details on hover.
* **Helper Utilities:** `apps/web/src/utils/mentionUtils.ts`
  * Formats member display names, handles mention triggers, and extracts usernames client-side if needed.

### Context-Aware Member Filtering
Pass only active, accessible members for the specific context:
* **Project context (Tasks, Milestones, Project Files):** Pass project members:
  ```tsx
  const members = projectMembers.map(m => ({
    id: m.user.id,
    username: m.user.username,
    name: m.user.name || m.user.username,
    avatar: m.user.avatar,
    is_active: m.user.is_active !== false,
  }));
  ```
* **Organization context (Tickets, General Discussions):** Pass active organization members.
* Ensure inactive or suspended users are excluded from the suggestions list.

### Immediate In-App Notification Invalidation
When the comment, description, or message is successfully submitted/saved, **always** invalidate notification queries in React Query so the recipient's notification bell updates immediately:
```tsx
const queryClient = useQueryClient();

// On mutation success:
queryClient.invalidateQueries({ queryKey: ["notification-unread"] });
queryClient.invalidateQueries({ queryKey: ["notification-history"] });
```

---

## 2. Layer 2: Backend (Data & Signal Processing)

### Standard Username Regex
Always use the standardized username extraction pattern:
```python
import re

MENTION_REGEX = re.compile(r"@([\w.-]+)")

def extract_mentioned_usernames(text: str) -> set[str]:
    if not text:
        return set()
    return {match.lower() for match in MENTION_REGEX.findall(text)}
```
* Supports alphanumeric characters, underscores (`_`), dots (`.`), and hyphens (`-`).
* Converts all extracted usernames to lowercase immediately.

### Case-Insensitive Database Querying
PostgreSQL is case-sensitive by default with `username__in`. Always use Django's `Lower` function:
```python
from django.contrib.auth import get_user_model
from django.db.models.functions import Lower

User = get_user_model()

# Match users safely regardless of input case
mentioned_users = list(
    User.objects.annotate(lower_uname=Lower("username"))
    .filter(lower_uname__in=list(lower_usernames), is_active=True)
)
```

### Differential Extraction (Preventing Duplicate Spam on Edit)
When editing an existing description or message:
1. Capture the original text in `pre_save` (e.g. `instance.__original_text = instance.description`).
2. In `post_save`, calculate the set difference:
   ```python
   previous_mentions = extract_mentioned_usernames(getattr(instance, "__original_text", ""))
   current_mentions = extract_mentioned_usernames(instance.text)
   newly_mentioned = current_mentions - previous_mentions
   ```
3. Only dispatch notifications for `newly_mentioned` users.

### Standard Signal / Model Helper Pattern
Place the extraction logic inside domain signals (`apps/api/<module>/signals.py`) or the model's `save()` method. Keep the logic concise and delegate notification dispatching to `automations.events.EventDispatcher`.

---

## 3. Layer 3: Automation & Notification Dispatcher

### Unified Event Dispatching
Never create ad-hoc notification records manually. Always use the repository's centralized event dispatcher:
```python
from automations.events import EventDispatcher

EventDispatcher.dispatch(
    event_type="user_mentioned",
    payload={
        "author_id": str(author.id) if author else None,
        "author_name": (author.get_full_name() or author.username) if author else "Someone",
        "recipient_ids": [str(user.id) for user in mentioned_users],
        "context_name": context_title,        # e.g. task.title, ticket.subject, file.name
        "context_type": "task",                # "task" | "ticket" | "file" | "wiki"
        "context_id": str(context_object.id),
        "task_id": str(task.id) if is_task else None,
        "ticket_id": str(ticket.id) if is_ticket else None,
        "project_id": str(project.id) if has_project else None,
        "comment_id": str(comment.id) if is_comment else None,
    }
)
```

### Smart Destination Routing in `_get_event_link`
Ensure `apps/api/automations/rules.py` knows how to build the clickable link for the new context:
```python
def _get_event_link(event_type: str, payload: dict) -> str:
    # Existing routes...
    if payload.get("ticket_id"):
        return f"/tickets/{payload['ticket_id']}"
    if payload.get("project_id") and payload.get("task_id"):
        return f"/projects/{payload['project_id']}/tasks/{payload['task_id']}"
    if payload.get("file_id"):
        return f"/projects/{payload.get('project_id')}/files/{payload['file_id']}"
    return "/"
```

### Security Authorization (`_is_recipient_authorized`)
In `apps/api/automations/rules.py`:
* For `user_mentioned`, verify the recipient has valid access to the target workspace or item before delivering external alerts (Telegram / Email), preventing information leakage across organizations or private projects.
* Allow in-app mention delivery if the user is explicitly identified in `recipient_ids`.

### Omnichannel Delivery
The `user_mentioned` rule dispatches notifications across 3 channels automatically:
1. **In-App Notification:** Stored in `NotificationHistory` and increments unread count in `NotificationCenter`.
2. **Telegram Bot:** Pushed to the user's connected Telegram chat ID via Celery.
3. **Email:** Sent via background task if user notification settings allow.

---

## 4. Layer 4: Internationalization (i18n)

### Notification Text Templates
Keep all user-facing notification copy localized in both English and Persian:
* **Backend Template (`apps/api/automations/rules.py`):**
  ```python
  def _fmt_user_mentioned(payload: dict) -> str:
      author = payload.get("author_name") or "Someone"
      context = payload.get("context_name") or "an item"
      return f"{author} mentioned you in <b>{context}</b>."
  ```
* **Frontend Translation Keys:**
  Add corresponding keys to:
  * `apps/web/src/i18n/locales/en.ts`
  * `apps/web/src/i18n/locales/fa.ts`

```typescript
// en.ts
mention: {
  placeholder: "Type @ to mention team members...",
  noMembersFound: "No members found",
  mentionedIn: "{author} mentioned you in {context}",
}

// fa.ts
mention: {
  placeholder: "برای منشن کردن اعضا @ را تایپ کنید...",
  noMembersFound: "کاربری یافت نشد",
  mentionedIn: "{author} شما را در {context} منشن کرد",
}
```

---

## 5. End-to-End Implementation Checklist

When adding `@mention` support to a new module (e.g. `knowledge`, `file_comments`, `standup_notes`):

- [ ] **Step 1: Frontend Input**
  - Replace `<textarea>` or input with `<MentionTextarea>`.
  - Pass the contextual `members` prop (filtered by project or organization).
- [ ] **Step 2: Frontend Display**
  - Wrap saved text with `<MentionText text={item.content} />` to display clickable mention badges.
- [ ] **Step 3: Cache Invalidation**
  - Invalidate `["notification-unread"]` and `["notification-history"]` upon successful mutation.
- [ ] **Step 4: Backend Model / Signal**
  - Cache previous text in `pre_save`.
  - In `post_save` (or `save()`), extract newly added mentions via `@([\w.-]+)`.
  - Query users with `Lower("username")__in`.
- [ ] **Step 5: Event Dispatcher**
  - Call `EventDispatcher.dispatch(event_type="user_mentioned", payload=...)`.
  - Verify `_get_event_link` in `rules.py` generates the correct URL.
- [ ] **Step 6: i18n & Verification**
  - Verify English and Persian strings.
  - Run Django test case verifying that saving text generates a `NotificationHistory` record.
