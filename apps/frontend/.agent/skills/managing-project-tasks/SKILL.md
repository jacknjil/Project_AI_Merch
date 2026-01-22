---
name: managing-project-tasks
description: Manages the roadmap, tracks task completion, and coordinates between frontend and backend development. Use this skill when the user asks "What's next?", wants to update a feature list, or needs a status report on Project_AI_Merch.
---

# Project Management: Flight Controller

## When to use this skill

- To view or update the current development **Roadmap**.
- To move tasks from "To-Do" to "Done".
- To identify gaps in the "Full Stack" (e.g., missing API endpoints for the frontend).

## Workflow: Plan-Update-Report

1. **Plan:** Read `resources/roadmap.md` to see the high-level goals.
2. **Update:** Check the `apps/` directory for physical progress (e.g., "Is there a backend folder yet?").
3. **Report:** Provide a concise summary of what is finished and what is blocked.

## Instructions

- **Consistency:** Always update the `resources/active-sprint.md` file after a major task is completed.
- **Dependency Tracking:** If a frontend feature (like a "Buy" button) needs a backend (like "Stripe API"), flag it as "BLOCKED" until the backend exists.
- **Checklists:** Use the checklist format so the user can see progress at a glance.

## Resources

- 👉 **[`resources/roadmap.md`](resources/roadmap.md)** (The big picture)
- 👉 **[`resources/active-sprint.md`](resources/active-sprint.md)** (The current week's tasks)
