FROM alpine:latest

ARG PB_VERSION=0.37.5
ARG TARGETARCH

RUN apk add --no-cache unzip ca-certificates wget

RUN set -eux; \
  if [ "${TARGETARCH:-amd64}" = "arm64" ]; then ARCH="arm64"; else ARCH="amd64"; fi; \
  URL="https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${ARCH}.zip"; \
  echo "Downloading $URL"; \
  wget -O /tmp/pb.zip "$URL"; \
  unzip /tmp/pb.zip -d /pb/; \
  rm -f /tmp/pb.zip; \
  chmod +x /pb/pocketbase

RUN mkdir -p /pb/pb_data
VOLUME ["/pb/pb_data"]

EXPOSE 8080

CMD ["sh", "-c", "/pb/pocketbase migrate up --dir /pb/pb_data && /pb/pocketbase serve --http=0.0.0.0:${PORT:-8080} --dir /pb/pb_data"]
