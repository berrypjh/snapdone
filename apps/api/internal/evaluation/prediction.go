package evaluation

// 분류기의 예측. production 결과(processing.Result)를 평가 쪽에서 옮겨 담은 것이고, JSON 이름은 앱과의 계약과 같다.
// 산출물(cases.jsonl의 prediction.classification)은 이 모양으로 쓴다.
type ClassificationPrediction struct {
	Category        string               `json:"category"`
	Facts           []ClassificationFact `json:"facts"`
	SuggestedAction string               `json:"suggestedAction"`
	Confidence      string               `json:"confidence"`
}

// 사진에서 읽은 사실 하나. 채점하지 않고 기록만 한다.
type ClassificationFact struct {
	Label string `json:"label"`
	Value string `json:"value"`
}

// 채점 · 검증에 필요한 만큼만 본 production 분류 계약. 값은 production(processingadapter.Contract)이 채우고
// 평가는 목록을 베껴 적지 않는다.
type ClassificationContract struct {
	// production 지시 · 요청 · 결과 schema의 hash. variant manifest가 기대한 값과 다르면 prompt가 바뀐 것이다.
	Hash       string
	Categories []string
	Actions    []string
	Confidence []string
}
