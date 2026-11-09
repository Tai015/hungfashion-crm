FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci

COPY client ./client
COPY server/.env.example server/.env.example
RUN npm run build --workspace client

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    SERVE_CLIENT=true \
    PYTHON_EXECUTABLE=python3 \
    FEEDBACK_UPLOAD_DIR=/data/feedback \
    CHAT_UPLOAD_DIR=/data/chat \
    PATH=/opt/venv/bin:$PATH

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl gnupg python3 python3-venv \
    && install -d /usr/share/postgresql-common/pgdg \
    && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
      | gpg --dearmor -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg \
    && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client-16 \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/venv

WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci --omit=dev

COPY server ./server
COPY scripts ./scripts
COPY data ./data
RUN /opt/venv/bin/pip install --no-cache-dir -r server/settings/requirements.txt \
    && mkdir -p /data/feedback /data/chat

EXPOSE 8080
CMD ["node", "server/src/index.js"]
