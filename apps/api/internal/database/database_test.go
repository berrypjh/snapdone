package database_test

import (
	"context"
	"testing"

	"snapdone/api/internal/database"
	"snapdone/api/internal/database/databasetest"
)

// 마이그레이션 후 인증 테이블이 모두 생기는지 확인한다.
func TestMigrateCreatesAuthTables(t *testing.T) {
	pool := databasetest.MigratedPool(t)
	ctx := context.Background()

	for _, table := range []string{"users", "identities", "profiles", "sessions"} {
		var exists bool
		err := pool.QueryRow(ctx, "SELECT to_regclass($1) IS NOT NULL", table).Scan(&exists)
		if err != nil {
			t.Fatal(err)
		}
		if !exists {
			t.Errorf("table %s was not created", table)
		}
	}
}

// 마이그레이션을 두 번 돌려도 파일마다 한 번만 적용되는지 확인한다.
func TestMigrateIsIdempotent(t *testing.T) {
	pool := databasetest.Pool(t)
	ctx := context.Background()

	for range 2 {
		if err := database.Migrate(ctx, pool); err != nil {
			t.Fatal(err)
		}
	}

	var count int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM schema_migrations").Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Errorf("schema_migrations rows = %d, want 1", count)
	}
}
