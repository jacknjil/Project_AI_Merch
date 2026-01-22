---
name: git-guard
description: Enforces version control best practices and branch safety. Use this before every commit, push, or branch switch to prevent code loss or security leaks.
---

# Git Guard: Safety & Version Control

## When to use this skill

- Before starting a new feature (to ensure a fresh branch).
- Before committing code (to scan for secrets/keys).
- Before merging into `main` (to verify stability).

## The "Safety First" Protocol

### 1. The Zero-Main Rule

- **Action:** Never permit the agent to commit directly to `main` or `master`.
- **Validation:** If the current branch is `main`, the agent MUST run `git checkout -b feature/[task-name]`.

### 2. The Secret Scan

- **Action:** Before running `git add`, scan all changed files for "Secret Patterns."
- **Patterns:** Look for strings matching Firebase API keys, GCP Service Account JSONs, or n8n webhook secrets.
- **Red Alert:** If a secret is found, STOP and warn the user. Do NOT commit.

### 3. The Atomic Commit

- **Action:** Group changes by logic. Do not mix "Brand Identity" updates with "Maintenance" script updates.
- **Message Format:** `feat: [description]` or `fix: [description]`.

## Deployment Checklist

- [ ] No secrets found in code.
- [ ] Branch is a feature branch.
- [ ] `git pull origin main` performed to resolve conflicts.
- [ ] Commit message follows the project standard.
