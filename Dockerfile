FROM alpine:latest

ARG PB_VERSION=0.37.5

RUN apk add --no-cache \
    unzip \
    ca-certificates

# download and unzip PocketBase
ADD https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip /tmp/pb.zip
RUN unzip /tmp/pb.zip -d /pb/ && rm -f /tmp/pb.zip

# persistent app data directory
RUN mkdir -p /pb/pb_data
VOLUME ["/pb/pb_data"]

EXPOSE 8080

# apply migrations on start and run server
CMD ["sh", "-c", "/pb/pocketbase migrate up --dir /pb/pb_data && /pb/pocketbase serve --http=0.0.0.0:${PORT:-8080} --dir /pb/pb_data"]
