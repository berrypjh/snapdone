package evaluation

import (
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"slices"
)

// JSON 값 뒤에 무언가 더 있다.
var errTrailingJSON = errors.New("evaluation: trailing data after the JSON value")

// 모르는 필드 · 뒤따르는 값을 거절하며 하나의 JSON 값을 읽는다. 값의 검증은 부르는 쪽이 한다.
func decodeStrict(r io.Reader, v any) error {
	dec := json.NewDecoder(r)
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		return err
	}
	if _, err := dec.Token(); !errors.Is(err, io.EOF) {
		return errTrailingJSON
	}
	return nil
}

func oneOf[T ~string](field string, value T, allowed []T) error {
	if !slices.Contains(allowed, value) {
		return fmt.Errorf("evaluation: %s %q is not one of %v", field, value, allowed)
	}
	return nil
}

func nonEmpty(field, value string) error {
	if value == "" {
		return fmt.Errorf("evaluation: %s is required", field)
	}
	return nil
}

// bytes byte짜리 해시의 소문자 hex인지.
func hexOf(field, value string, bytes int) error {
	decoded, err := hex.DecodeString(value)
	if err != nil || len(decoded) != bytes || value != hex.EncodeToString(decoded) {
		return fmt.Errorf("evaluation: %s must be %d lowercase hex characters", field, bytes*2)
	}
	return nil
}

func schemaVersion(kind string, got, want int) error {
	if got != want {
		return fmt.Errorf("evaluation: %s schemaVersion %d is not supported (want %d)", kind, got, want)
	}
	return nil
}
