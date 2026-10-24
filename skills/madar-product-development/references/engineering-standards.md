# Madaar engineering standards

Apply these rules when extending the repository. They are derived from the PRD and reconciled with the current codebase.

## Backend

- Use Django apps by domain, not a monolithic app.
- Keep all public endpoints versioned below `/api/v1/`.
- Keep business logic in `services.py` (or a focused service module); views should validate/coordinate/serialize.
- Use `transaction.atomic()` for multi-write operations and event-plus-domain mutations.
- Inherit domain models from `common.models.BaseModel` unless there is a documented reason not to. Preserve soft delete and use `all_objects` only for deliberate recovery/audit paths.
- Use UUIDs consistently. Do not convert UUID primary keys to integers in API clients or serializers.
- Add indexes for foreign keys and frequent filters; use constraints for uniqueness and cross-record invariants where possible.
- Enforce access at queryset level and permission/action level. Check organization, project membership, role, ownership and assignee as appropriate.
- Use `gettext_lazy` for new backend messages, validation errors and labels.
- Keep `USE_TZ=True`; persist UTC and expose ISO 8601 timestamps. Localize display time at the client boundary.
- Keep secrets and deployment configuration in environment variables; never commit `.env` files.

## API contract

- Match the existing `ApiRenderer` envelope: `status`, `message`, `data`, and `errors` for failures.
- Decide explicitly whether an endpoint uses the repository's rich `DefaultPagination` or DRF's pagination; keep the frontend extractor compatible with the chosen shape.
- Expose separate list/detail serializers where payload size or nested relationships differ.
- Add filters, ordering and search intentionally; do not expose arbitrary model fields.
- Return stable identifiers, machine-readable error codes for workflow blockers, and translated human-readable messages.

## Frontend

- Use React functional components, TypeScript, Vite, React Query and Zustand. Do not introduce Redux or a heavy UI framework.
- Keep API calls in the feature's `api/` folder, shared server state in query hooks, and feature types in `types/`.
- Use optimistic updates only when rollback and invalidation behavior are defined. Always handle pending/error states.
- Use Tailwind with mobile-first classes, logical properties (`ms`, `me`, `ps`, `pe`, `text-start`) and dark-mode variants.
- Prefer design tokens and existing theme variables over hardcoded one-off colors.
- Keep keyboard navigation, focus management, labels, Escape handling and responsive behavior in new dialogs/forms.
- Clean up `setInterval`, `setTimeout`, event listeners, subscriptions and WebSocket connections in `useEffect`.
- Lazy-load page routes when adding a substantial screen.
- Avoid `any` for new public API surfaces. Preserve UUIDs as `string | number` only where legacy compatibility requires it, with string preferred.
- **Unified Chat & Mention Standards**: All comment boxes, task descriptions, ticket discussions, and any future chat interfaces must use `<MentionTextarea>` (`apps/web/src/components/MentionTextarea.tsx`).
  - Dropdown positioning must calculate exact caret pixel coordinates (`computeMentionPopupPosition`) so the suggestions box always appears directly beneath the typed `@` symbol, dynamically flipping above if space below is limited.
  - Floating suggestions must be rendered via `createPortal(..., document.body)` with `position: fixed` to completely prevent clipping from ancestor `overflow: hidden`, `overflow: scroll`, modal bounds, or drawer containers.
  - All mention inputs must extract mentioned usernames upon saving/sending and trigger in-app notifications to mentioned users via backend signals.

## Testing and delivery

- Backend: cover model/service invariants, permissions, organization isolation, API success/error paths and migration behavior.
- Frontend: at minimum verify type-check/build and lint; for complex interactions cover optimistic rollback, query invalidation, modal focus and responsive states.
- Use focused conventional commits and the repository's branch/PR workflow.
- Update roadmap/status documentation when a module changes phase or becomes materially implemented.
- If dependencies or services are unavailable locally, run the checks that are possible, state the blocker, and do not present an unverified build as passing.
