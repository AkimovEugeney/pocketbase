FROM alpine:3.20

ARG PB_VERSION=0.37.5

RUN apk add --no-cache ca-certificates unzip curl

RUN set -eux; \
  ARCH_RAW="$(uname -m)"; \
  case "$ARCH_RAW" in \
    x86_64) ARCH="amd64" ;; \
    aarch64|arm64) ARCH="arm64" ;; \
    *) echo "Unsupported architecture: $ARCH_RAW"; exit 1 ;; \
  esac; \
  URL="https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${ARCH}.zip"; \
  echo "Downloading $URL"; \
  curl -fL "$URL" -o /tmp/pb.zip; \
  unzip /tmp/pb.zip -d /pb/; \
  rm -f /tmp/pb.zip; \
  chmod +x /pb/pocketbase; \
  /pb/pocketbase --version

RUN mkdir -p /pb/pb_data /pb/pb_migrations /pb/pb_hooks

WORKDIR /pb

COPY pb_migrations /pb/pb_migrations
COPY pb_hooks /pb/pb_hooks

EXPOSE 8080

CMD ["sh", "-c", "/pb/pocketbase migrate up --dir /pb/pb_data --migrationsDir /pb/pb_migrations && /pb/pocketbase serve --http=0.0.0.0:${PORT:-8080} --dir /pb/pb_data --hooksDir /pb/pb_hooks"]
