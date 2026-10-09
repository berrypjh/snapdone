# Build context: apps/api
#   docker build -t snapdone-api apps/api
# The server runs as the entrypoint; the migrate job runs /migrate instead.
FROM golang:1.26 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server \
 && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/migrate ./cmd/migrate

FROM gcr.io/distroless/static-debian13:nonroot
COPY --from=build /out/server /server
COPY --from=build /out/migrate /migrate
ENV API_HOST=0.0.0.0 \
    API_ENV=production
EXPOSE 8080
ENTRYPOINT ["/server"]
