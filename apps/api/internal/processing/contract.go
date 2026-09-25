package processing

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"slices"
)

// 분류기가 모델에 강제하는 계약의 읽기 전용 묘사. 평가가 enum · 지시 · schema를 베끼지 않고 여기서 읽는다.
type Contract struct {
	Instructions string
	Request      string
	Schema       map[string]any
	Categories   []string
	Actions      []string
	Confidence   []string
	// Instructions · Request · Schema JSON의 sha256 hex. 지시나 schema가 바뀌면 달라진다.
	Hash string
}

// 계약의 복사본. 돌려준 값을 바꿔도 분류기가 쓰는 원본에는 영향이 없다.
func DescribeContract() Contract {
	schema := resultSchema()
	encoded, err := json.Marshal(schema)
	if err != nil {
		panic("processing: result schema is not JSON: " + err.Error())
	}
	sum := sha256.Sum256([]byte(instructions + "\x00" + request + "\x00" + string(encoded)))
	return Contract{
		Instructions: instructions,
		Request:      request,
		Schema:       schema,
		Categories:   slices.Clone(categories),
		Actions:      slices.Clone(actions),
		Confidence:   slices.Clone(confidence),
		Hash:         hex.EncodeToString(sum[:]),
	}
}
