package evaluation

import (
	"encoding/json"
	"strings"
	"testing"
)

// 0은 잰 값이다. 저장했다 읽어도 0이 남고 사라지지 않는다.
func TestMeasureZeroRoundTrip(t *testing.T) {
	encoded, err := json.Marshal(MeasuredValue(0))
	if err != nil {
		t.Fatal(err)
	}
	if string(encoded) != `{"availability":"measured","value":0}` {
		t.Fatalf("encoded = %s", encoded)
	}
	var m Measure
	if err := json.Unmarshal(encoded, &m); err != nil {
		t.Fatal(err)
	}
	if m.Availability != Measured || m.Value == nil || *m.Value != 0 {
		t.Fatalf("decoded = %+v", m)
	}
}

func TestMeasureUnavailableRoundTrip(t *testing.T) {
	encoded, err := json.Marshal(Missing(Unsupported, "Classify does not return usage"))
	if err != nil {
		t.Fatal(err)
	}
	if string(encoded) != `{"availability":"unsupported","value":null,"reason":"Classify does not return usage"}` {
		t.Fatalf("encoded = %s", encoded)
	}
	var m Measure
	if err := json.Unmarshal(encoded, &m); err != nil {
		t.Fatal(err)
	}
	if m.Availability != Unsupported || m.Value != nil {
		t.Fatalf("decoded = %+v", m)
	}
}

// availability와 value의 짝이 틀리면 읽는 단계에서 거절한다. 없는 값이 0으로 읽히는 길이 없다.
func TestMeasureRejects(t *testing.T) {
	for name, text := range map[string]string{
		"measured without value":  `{"availability":"measured","value":null}`,
		"measured with reason":    `{"availability":"measured","value":1,"reason":"x"}`,
		"unavailable with value":  `{"availability":"unavailable","value":0,"reason":"x"}`,
		"unavailable no reason":   `{"availability":"unavailable","value":null}`,
		"partial without reason":  `{"availability":"partial","value":3}`,
		"unknown availability":    `{"availability":"maybe","value":null,"reason":"x"}`,
		"missing availability":    `{"value":1}`,
		"unknown field":           `{"availability":"measured","value":1,"unit":"ms"}`,
		"not-applicable w/ value": `{"availability":"not-applicable","value":1}`,
	} {
		t.Run(name, func(t *testing.T) {
			var m Measure
			if err := json.Unmarshal([]byte(text), &m); err == nil {
				t.Fatalf("decoded %+v, want an error", m)
			}
		})
	}
}

func TestDecodeStrictRejectsTrailingValue(t *testing.T) {
	var m Measure
	err := decodeStrict(strings.NewReader(`{"availability":"measured","value":1} {"availability":"measured","value":2}`), &m)
	if err != errTrailingJSON {
		t.Fatalf("err = %v, want errTrailingJSON", err)
	}
	if err := decodeStrict(strings.NewReader(`{"availability":"measured","value":1}`+"\n"), &m); err != nil {
		t.Fatalf("trailing newline: %v", err)
	}
}
