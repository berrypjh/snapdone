// Package logging은 Cloud Logging이 읽는 형식의 JSON 로그를 만든다.
package logging

import (
	"io"
	"log/slog"
	"regexp"
	"strings"
)

// Cloud Logging은 `severity` · `message` 키를 읽는다. slog 기본 키(`level` · `msg`)로는 심각도를 알지 못한다.
const (
	severityKey = "severity"
	messageKey  = "message"
)

// New는 Cloud Logging 형식의 JSON logger를 만든다. release(배포 이미지 태그)가 있으면 모든 줄에 남긴다.
func New(w io.Writer, release string) *slog.Logger {
	logger := slog.New(slog.NewJSONHandler(w, &slog.HandlerOptions{ReplaceAttr: cloudKeys}))
	if release != "" {
		logger = logger.With("release", release)
	}
	return logger
}

// 최상위 level · msg 키를 Cloud Logging 이름으로 바꾼다. slog의 WARN은 Cloud Logging에서 WARNING이다.
func cloudKeys(groups []string, attr slog.Attr) slog.Attr {
	if len(groups) > 0 {
		return attr
	}
	switch attr.Key {
	case slog.LevelKey:
		attr.Key = severityKey
		if level, ok := attr.Value.Any().(slog.Level); ok && level == slog.LevelWarn {
			attr.Value = slog.StringValue("WARNING")
		}
	case slog.MessageKey:
		attr.Key = messageKey
	}
	return attr
}

// TraceKey는 Cloud Logging이 같은 요청의 로그를 묶는 필드다.
const TraceKey = "logging.googleapis.com/trace"

// TraceName은 W3C traceparent(`00-<trace>-<span>-<flags>`)에서 Cloud Logging trace 이름을 만든다.
// project가 비었거나 헤더 모양이 틀리면 빈 문자열이다. 로그를 묶는 데만 쓰므로 클라이언트 값이어도 된다.
func TraceName(project, traceparent string) string {
	parts := strings.Split(traceparent, "-")
	if project == "" || len(parts) != 4 || !traceID.MatchString(parts[1]) {
		return ""
	}
	return "projects/" + project + "/traces/" + parts[1]
}

var traceID = regexp.MustCompile(`^[0-9a-f]{32}$`)
