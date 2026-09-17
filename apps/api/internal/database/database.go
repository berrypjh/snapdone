package database

import (
	"context"
	"embed"
	"errors"
	"fmt"
	"io/fs"
	"path"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/*.sql
var migrations embed.FS

const migrationLockID = 7_318_204_551

const createMigrationsTable = `CREATE TABLE IF NOT EXISTS schema_migrations (
	version    text PRIMARY KEY,
	applied_at timestamptz NOT NULL DEFAULT now()
)`

func Open(ctx context.Context, url string) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, fmt.Errorf("database config: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("database ping: %w", err)
	}
	return pool, nil
}

// 적용되지 않은 마이그레이션이 남아 있다.
var ErrPendingMigrations = errors.New("database: pending migrations")

// 적용되지 않은 마이그레이션을 순서대로 적용한다.
func Migrate(ctx context.Context, pool *pgxpool.Pool) error {
	names, err := fs.Glob(migrations, "migrations/*.sql")
	if err != nil {
		return err
	}
	for _, name := range names {
		if err := apply(ctx, pool, name); err != nil {
			return fmt.Errorf("migration %s: %w", path.Base(name), err)
		}
	}
	return nil
}

// schema_migrations에 기록되지 않은 마이그레이션 파일 이름을 돌려준다.
func Pending(ctx context.Context, pool *pgxpool.Pool) ([]string, error) {
	names, err := fs.Glob(migrations, "migrations/*.sql")
	if err != nil {
		return nil, err
	}
	applied := map[string]bool{}
	var exists bool
	if err := pool.QueryRow(ctx, "SELECT to_regclass('schema_migrations') IS NOT NULL").Scan(&exists); err != nil {
		return nil, err
	}
	if exists {
		rows, err := pool.Query(ctx, "SELECT version FROM schema_migrations")
		if err != nil {
			return nil, err
		}
		versions, err := pgx.CollectRows(rows, pgx.RowTo[string])
		if err != nil {
			return nil, err
		}
		for _, v := range versions {
			applied[v] = true
		}
	}
	var pending []string
	for _, name := range names {
		if version := path.Base(name); !applied[version] {
			pending = append(pending, version)
		}
	}
	return pending, nil
}

// 미적용 마이그레이션이 하나라도 있으면 ErrPendingMigrations를 반환한다.
func RequireMigrated(ctx context.Context, pool *pgxpool.Pool) error {
	pending, err := Pending(ctx, pool)
	if err != nil {
		return err
	}
	if len(pending) > 0 {
		return fmt.Errorf("%w: %s", ErrPendingMigrations, strings.Join(pending, ", "))
	}
	return nil
}

func apply(ctx context.Context, pool *pgxpool.Pool, name string) error {
	version := path.Base(name)

	return pgx.BeginFunc(ctx, pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock($1)", migrationLockID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, createMigrationsTable); err != nil {
			return err
		}

		var applied bool
		err := tx.QueryRow(ctx, "SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = $1)", version).Scan(&applied)
		if err != nil || applied {
			return err
		}

		sql, err := migrations.ReadFile(name)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, string(sql)); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, "INSERT INTO schema_migrations (version) VALUES ($1)", version)
		return err
	})
}
