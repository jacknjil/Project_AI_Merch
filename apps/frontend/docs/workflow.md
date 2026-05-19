# Development & Deployment Workflow

This guide outlines the standard lifecycle for updating the **AI Merch Store**. We use a **Feature Branch** workflow paired with **Continuous Deployment**.

## 1. The Development Loop (Local)

Never edit `main` directly. All changes start on a secure, isolated branch.

### Step 1: Create a Branch

Choose a descriptive name for your task.

```bash
# Good examples: feature/seo-update, fix/cart-bug, chore/update-deps
git checkout -b feature/your-feature-name
```

### Step 2: Develop & Test

Make your code changes.

- Run `npm run dev` to test locally at `http://localhost:3000`.
- Ensure no secrets (API keys) are hardcoded.

### Step 3: Commit

Use atomic commits with clear messages.

```bash
git add .
git commit -m "feat: add newsletter signup form"
```

## 2. The Deployment Trigger (GitHub)

When your feature is ready to go live:

### Step 1: Push to Remote

```bash
git push origin feature/your-feature-name
```

### Step 2: Create & Merge Pull Request (The "Go Live" Button)

This is the most critical step. It moves code from your "draft" branch to the "production" branch.

1. **Navigate**: Go to the [GitHub Repository](https://github.com/jacknjil/Project_AI_Merch).
2. **Compare**: You will often see a yellow bar saying "feature/xyz had recent pushes". Click **"Compare & pull request"**.
3. **Create**:
   - Add a title (e.g., "feat: Add Product Catalog").
   - Click **"Create pull request"**.
4. **Merge (The Finish Line)**:
   - Scroll to the bottom of the PR page.
   - Click the green **"Merge pull request"** button.
   - Click **"Confirm merge"**.

> **Note**: Merging into `main` automatically triggers the live deployment via Firebase App Hosting.

## 3. Automation (Firebase App Hosting)

1. **Detection**: Firebase detects the merge to `main`.
2. **Build**: It automatically runs `npm run build` in a secure cloud container.
3. **Deploy**: If the build passes, it replaces the live traffic with the new version.

### Monitoring

- You can watch the build status in the [Firebase Console](https://console.firebase.google.com/) under **App Hosting**.
- If a build fails, the "Live" site remains on the previous working version (Safe Rollbacks).
