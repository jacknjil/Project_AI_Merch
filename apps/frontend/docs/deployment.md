# Deployment Guide: Firebase App Hosting

This project is configured for **Firebase App Hosting**, a serverless solution built on Cloud Run that natively supports Next.js.

## Prerequisites

- A Firebase Project (Console -> Project Settings).
- A GitHub repository connected to the project.

## Configuration Files

1. **`next.config.js`**: configured with `output: 'standalone'` to optimize the container build.
2. **`apphosting.yaml`**: defines the service ID, region (`us-central1`), and instance limits.

## Environment Variables

The following secrets must be set in the Google Cloud Secret Manager and linked via the Firebase Console App Hosting settings:

| Variable Name                        | Description                                              | Confidential? |
| :----------------------------------- | :------------------------------------------------------- | :------------ |
| `OPENAI_API_KEY`                     | Key for DALL-E image generation.                         | **YES**       |
| `STRIPE_SECRET_KEY`                  | Secret key for Stripe Checkout.                          | **YES**       |
| `FIREBASE_ADMIN_CREDENTIALS`         | Service Account JSON for server-side Firebase Admin SDK. | **YES**       |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Public key for client-side Stripe elements.              | No            |
| `N8N_SHARED_SECRET`                  | Shared secret for securing webhooks (if applicable).     | **YES**       |

## Deployment Steps

1. **Commit**: Ensure all changes are committed and pushed to the `main` branch.
2. **Connect**:
   - Go to **Firebase Console** -> **App Hosting**.
   - Click "Get Started" and authorize GitHub.
   - Select this repository and the `main` branch.
   - **Root Directory**: Set to `apps/frontend` (since this is a monorepo structure).
3. **Deploy**: Firebase will automatically detect `next.config.js` and `apphosting.yaml` and trigger a Cloud Build.

## Troubleshooting

- **Build Fails**: Check Cloud Build logs. Ensure `output: 'standalone'` is set.
- **Runtime Errors**: Check Cloud Run logs. Most likely missing environment variables/secrets.
