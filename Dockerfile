# Production Dockerfile for WebMCP Dual-Accessibility Studio
FROM node:20-alpine

WORKDIR /app

# Copy package descriptors
COPY package.json pnpm-lock.yaml ./

# Install pnpm and dependencies
RUN npm install -g pnpm@11.17.0 && pnpm install --prod

# Copy source, public, and server files
COPY server.js axe.js axe.min.js ./
COPY src/ ./src/
COPY public/ ./public/

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "server.js"]
