package database

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"path"

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
