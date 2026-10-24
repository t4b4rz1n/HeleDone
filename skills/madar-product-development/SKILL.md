---
name: madar-product-development
description: Use the Madar product roadmap and engineering rules when planning, reviewing, or implementing any feature in this repository, especially work involving users, organizations, projects, tasks, time tracking, dashboards, notifications, gamification, finance, OKRs, knowledge, wellbeing, reporting, search, or Git integrations.
---

# Madar Product Development

Use this skill as the product and architecture contract for the Madaar repository. It turns the North Star PRD into an incremental implementation plan while preserving the current Django/DRF, React/Vite, PostgreSQL, Redis/Celery, and Docker architecture.

## Required workflow

1. Read [product-roadmap.md](references/product-roadmap.md) and identify the module, phase, user role, and MVP boundary for the requested work.
2. Inspect the existing module before editing. Reuse its models, services, permissions, API conventions, query keys, and UI patterns; do not create a parallel implementation.
3. Read [engineering-standards.md](references/engineering-standards.md) and apply the relevant backend, frontend, security, i18n, performance, and UX rules.
4. Trace the feature end to end: data model → migration → serializer/validation → service → permission/queryset → versioned endpoint → API client/types → query/mutation → page/component/route.
5. Keep the change phase-appropriate. Build the smallest complete vertical slice and leave future-phase extension points only where they are cheap and concrete.
6. Add or update tests for business rules, permissions, API behavior, and important UI state transitions. Do not claim verification when the local dependency environment prevents it.
7. Before handoff, report the changed files, API contract, migration requirements, permission model, known limitations, and verification results.

## Product boundaries

- Phase 1 is the delivery priority: identity/organization, projects, tasks/Kanban, basic time and attendance, base dashboards, and essential notifications.
- Phase 2 follows operational adoption: gamification, payroll/bonus, requests, performance, culture, global search, and Git integrations.
- Phase 3 adds maturity and intelligence: OKRs, knowledge wiki, wellbeing, resource planning, project health, advanced reporting, and complex automation.
- Do not implement a Phase 2 or 3 subsystem as a shortcut inside an unrelated Phase 1 model. Create a clear module boundary and a minimal integration point instead.

## Repository-specific invariants

- Backend APIs stay under `/api/v1/` and use the existing `ApiRenderer` response envelope.
- Business logic belongs in an app service layer; views coordinate requests and responses.
- Use `BaseModel`/soft delete conventions, UUID-safe relations, `transaction.atomic()` for multi-write operations, and explicit indexes for frequent filters.
- Enforce organization/project isolation in both querysets and object/action permissions. Never rely only on frontend visibility.
- Keep server state in React Query and local UI state in Zustand or component state. Follow the feature-driven frontend layout.
- Preserve dark/light theme support, RTL/LTR readiness, mobile-first layout, keyboard accessibility, and cleanup for timers/listeners/subscriptions.
- For polished interaction design, invoke the local `$apple-design` skill alongside this skill; apply its fluid-motion rules without sacrificing Madaar's RTL, accessibility, performance, or product constraints.
- For all `@mention`, tagging, comment or discussion features, invoke the `$unified-mention-system` skill to enforce the 4-layer architecture (UI, Backend, Automation, i18n).
- Use UTC/ISO timestamps at the API boundary and translated backend messages. Do not hardcode new user-facing text when the surrounding module has i18n support.

## Existing module map

Prefer the current apps before adding a new one:

- `accounts`, `authentication`, `organizations`: identity, roles, memberships, teams.
- `projects`: projects, members, milestones, activity feed.
- `tasks`: boards, statuses, tasks, subtasks, checklist, comments, activity, standups.
- `attendance`: attendance, time logs, timers, time off, holidays, timesheets.
- `automations`: event rules and Telegram/email notification channels.
- `reports`: read-only employee, manager, and executive analytics.
- `panel`, `dashboard`, `billing`: administrative, support/notification, and financial foundations.

## Scope decision rule

When the request is broad, first produce a phase/module breakdown and propose a vertical slice. When the request names a concrete feature, implement it end to end in the owning app. Ask for clarification only when a missing decision changes permissions, financial meaning, data retention, or the public API in a material way.
