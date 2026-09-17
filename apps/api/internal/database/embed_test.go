package database

import (
	"io/fs"
	"testing"
)

// 마이그레이션 SQL이 바이너리에 들어가는지 DB 없이 확인한다.
func TestMigrationsAreEmbedded(t *testing.T) {
	names, err := fs.Glob(migrations, "migrations/*.sql")
	if err != nil {
		t.Fatal(err)
	}
	if len(names) == 0 {
		t.Fatal("no migrations embedded; check the go:embed directive")
	}
}
