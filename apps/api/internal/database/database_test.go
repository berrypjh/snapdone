package database_test

import (
	"context"
	"errors"
	"slices"
	"testing"

	"snapdone/api/internal/database"
	"snapdone/api/internal/database/databasetest"
)

// 마이그레이션 후 인증 테이블이 모두 생기는지 확인한다.
func TestMigrateCreatesAuthTables(t *testing.T) {
	pool := databasetest.MigratedPool(t)
	ctx := context.Background()

	for _, table := range []string{"users", "identities", "profiles", "auth_sessions", "auth_transactions", "one_time_grants"} {
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
	if count != 2 {
		t.Errorf("schema_migrations rows = %d, want 2", count)
	}
}

// 마이그레이션 전에는 기동을 거부하고, 적용 후에는 통과한다.
func TestRequireMigratedFailsClosedUntilMigrated(t *testing.T) {
	pool := databasetest.Pool(t)
	ctx := context.Background()

	if err := database.RequireMigrated(ctx, pool); !errors.Is(err, database.ErrPendingMigrations) {
		t.Fatalf("before migrate: err = %v, want ErrPendingMigrations", err)
	}
	if err := database.Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	if err := database.RequireMigrated(ctx, pool); err != nil {
		t.Errorf("after migrate: %v", err)
	}
}

// 일부만 적용된 상태도 미적용으로 본다.
func TestPendingListsUnrecordedVersions(t *testing.T) {
	pool := databasetest.MigratedPool(t)
	ctx := context.Background()

	if _, err := pool.Exec(ctx, "DELETE FROM schema_migrations WHERE version = '0001_auth.sql'"); err != nil {
		t.Fatal(err)
	}
	pending, err := database.Pending(ctx, pool)
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Contains(pending, "0001_auth.sql") {
		t.Errorf("pending = %v, want 0001_auth.sql", pending)
	}
}
