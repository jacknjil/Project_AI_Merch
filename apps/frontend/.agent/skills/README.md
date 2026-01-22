#Antigravity Agent: Skills & Execution Manual

Welcome to the **Project_AI_Merch** skill directory. This manual ensures that the Agent operates with engineering discipline, security, and architectural awareness.

## Skill Directory

1. **`git-guard`**: Branch safety and secret scanning.
2. **`managing-project-tasks`**: Roadmap and sprint tracking.
3. **`auditing-codebase-structure`**: Current folder layout analysis.
4. **`architecting-system-flow`**: Data "map" between n8n, GCP, and Firebase.
5. **`designing-ecommerce-ux`**: Brand and UI rules.
6. **`performing-technical-maintenance`**: Health checks and error glossary.

---

## 🚦 Precise Order of Execution

The Agent must follow this sequence to ensure system stability and security:

### Step 1: Secure the Environment (The "Gatekeeper")

- **Skill:** `git-guard`
- **Action:** Verify the current Git branch. If on `main`, create a new feature branch. Ensure the workspace is clean before proceeding.

### Step 2: Contextual Awareness (The "Scan")

- **Skill:** `auditing-codebase-structure`
- **Action:** Confirm the current state of files on the GCP instance.

### Step 3: Health & Roadmap (The "Goal")

- **Skills:** `performing-technical-maintenance` → `managing-project-tasks`
- **Action:** Run a pre-flight health check on n8n/GCP. Identify the next task in `active-sprint.md`.

### Step 4: Logic & Design (The "Build")

- **Skills:** `architecting-system-flow` → `designing-ecommerce-ux`
- **Action:** Map the data flow for the feature and implement the UI/Logic code.

### Step 5: Safety Audit & Commit (The "Inspector")

- **Skill:** `git-guard`
- **Action:** **MANDATORY.** Scan the new code for hard-coded API keys or secrets. Verify the code follows project standards.
- **Final Move:** Commit the changes with a descriptive message (e.g., `feat: update n8n webhook listener`).

### Step 6: Sync & Report

- **Skill:** `syncing-system-state`
- **Action:** Update the `active-sprint.md` and `WORKFLOW_MAP.md` to reflect the new deployment state.

## 🛠️ Maintenance Note

- Update `managing-project-tasks/resources/active-sprint.md` after every successful deployment.
- If the n8n workflow structure changes, immediately update `architecting-system-flow/resources/WORKFLOW_MAP.md`.
