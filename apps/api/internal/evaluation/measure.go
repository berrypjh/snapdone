package evaluation

import (
	"bytes"
	"errors"
	"fmt"
)

// 값이 있는지, 없다면 왜 없는지. 없는 값을 0으로 읽는 실수를 타입으로 막는다.
type Availability string

const (
	// 실제로 쟀다. 0도 값이다.
	Measured Availability = "measured"
	// 일부만 쟀다. 값과 이유가 같이 있다.
	Partial Availability = "partial"
	// 잴 수 있어야 하는데 이번에는 얻지 못했다(오류 · 응답 누락).
	Unavailable Availability = "unavailable"
	// 이 공급자 · seam이 주지 않는다.
	Unsupported Availability = "unsupported"
	// 재지 않기로 했다(설정으로 끔).
	NotMeasured Availability = "not-measured"
	// 이 task · case에는 뜻이 없다.
	NotApplicable Availability = "not-applicable"
)

var availabilities = []Availability{Measured, Partial, Unavailable, Unsupported, NotMeasured, NotApplicable}

// 측정값 하나. Value는 measured · partial일 때만 있고, 나머지는 Reason이 말한다.
type Measure struct {
	Availability Availability `json:"availability"`
	Value        *float64     `json:"value"`
	Reason       string       `json:"reason,omitempty"`
}

// 잰 값. 0도 그대로 값이다.
func MeasuredValue(value float64) Measure { return Measure{Availability: Measured, Value: &value} }

// 값이 없는 측정과 그 이유.
func Missing(availability Availability, reason string) Measure {
	return Measure{Availability: availability, Reason: reason}
}

func (m Measure) Validate() error {
	if err := oneOf("availability", m.Availability, availabilities); err != nil {
		return err
	}
	hasValue := m.Value != nil
	switch m.Availability {
	case Measured:
		if !hasValue || m.Reason != "" {
			return errors.New("evaluation: a measured value has a value and no reason")
		}
	case Partial:
		if !hasValue || m.Reason == "" {
			return errors.New("evaluation: a partial value has a value and a reason")
		}
	case NotApplicable:
		if hasValue {
			return errors.New("evaluation: a not-applicable measure has no value")
		}
	default:
		if hasValue || m.Reason == "" {
			return fmt.Errorf("evaluation: a %s measure has a reason and no value", m.Availability)
		}
	}
	return nil
}

// JSON에서 읽을 때 availability와 value의 짝을 바로 검사한다.
func (m *Measure) UnmarshalJSON(data []byte) error {
	type plain Measure
	var decoded plain
	if err := decodeStrict(bytes.NewReader(data), &decoded); err != nil {
		return err
	}
	if err := Measure(decoded).Validate(); err != nil {
		return err
	}
	*m = Measure(decoded)
	return nil
}
