package evaluation

import (
	"bytes"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"math"
	"slices"
)

// 예시는 많아야 이만큼이다. 지시가 예시로 가득 차지 않게 한다.
const maxExamples = 5

// 사진을 줄여 비교하는 격자 한 변의 칸 수.
const featureGrid = 16

// 비슷한 사례 하나. Answer는 그 사례의 정답이고, 질문 case의 정답은 어디에도 없다.
type Example struct {
	CaseID     string
	Similarity float64
	Answer     ClassificationPrediction
}

// case 하나에 붙인 예시의 기록. 산출물의 cases.jsonl에 남고 요약이 여기서 검색 품질을 다시 잰다.
type RetrievalTrace struct {
	Examples []RetrievedExample `json:"examples"`
}

type RetrievedExample struct {
	CaseID string `json:"caseId"`
	// 예시 사례의 정답 category. 질문 case의 정답과 같으면 맞는 예시로 센다.
	Category   string  `json:"category"`
	Similarity float64 `json:"similarity"`
}

// 예시를 찾는 곳. dataset의 dev split에서 채점 자격이 있는 사진 분류 case만 담는다.
type exampleBank struct {
	entries []bankEntry
}

type bankEntry struct {
	c      Case
	vector []float64
}

func newExampleBank(cases []LoadedCase) (*exampleBank, error) {
	bank := &exampleBank{}
	for _, c := range cases {
		if c.Split != Dev || !c.Eligible || c.Task != ImageClassification {
			continue
		}
		vector, err := imageVector(c.Image)
		if err != nil {
			return nil, fmt.Errorf("evaluation: example %s: %w", c.ID, err)
		}
		bank.entries = append(bank.entries, bankEntry{c: c.Case, vector: vector})
	}
	if len(bank.entries) == 0 {
		return nil, errors.New("evaluation: retrieval needs eligible dev cases to draw examples from")
	}
	return bank, nil
}

// 질문 case와 가장 비슷한 k개. 자신과 같은 원본 묶음은 빼서 답이 새지 않게 한다. 같은 점수는 id 순이다.
func (b *exampleBank) nearest(query LoadedCase, k int) ([]Example, error) {
	vector, err := imageVector(query.Image)
	if err != nil {
		return nil, err
	}
	var found []Example
	for _, e := range b.entries {
		if e.c.ID == query.ID || e.c.Provenance.SourceGroupID == query.Provenance.SourceGroupID {
			continue
		}
		found = append(found, Example{CaseID: e.c.ID, Similarity: cosine(vector, e.vector), Answer: answerOf(e.c)})
	}
	slices.SortStableFunc(found, func(x, y Example) int {
		if x.Similarity != y.Similarity {
			if x.Similarity > y.Similarity {
				return -1
			}
			return 1
		}
		return compareIDs(x.CaseID, y.CaseID)
	})
	return found[:min(k, len(found))], nil
}

// 예시 사례의 정답을 예측 모양으로. 행동은 canonical, unresolved면 none이고 facts는 첫 허용 값이다.
func answerOf(c Case) ClassificationPrediction {
	e := c.Expected.Classification
	answer := ClassificationPrediction{Category: e.Category, SuggestedAction: "none", Confidence: "high", Facts: []ClassificationFact{}}
	if len(e.AcceptableActions) > 0 {
		answer.SuggestedAction = e.AcceptableActions[0]
	}
	for _, f := range e.Facts {
		answer.Facts = append(answer.Facts, ClassificationFact{Label: f.Label, Value: f.AcceptedValues[0]})
	}
	return answer
}

func traceOf(examples []Example) *RetrievalTrace {
	t := &RetrievalTrace{Examples: []RetrievedExample{}}
	for _, e := range examples {
		t.Examples = append(t.Examples, RetrievedExample{CaseID: e.CaseID, Category: e.Answer.Category, Similarity: math.Round(e.Similarity*1e4) / 1e4})
	}
	return t
}

// 사진을 featureGrid² 칸의 밝기 평균으로 줄이고, 평균을 빼 길이 1로 맞춘다. 배치가 닮은 사진이 가깝다.
func imageVector(data []byte) ([]float64, error) {
	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("evaluation: image cannot be decoded for retrieval: %w", err)
	}
	bounds := img.Bounds()
	sums := make([]float64, featureGrid*featureGrid)
	for gy := range featureGrid {
		for gx := range featureGrid {
			x0, x1 := span(bounds.Min.X, bounds.Dx(), gx)
			y0, y1 := span(bounds.Min.Y, bounds.Dy(), gy)
			total := 0.0
			for y := y0; y < y1; y++ {
				for x := x0; x < x1; x++ {
					r, g, b, _ := img.At(x, y).RGBA()
					total += 0.299*float64(r) + 0.587*float64(g) + 0.114*float64(b)
				}
			}
			sums[gy*featureGrid+gx] = total / float64((x1-x0)*(y1-y0))
		}
	}
	mean := 0.0
	for i := range sums {
		mean += sums[i]
	}
	mean /= float64(len(sums))
	norm := 0.0
	for i := range sums {
		sums[i] -= mean
		norm += sums[i] * sums[i]
	}
	if norm == 0 {
		return sums, nil
	}
	for i := range sums {
		sums[i] /= math.Sqrt(norm)
	}
	return sums, nil
}

// 격자 칸 하나가 덮는 픽셀 범위. 사진이 격자보다 작아도 칸마다 픽셀이 하나 이상 있다.
func span(start, length, cell int) (int, int) {
	from := start + cell*length/featureGrid
	to := start + (cell+1)*length/featureGrid
	return from, max(to, from+1)
}

// 길이 1인 두 vector의 cosine. 한쪽이 0 vector면 0이다.
func cosine(a, b []float64) float64 {
	dot := 0.0
	for i := range a {
		dot += a[i] * b[i]
	}
	return dot
}

// 예시가 맞는 category를 얼마나 가져왔는지. 맞는 예시 = 정답 category가 질문 case와 같은 예시.
type RetrievalMetrics struct {
	// 예시를 붙인 case 수.
	Queries int `json:"queries"`
	// 첫 예시가 맞은 case.
	Top1Correct int     `json:"top1Correct"`
	Top1Rate    Measure `json:"top1Rate"`
	// 예시 중 하나라도 맞은 case.
	AnyCorrect int     `json:"anyCorrect"`
	HitRate    Measure `json:"hitRate"`
	// 첫 맞는 예시 순위의 역수 평균. 맞는 예시가 없으면 0으로 더한다.
	MeanReciprocalRank Measure `json:"meanReciprocalRank"`
}

type retrievalTally struct {
	m      RetrievalMetrics
	rrSum  float64
	active bool
}

func (t *retrievalTally) add(gold string, trace *RetrievalTrace) {
	if trace == nil {
		return
	}
	t.active = true
	t.m.Queries++
	for rank, e := range trace.Examples {
		if e.Category != gold {
			continue
		}
		if rank == 0 {
			t.m.Top1Correct++
		}
		t.m.AnyCorrect++
		t.rrSum += 1 / float64(rank+1)
		break
	}
}

// 예시를 붙인 case가 없으면 nil이다(검색을 쓰지 않은 variant).
func (t *retrievalTally) finish() *RetrievalMetrics {
	if !t.active {
		return nil
	}
	m := t.m
	m.Top1Rate = rate(m.Top1Correct, m.Queries, "")
	m.HitRate = rate(m.AnyCorrect, m.Queries, "")
	m.MeanReciprocalRank = MeasuredValue(t.rrSum / float64(m.Queries))
	return &m
}

// 모델 없이 검색만 잰다. split의 채점 가능한 case마다 dev에서 k개를 찾는다. 네트워크를 쓰지 않는다.
func ProbeRetrieval(ds Dataset, split Split, k int) (RetrievalMetrics, map[string]*RetrievalTrace, error) {
	if k < 1 || k > maxExamples {
		return RetrievalMetrics{}, nil, fmt.Errorf("evaluation: k must be 1 to %d", maxExamples)
	}
	if ds.Manifest.Task != ImageClassification {
		return RetrievalMetrics{}, nil, errors.New("evaluation: retrieval is only for image-classification")
	}
	bank, err := newExampleBank(ds.Cases)
	if err != nil {
		return RetrievalMetrics{}, nil, err
	}
	traces := map[string]*RetrievalTrace{}
	tally := retrievalTally{}
	for _, c := range ds.Cases {
		if c.Split != split || !c.Eligible {
			continue
		}
		examples, err := bank.nearest(c, k)
		if err != nil {
			return RetrievalMetrics{}, nil, err
		}
		traces[c.ID] = traceOf(examples)
		tally.add(c.Expected.Classification.Category, traces[c.ID])
	}
	metrics := tally.finish()
	if metrics == nil {
		return RetrievalMetrics{}, nil, fmt.Errorf("evaluation: split %s has no eligible case", split)
	}
	return *metrics, traces, nil
}
