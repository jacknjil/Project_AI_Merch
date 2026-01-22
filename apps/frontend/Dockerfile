# ---------- Build stage ----------
FROM node:20-alpine AS builder

# Create app directory
WORKDIR /app

# Copy package files first (better layer caching)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the app source
COPY . .

# If you have a .env.production file, copy it in so Next can see it at build time
# (Optional, but helpful if you use NEXT_PUBLIC_ vars at build)
# COPY .env.production .env.production

# Build Next.js app (uses .env.production automatically if present)
RUN npm run build

# ---------- Runtime stage ----------
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy package files and install *runtime* deps
COPY package*.json ./
RUN npm install --omit=dev

# Copy built app and public assets from builder stage
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

# If you have any config files needed at runtime (next.config, etc.), copy them too
COPY --from=builder /app/next.config.* ./ || true

# Next.js will listen on port 3000 by default
EXPOSE 3000

# Start the production server
CMD ["npm", "start"]
