// Package logging은 Cloud Logging이 읽는 형식의 JSON 로그 생성.
package logging

import (
	"io"
	"log/slog"
	"regexp"
	"strings"
)

// Cloud Logging은 `severity` · `message` 키를 읽음. slog 기본 키(`level` · `msg`)로는 심각도 인식 불가.
const (
	severityKey = "severity"
	messageKey  = "message"
)

// New는 Cloud Logging 형식의 JSON logger 생성. release(배포 이미지 태그)가 있으면 모든 줄에 기록.
func New(w io.Writer, release string) *slog.Logger {
	logger := slog.New(slog.NewJSONHandler(w, &slog.HandlerOptions{ReplaceAttr: cloudKeys}))
	if release != "" {
		logger = logger.With("release", release)
	}
	return logger
}

// 최상위 level · msg 키를 Cloud Logging 이름으로 변경. slog의 WARN은 Cloud Logging의 WARNING.
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

// TraceKey는 Cloud Logging이 같은 요청의 로그를 묶는 필드.
const TraceKey = "logging.googleapis.com/trace"

// TraceName은 W3C traceparent(`00-<trace>-<span>-<flags>`)에서 Cloud Logging trace 이름 생성.
// project가 비었거나 헤더 모양이 틀리면 빈 문자열. 로그를 묶는 데만 써서 클라이언트 값이어도 무방.
func TraceName(project, traceparent string) string {
	parts := strings.Split(traceparent, "-")
	if project == "" || len(parts) != 4 || !traceID.MatchString(parts[1]) {
		return ""
	}
	return "projects/" + project + "/traces/" + parts[1]
}

var traceID = regexp.MustCompile(`^[0-9a-f]{32}$`)
