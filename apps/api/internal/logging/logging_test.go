package logging

import (
	"bytes"
	"encoding/json"
	"testing"
)

func decode(t *testing.T, buf *bytes.Buffer) map[string]any {
	t.Helper()
	var line map[string]any
	if err := json.Unmarshal(buf.Bytes(), &line); err != nil {
		t.Fatalf("log line is not JSON: %v", err)
	}
	return line
}

func TestNewWritesCloudLoggingKeys(t *testing.T) {
	cases := []struct {
		name     string
		log      func(*bytes.Buffer)
		severity string
	}{
		{"info", func(b *bytes.Buffer) { New(b, "").Info("started") }, "INFO"},
		{"warn", func(b *bytes.Buffer) { New(b, "").Warn("started") }, "WARNING"},
		{"error", func(b *bytes.Buffer) { New(b, "").Error("started") }, "ERROR"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var buf bytes.Buffer
			tc.log(&buf)
			line := decode(t, &buf)
			if line["severity"] != tc.severity || line["message"] != "started" {
				t.Fatalf("got severity=%v message=%v", line["severity"], line["message"])
			}
			if _, ok := line["level"]; ok {
				t.Fatal("slog level key must be renamed")
			}
		})
	}
}

func TestNewAddsReleaseOnlyWhenSet(t *testing.T) {
	var buf bytes.Buffer
	New(&buf, "20261009-120000-abc1234").Info("started")
	if got := decode(t, &buf)["release"]; got != "20261009-120000-abc1234" {
		t.Fatalf("release = %v", got)
	}

	buf.Reset()
	New(&buf, "").Info("started")
	if _, ok := decode(t, &buf)["release"]; ok {
		t.Fatal("release must be absent when empty")
	}
}
