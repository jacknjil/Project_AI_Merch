name: architecting-system-flow
description: Defines the connections between Next.js, GCP, Firebase, n8n, and Google Sheets. Use this when debugging data flow or adding new steps to the AI generation pipeline.

---

# System Architecture: AI Merch Pipeline

## The Pipeline Map

1. **Trigger:** User interacts with the **Next.js Frontend** (GCP Instance).
2. **Logic:** Frontend sends a request/upload to **Firebase**.
3. **Automation:** **n8n** watches for changes, triggers AI Image Gen, and updates the **Google Sheet**.
4. **Feedback:** Frontend reads the updated status/image link from Firebase/Sheets.

## When to use this skill

- When the user says "The image isn't showing up."
- When adding a new step to the n8n workflow.
- When configuring Docker/GCP settings.

## Instructions for the Agent

- **Cross-Reference:** Before changing code in `apps/frontend`, check if it breaks the **n8n** webhook.
- **Logging:** Ensure all automated actions are mirrored in the **Google Sheet** for the user to audit.
- **Environment:** Treat the GCP Docker container as the production standard.

## Resources

- [See WORKFLOW_MAP.md](resources/WORKFLOW_MAP.md) (Step-by-step technical data flow)
