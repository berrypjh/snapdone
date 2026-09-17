package main

import (
	"context"
	"log"
	"os"

	"snapdone/api/internal/database"
)

func main() {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		log.Fatal("DATABASE_URL is not set; see apps/api/.env.example")
	}
	ctx := context.Background()

	pool, err := database.Open(ctx, url)
	if err != nil {
		log.Fatalf("migrate failed to open database: %v", err)
	}
	defer pool.Close()

	pending, err := database.Pending(ctx, pool)
	if err != nil {
		log.Fatalf("migrate failed to read state: %v", err)
	}
	if err := database.Migrate(ctx, pool); err != nil {
		log.Fatalf("migrate failed: %v", err)
	}
	log.Printf("migrate applied %d migration(s): %v", len(pending), pending)
}
