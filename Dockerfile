FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

# Install production dependencies only, using the backend lockfile.
COPY backend/package.json backend/package-lock.json ./backend/
RUN npm --prefix backend ci --omit=dev --no-audit --no-fund

# Application code
COPY backend ./backend
COPY frontend ./frontend
COPY package.json ./package.json

RUN addgroup -S edtsp && adduser -S edtsp -G edtsp \
    && chown -R edtsp:edtsp /app

USER edtsp

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:5000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "backend/server.js"]
