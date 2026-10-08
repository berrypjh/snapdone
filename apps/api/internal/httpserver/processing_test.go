package httpserver

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"
	"time"

	"snapdone/api/internal/processing"
)

// PNG 파일 서명. http.DetectContentType이 image/png로 본다.
var pngImage = append([]byte("\x89PNG\r\n\x1a\n"), make([]byte, 64)...)

// fakeProcessing은 user-1의 job-1과 최근 작업 recent만 알고, 시작 요청과 목록을 물은 사용자를 기록한다.
type fakeProcessing struct {
	job        processing.Job
	recent     []processing.Job
	err        error
	startErr   error
	reprocess  *processing.Reprocess
	resolved   []string
	userID     string
	origin     processing.Origin
	listed     []processing.Origin
	deleted    string
	deletedAll []string
	mediaType  string
	image      []byte
}

func (f *fakeProcessing) Start(_ context.Context, userID string, origin processing.Origin, image []byte, mediaType string) (processing.Job, error) {
	f.userID, f.origin, f.image, f.mediaType = userID, origin, image, mediaType
	if f.startErr != nil {
		return processing.Job{}, f.startErr
	}
	return processing.Job{ID: "job-1", Status: processing.StatusRunning}, nil
}

func (f *fakeProcessing) Reprocess(_ context.Context, userID string, origin processing.Origin, image []byte, mediaType string, r processing.Reprocess) (processing.Job, error) {
	f.userID, f.origin, f.image, f.mediaType, f.reprocess = userID, origin, image, mediaType, &r
	if f.startErr != nil {
		return processing.Job{}, f.startErr
	}
	return processing.Job{ID: "job-2", Status: processing.StatusRunning, SourceJobID: &r.SourceJobID}, nil
}

func (f *fakeProcessing) ResolveReceiptField(_ context.Context, userID, id, field, value string) (processing.Job, error) {
	f.userID, f.resolved = userID, []string{id, field, value}
	if f.err != nil {
		return processing.Job{}, f.err
	}
	return f.job, nil
}

func (f *fakeProcessing) Recent(_ context.Context, userID string, origins []processing.Origin) ([]processing.Job, error) {
	f.userID, f.listed = userID, origins
	if userID != "user-1" {
		return []processing.Job{}, f.err
	}
	return f.recent, f.err
}

func (f *fakeProcessing) Delete(_ context.Context, userID, id string) error {
	if f.err != nil {
		return f.err
	}
	if userID != "user-1" || id != "job-1" {
		return processing.ErrNotFound
	}
	f.deleted = id
	return nil
}

// user-1의 job-1 · job-2만 지운다. 나머지는 실제 Store처럼 건너뛴다.
func (f *fakeProcessing) DeleteMany(_ context.Context, userID string, ids []string) (int, error) {
	if f.err != nil {
		return 0, f.err
	}
	f.deletedAll = ids
	deleted := 0
	for _, id := range ids {
		if userID == "user-1" && (id == "job-1" || id == "job-2") {
			deleted++
		}
	}
	return deleted, nil
}

func (f *fakeProcessing) Find(_ context.Context, userID, id string) (processing.Job, error) {
	if userID != "user-1" || id != "job-1" {
		return processing.Job{}, processing.ErrNotFound
	}
	return f.job, nil
}

func processingRouter(service ProcessingService) http.Handler {
	return NewRouter(Deps{Sessions: &fakeSessions{}, Processing: service})
}

// upload는 image 필드에 data를 담은 multipart 요청을 보낸다.
func upload(handler http.Handler, field string, data []byte, headers ...string) *httptest.ResponseRecorder {
	var body bytes.Buffer
	form := multipart.NewWriter(&body)
	part, _ := form.CreateFormFile(field, "photo")
	_, _ = part.Write(data)
	_ = form.Close()
	return send(handler, http.MethodPost, "/v1/processing-jobs", body.String(),
		append([]string{"Content-Type", form.FormDataContentType()}, headers...)...)
}

// uploadWith는 image와 함께 재처리 필드를 담은 multipart 요청을 보낸다.
func uploadWith(handler http.Handler, fields map[string]string, headers ...string) *httptest.ResponseRecorder {
	var body bytes.Buffer
	form := multipart.NewWriter(&body)
	part, _ := form.CreateFormFile("image", "photo")
	_, _ = part.Write(pngImage)
	for name, value := range fields {
		_ = form.WriteField(name, value)
	}
	_ = form.Close()
	return send(handler, http.MethodPost, "/v1/processing-jobs", body.String(),
		append([]string{"Content-Type", form.FormDataContentType()}, headers...)...)
}

func TestCreateProcessingJob(t *testing.T) {
	service := &fakeProcessing{}
	r := upload(processingRouter(service), "image", pngImage, bearer...)

	if r.Code != http.StatusAccepted {
		t.Fatalf("status = %d, body %s", r.Code, r.Body)
	}
	var body map[string]any
	_ = json.NewDecoder(r.Body).Decode(&body)
	if body["jobId"] != "job-1" || body["status"] != "running" || body["result"] != nil {
		t.Errorf("body = %v", body)
	}
	if service.userID != "user-1" || service.mediaType != "image/png" || !bytes.Equal(service.image, pngImage) {
		t.Errorf("started with user %q, type %q", service.userID, service.mediaType)
	}
	assertNoStore(t, r)
}

func TestCreateProcessingJobRejects(t *testing.T) {
	handler := processingRouter(&fakeProcessing{})
	tooLarge := append(append([]byte{}, pngImage...), make([]byte, maxImageBytes)...)
	wayTooLarge := append(append([]byte{}, pngImage...), make([]byte, maxUploadBody)...)

	cases := []struct {
		name   string
		r      *httptest.ResponseRecorder
		status int
		code   string
	}{
		{"no credential", upload(handler, "image", pngImage), http.StatusUnauthorized, "session_expired"},
		{"unknown credential", upload(handler, "image", pngImage, "Authorization", "Bearer other"), http.StatusUnauthorized, "session_expired"},
		{"not multipart", send(handler, http.MethodPost, "/v1/processing-jobs", "raw", bearer...), http.StatusBadRequest, "invalid_image"},
		{"other field", upload(handler, "file", pngImage, bearer...), http.StatusBadRequest, "invalid_image"},
		{"not an image", upload(handler, "image", []byte("hello, this is text"), bearer...), http.StatusUnsupportedMediaType, "unsupported_image"},
		{"over the image limit", upload(handler, "image", tooLarge, bearer...), http.StatusRequestEntityTooLarge, "image_too_large"},
		{"over the body limit", upload(handler, "image", wayTooLarge, bearer...), http.StatusRequestEntityTooLarge, "image_too_large"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if tc.r.Code != tc.status || errorCode(t, tc.r) != tc.code {
				t.Errorf("status = %d, want %d %s", tc.r.Code, tc.status, tc.code)
			}
		})
	}
}

func TestProcessingJob(t *testing.T) {
	service := &fakeProcessing{job: processing.Job{
		ID:     "job-1",
		Status: processing.StatusCompleted,
		Result: &processing.Result{
			Category:        "receipt",
			Facts:           []processing.Fact{{Label: "금액", Value: "12,000원"}},
			SuggestedAction: "record_expense",
			Confidence:      "medium",
		},
	}}
	handler := processingRouter(service)

	r := send(handler, http.MethodGet, "/v1/processing-jobs/job-1", "", bearer...)
	if r.Code != http.StatusOK {
		t.Fatalf("status = %d", r.Code)
	}
	var body ProcessingJobResponse
	_ = json.NewDecoder(r.Body).Decode(&body)
	if body.Status != "completed" || body.Result == nil || body.Result.Facts[0].Value != "12,000원" ||
		body.Result.Confidence != "medium" {
		t.Errorf("body = %+v", body)
	}
	assertNoStore(t, r)

	missing := send(handler, http.MethodGet, "/v1/processing-jobs/other-job", "", bearer...)
	if missing.Code != http.StatusNotFound || errorCode(t, missing) != "job_not_found" {
		t.Errorf("unknown job status = %d", missing.Code)
	}
	anonymous := send(handler, http.MethodGet, "/v1/processing-jobs/job-1", "")
	if anonymous.Code != http.StatusUnauthorized {
		t.Errorf("no credential status = %d", anonymous.Code)
	}
}

// 처리 · 인증 설정이 없으면 route는 남기고 503이다.
func TestProcessingDisabled(t *testing.T) {
	for name, deps := range map[string]Deps{
		"processing missing": {Sessions: &fakeSessions{}},
		"auth missing":       {Processing: &fakeProcessing{}},
	} {
		handler := NewRouter(deps)
		for _, r := range []*httptest.ResponseRecorder{
			upload(handler, "image", pngImage, bearer...),
			send(handler, http.MethodGet, "/v1/processing-jobs/job-1", "", bearer...),
			send(handler, http.MethodGet, "/v1/processing-jobs", "", bearer...),
		} {
			if r.Code != http.StatusServiceUnavailable || errorCode(t, r) != "provider_unavailable" {
				t.Errorf("%s: status %d", name, r.Code)
			}
		}
	}
}

// running 작업은 result 필드 없이 나간다.
func TestRunningJobHasNoResult(t *testing.T) {
	handler := processingRouter(&fakeProcessing{job: processing.Job{ID: "job-1", Status: processing.StatusRunning}})
	r := send(handler, http.MethodGet, "/v1/processing-jobs/job-1", "", bearer...)
	if strings.Contains(r.Body.String(), "result") {
		t.Errorf("body = %s", r.Body)
	}
}

// 출처는 요청 세션의 온보딩 단계로 정한다. 온보딩을 마친 뒤에만 general이다.
func TestCreateProcessingJobOrigin(t *testing.T) {
	for step, want := range map[string]processing.Origin{
		"intro":       processing.OriginOnboarding,
		"first-image": processing.OriginOnboarding,
		"complete":    processing.OriginGeneral,
	} {
		service := &fakeProcessing{}
		handler := NewRouter(Deps{Sessions: &fakeSessions{step: step}, Processing: service})
		if r := upload(handler, "image", pngImage, bearer...); r.Code != http.StatusAccepted {
			t.Fatalf("%s: status %d", step, r.Code)
		}
		if service.origin != want {
			t.Errorf("%s: origin = %q, want %q", step, service.origin, want)
		}
	}
}

func TestProcessingJobs(t *testing.T) {
	created := time.Date(2026, 10, 6, 18, 0, 0, 0, time.FixedZone("KST", 9*3600))
	finished := created.Add(7 * time.Second)
	service := &fakeProcessing{recent: []processing.Job{
		{ID: "job-2", Status: processing.StatusRunning, CreatedAt: created.Add(time.Minute)},
		{ID: "job-1", Status: processing.StatusCompleted, CreatedAt: created, FinishedAt: &finished, Result: &processing.Result{
			Category: "receipt", Facts: []processing.Fact{{Label: "금액", Value: "12,000원"}},
			SuggestedAction: "record_expense", Confidence: "high",
		}},
	}}
	r := send(processingRouter(service), http.MethodGet, "/v1/processing-jobs", "", bearer...)

	want := `{"jobs":[` +
		`{"jobId":"job-2","status":"running","createdAt":"2026-10-06T09:01:00Z"},` +
		`{"jobId":"job-1","status":"completed","createdAt":"2026-10-06T09:00:00Z","finishedAt":"2026-10-06T09:00:07Z",` +
		`"result":{"category":"receipt","facts":[{"label":"금액","value":"12,000원"}],"suggestedAction":"record_expense","confidence":"high"}}]}`
	if r.Code != http.StatusOK || r.Body.String() != want {
		t.Fatalf("status %d, body %s", r.Code, r.Body)
	}
	if service.userID != "user-1" {
		t.Errorf("listed jobs of %q, want the session's user", service.userID)
	}
	assertNoStore(t, r)
}

// 온보딩 첫 사진은 온보딩을 마친 뒤에만 목록에 들어간다.
func TestProcessingJobsOrigins(t *testing.T) {
	both := []processing.Origin{processing.OriginOnboarding, processing.OriginGeneral}
	for step, want := range map[string][]processing.Origin{
		"intro":       {processing.OriginGeneral},
		"first-image": {processing.OriginGeneral},
		"complete":    both,
	} {
		service := &fakeProcessing{recent: []processing.Job{}}
		handler := NewRouter(Deps{Sessions: &fakeSessions{step: step}, Processing: service})
		if r := send(handler, http.MethodGet, "/v1/processing-jobs", "", bearer...); r.Code != http.StatusOK {
			t.Fatalf("%s: status %d", step, r.Code)
		}
		if !slices.Equal(service.listed, want) {
			t.Errorf("%s: origins = %v, want %v", step, service.listed, want)
		}
	}
}

// 제품 결과와 재처리 관계는 이 모양으로 나간다. libs/processing의 parser가 같은 본문을 읽는다.
// 확인하지 못한 영수증 필드는 value가 null이고, 이 migration 전의 작업에는 outcome이 없다.
func TestProcessingJobsOutcome(t *testing.T) {
	created := time.Date(2026, 10, 7, 9, 0, 0, 0, time.UTC)
	value := func(v string) *string { return &v }
	source := "job-1"
	service := &fakeProcessing{recent: []processing.Job{
		{ID: "job-3", Status: processing.StatusCompleted, CreatedAt: created, FinishedAt: &created, SourceJobID: &source,
			Selection: &processing.Selection{ImageType: processing.ImageText, Action: "extract_and_translate"},
			Result:    &processing.Result{Category: "foreign_text", Facts: []processing.Fact{}, SuggestedAction: "translate", Confidence: "high"},
			Outcome: &processing.Outcome{Kind: processing.OutcomeProcessed, ImageType: processing.ImageText, AppliedAction: "extract_and_translate",
				Output: &processing.Output{Original: value("Open daily"), Translation: &processing.Translation{Needed: true, Text: value("매일 영업")}}}},
		{ID: "job-2", Status: processing.StatusCompleted, CreatedAt: created, FinishedAt: &created,
			Result:  &processing.Result{Category: "other", Facts: []processing.Fact{}, SuggestedAction: "none", Confidence: "low"},
			Outcome: &processing.Outcome{Kind: processing.OutcomeAmbiguous, Candidates: []processing.ImageType{processing.ImageText, processing.ImageReceipt}}},
		{ID: "job-1", Status: processing.StatusCompleted, CreatedAt: created, FinishedAt: &created,
			Selection: &processing.Selection{ImageType: processing.ImageReceipt, Action: "record_expense"},
			Result:    &processing.Result{Category: "receipt", Facts: []processing.Fact{}, SuggestedAction: "record_expense", Confidence: "medium"},
			Outcome: &processing.Outcome{Kind: processing.OutcomeProcessed, ImageType: processing.ImageReceipt, AppliedAction: "record_expense",
				Output: &processing.Output{Expense: &processing.Expense{
					Merchant:      processing.ReceiptField{Value: value("카페 봄"), Candidates: []string{}, Resolved: true},
					Date:          processing.ReceiptField{Candidates: []string{}},
					Total:         processing.ReceiptField{Value: value("12000"), Candidates: []string{"12000", "13000"}},
					Currency:      processing.ReceiptField{Value: value("KRW"), Candidates: []string{}, Resolved: true},
					PaymentMethod: processing.ReceiptField{Candidates: []string{}},
				}}}},
	}}
	r := send(processingRouter(service), http.MethodGet, "/v1/processing-jobs", "", bearer...)

	const at = `"createdAt":"2026-10-07T09:00:00Z","finishedAt":"2026-10-07T09:00:00Z"`
	want := `{"jobs":[` +
		`{"jobId":"job-3","status":"completed",` + at + `,` +
		`"result":{"category":"foreign_text","facts":[],"suggestedAction":"translate","confidence":"high"},` +
		`"selection":{"imageType":"text","appliedAction":"extract_and_translate"},` +
		`"outcome":{"kind":"processed","imageType":"text","appliedAction":"extract_and_translate","output":{"original":"Open daily","translation":{"needed":true,"text":"매일 영업"}}},` +
		`"sourceJobId":"job-1"},` +
		`{"jobId":"job-2","status":"completed",` + at + `,` +
		`"result":{"category":"other","facts":[],"suggestedAction":"none","confidence":"low"},` +
		`"outcome":{"kind":"ambiguous","candidates":["text","receipt"]}},` +
		`{"jobId":"job-1","status":"completed",` + at + `,` +
		`"result":{"category":"receipt","facts":[],"suggestedAction":"record_expense","confidence":"medium"},` +
		`"selection":{"imageType":"receipt","appliedAction":"record_expense"},` +
		`"outcome":{"kind":"processed","imageType":"receipt","appliedAction":"record_expense","output":{"expense":{` +
		`"merchant":{"value":"카페 봄","candidates":[],"resolved":true},` +
		`"date":{"value":null,"candidates":[],"resolved":false},` +
		`"total":{"value":"12000","candidates":["12000","13000"],"resolved":false},` +
		`"currency":{"value":"KRW","candidates":[],"resolved":true},` +
		`"paymentMethod":{"value":null,"candidates":[],"resolved":false}}}}}]}`
	if r.Code != http.StatusOK || r.Body.String() != want {
		t.Fatalf("status %d, body %s", r.Code, r.Body)
	}

	service.job = service.recent[0]
	single := send(processingRouter(service), http.MethodGet, "/v1/processing-jobs/job-1", "", bearer...)
	if !strings.Contains(single.Body.String(), `"outcome":{"kind":"processed","imageType":"text"`) ||
		!strings.Contains(single.Body.String(), `"sourceJobId":"job-1"`) {
		t.Errorf("single job body %s, want the outcome and source", single.Body)
	}
}

// 처리 방식을 읽지 못하는 등 작업을 시작하지 못하면 원인을 숨긴 500이고, 작업은 돌려주지 않는다.
func TestCreateProcessingJobStartFailure(t *testing.T) {
	service := &fakeProcessing{startErr: errors.New("processing: preferences: db: connection reset")}
	r := upload(processingRouter(service), "image", pngImage, bearer...)
	if r.Code != http.StatusInternalServerError || errorCode(t, r) != "provider_unavailable" {
		t.Fatalf("status %d, body %s", r.Code, r.Body)
	}
	if strings.Contains(r.Body.String(), "jobId") || strings.Contains(r.Body.String(), "preferences") {
		t.Errorf("body %s, want only the error code", r.Body)
	}
}

// 처리 방식만 고르고 결과가 아직 없는 작업은 selection만 나간다.
func TestProcessingJobWithSelectionOnly(t *testing.T) {
	service := &fakeProcessing{job: processing.Job{
		ID: "job-1", Status: processing.StatusCompleted,
		Result:    &processing.Result{Category: "work", Facts: []processing.Fact{}, SuggestedAction: "none", Confidence: "high"},
		Selection: &processing.Selection{ImageType: processing.ImageText, Action: "summarize"},
	}}
	r := send(processingRouter(service), http.MethodGet, "/v1/processing-jobs/job-1", "", bearer...)
	want := `{"jobId":"job-1","status":"completed",` +
		`"result":{"category":"work","facts":[],"suggestedAction":"none","confidence":"high"},` +
		`"selection":{"imageType":"text","appliedAction":"summarize"}}`
	if r.Code != http.StatusOK || r.Body.String() != want {
		t.Fatalf("status %d, body %s", r.Code, r.Body)
	}
}

// 재처리는 같은 POST에 sourceJobId · imageType · action을 더해 보낸다. 응답에 원래 작업이 실린다.
func TestReprocessProcessingJob(t *testing.T) {
	service := &fakeProcessing{}
	r := uploadWith(processingRouter(service), map[string]string{"sourceJobId": "job-1", "imageType": "text", "action": "summarize"}, bearer...)
	if r.Code != http.StatusAccepted || r.Body.String() != `{"jobId":"job-2","status":"running","sourceJobId":"job-1"}` {
		t.Fatalf("status %d, body %s", r.Code, r.Body)
	}
	want := processing.Reprocess{SourceJobID: "job-1", ImageType: processing.ImageText, Action: "summarize"}
	if service.reprocess == nil || *service.reprocess != want || service.userID != "user-1" || !bytes.Equal(service.image, pngImage) {
		t.Errorf("reprocess %+v by %q, want %+v", service.reprocess, service.userID, want)
	}
}

// 재처리 오류는 코드로만 나간다. 원래 작업이 없는 것과 다른 사용자의 것은 같은 404다.
func TestReprocessProcessingJobErrors(t *testing.T) {
	for _, tc := range []struct {
		err    error
		status int
		code   string
	}{
		{processing.ErrInvalidReprocess, http.StatusBadRequest, "invalid_reprocess"},
		{processing.ErrSourceNotFound, http.StatusNotFound, "job_not_found"},
		{processing.ErrImageMismatch, http.StatusConflict, "image_mismatch"},
		{processing.ErrSourceRunning, http.StatusConflict, "source_running"},
		{processing.ErrNotReprocessable, http.StatusConflict, "source_not_reprocessable"},
		{errors.New("processing: preferences: db: connection reset"), http.StatusInternalServerError, "provider_unavailable"},
	} {
		service := &fakeProcessing{startErr: tc.err}
		r := uploadWith(processingRouter(service), map[string]string{"sourceJobId": "job-1", "action": "summarize"}, bearer...)
		if r.Code != tc.status || errorCode(t, r) != tc.code {
			t.Errorf("%v: status %d, body %s, want %d %s", tc.err, r.Code, r.Body, tc.status, tc.code)
		}
	}
}

// 원래 작업 없이 유형 · 처리 방식만 보내면 새 처리로 넘어가지 않고 거절한다.
func TestCreateProcessingJobRejectsChoiceWithoutSource(t *testing.T) {
	for _, fields := range []map[string]string{{"imageType": "text"}, {"action": "summarize"}} {
		service := &fakeProcessing{}
		r := uploadWith(processingRouter(service), fields, bearer...)
		if r.Code != http.StatusBadRequest || errorCode(t, r) != "invalid_reprocess" || service.userID != "" {
			t.Errorf("%v: status %d, body %s, want 400 without starting", fields, r.Code, r.Body)
		}
	}
}

func receiptPatch(handler http.Handler, path, body string, headers ...string) *httptest.ResponseRecorder {
	return send(handler, http.MethodPatch, path, body, append([]string{"Content-Type", "application/json"}, headers...)...)
}

// 영수증 필드 하나를 확정하고 바뀐 뒤의 작업을 돌려준다.
func TestResolveReceiptField(t *testing.T) {
	service := &fakeProcessing{job: processing.Job{ID: "job-1", Status: processing.StatusCompleted,
		Result: &processing.Result{Category: "receipt", Facts: []processing.Fact{}, SuggestedAction: "record_expense", Confidence: "medium"}}}
	r := receiptPatch(processingRouter(service), "/v1/processing-jobs/job-1/receipt-fields/total", `{"value":"13000"}`, bearer...)
	if r.Code != http.StatusOK || !strings.Contains(r.Body.String(), `"jobId":"job-1"`) {
		t.Fatalf("status %d, body %s", r.Code, r.Body)
	}
	if service.userID != "user-1" || strings.Join(service.resolved, " ") != "job-1 total 13000" {
		t.Errorf("resolved %v by %q", service.resolved, service.userID)
	}
	assertNoStore(t, r)
}

func TestResolveReceiptFieldErrors(t *testing.T) {
	for _, tc := range []struct {
		err    error
		status int
		code   string
	}{
		{processing.ErrInvalidReceiptField, http.StatusBadRequest, "invalid_receipt_field"},
		{processing.ErrNotFound, http.StatusNotFound, "job_not_found"},
		{processing.ErrNotResolvable, http.StatusConflict, "job_not_resolvable"},
		{processing.ErrFieldResolved, http.StatusConflict, "receipt_field_resolved"},
		{errors.New("db: connection reset"), http.StatusInternalServerError, "provider_unavailable"},
	} {
		r := receiptPatch(processingRouter(&fakeProcessing{err: tc.err}), "/v1/processing-jobs/job-1/receipt-fields/total", `{"value":"13000"}`, bearer...)
		if r.Code != tc.status || errorCode(t, r) != tc.code {
			t.Errorf("%v: status %d, body %s, want %d %s", tc.err, r.Code, r.Body, tc.status, tc.code)
		}
	}

	handler := processingRouter(&fakeProcessing{})
	for name, tc := range map[string]struct {
		body   string
		status int
		code   string
	}{
		"no value":  {`{}`, http.StatusBadRequest, "invalid_receipt_field"},
		"not json":  {`total=13000`, http.StatusBadRequest, "invalid_receipt_field"},
		"too large": {`{"value":"` + strings.Repeat("1", maxJSONBody) + `"}`, http.StatusBadRequest, "invalid_receipt_field"},
	} {
		r := receiptPatch(handler, "/v1/processing-jobs/job-1/receipt-fields/total", tc.body, bearer...)
		if r.Code != tc.status || errorCode(t, r) != tc.code {
			t.Errorf("%s: status %d, body %s", name, r.Code, r.Body)
		}
	}
	if r := receiptPatch(handler, "/v1/processing-jobs/job-1/receipt-fields/total", `{"value":"1"}`); r.Code != http.StatusUnauthorized {
		t.Errorf("no credential: status %d", r.Code)
	}
}

func TestProcessingJobsEmpty(t *testing.T) {
	r := send(processingRouter(&fakeProcessing{recent: []processing.Job{}}), http.MethodGet, "/v1/processing-jobs", "", bearer...)
	if r.Code != http.StatusOK || r.Body.String() != `{"jobs":[]}` {
		t.Fatalf("status %d, body %s", r.Code, r.Body)
	}
}

func TestProcessingJobsRejects(t *testing.T) {
	anonymous := send(processingRouter(&fakeProcessing{}), http.MethodGet, "/v1/processing-jobs", "")
	if anonymous.Code != http.StatusUnauthorized || errorCode(t, anonymous) != "session_expired" {
		t.Errorf("no credential: status %d", anonymous.Code)
	}
	failing := send(processingRouter(&fakeProcessing{err: errors.New("db: connection reset")}), http.MethodGet, "/v1/processing-jobs", "", bearer...)
	if failing.Code != http.StatusInternalServerError || errorCode(t, failing) != "provider_unavailable" {
		t.Errorf("store failure: status %d", failing.Code)
	}
}

// 지우면 본문 없이 204다. 남의 작업 · 없는 작업은 404, 로그인 없음은 401, 저장소 실패는 500이다.
func TestDeleteProcessingJob(t *testing.T) {
	service := &fakeProcessing{}
	r := send(processingRouter(service), http.MethodDelete, "/v1/processing-jobs/job-1", "", bearer...)
	if r.Code != http.StatusNoContent || r.Body.Len() != 0 || service.deleted != "job-1" {
		t.Fatalf("status %d, body %q, deleted %q", r.Code, r.Body, service.deleted)
	}
	assertNoStore(t, r)

	cases := []struct {
		name    string
		service *fakeProcessing
		path    string
		headers []string
		status  int
		code    string
	}{
		{"unknown job", &fakeProcessing{}, "/v1/processing-jobs/job-2", bearer, http.StatusNotFound, "job_not_found"},
		{"no credential", &fakeProcessing{}, "/v1/processing-jobs/job-1", nil, http.StatusUnauthorized, "session_expired"},
		{"store failure", &fakeProcessing{err: errors.New("db: connection reset")}, "/v1/processing-jobs/job-1", bearer, http.StatusInternalServerError, "provider_unavailable"},
	}
	for _, tc := range cases {
		r := send(processingRouter(tc.service), http.MethodDelete, tc.path, "", tc.headers...)
		if r.Code != tc.status || errorCode(t, r) != tc.code {
			t.Errorf("%s: status %d", tc.name, r.Code)
		}
	}
}

// 여러 개를 한 번에 지우고 실제로 지운 개수만 센다. 비었거나 20개를 넘으면 400이다.
func TestDeleteProcessingJobs(t *testing.T) {
	json := append([]string{"Content-Type", "application/json"}, bearer...)
	service := &fakeProcessing{}
	r := send(processingRouter(service), http.MethodPost, "/v1/processing-jobs/delete",
		`{"jobIds":["job-1","job-2","job-9"]}`, json...)
	if r.Code != http.StatusOK || r.Body.String() != `{"deleted":2}` || len(service.deletedAll) != 3 {
		t.Fatalf("status %d, body %s, ids %v", r.Code, r.Body, service.deletedAll)
	}
	assertNoStore(t, r)

	tooMany := `{"jobIds":["1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17","18","19","20","21"]}`
	cases := []struct {
		name    string
		service *fakeProcessing
		body    string
		headers []string
		status  int
		code    string
	}{
		{"no ids", &fakeProcessing{}, `{"jobIds":[]}`, json, http.StatusBadRequest, "invalid_job_ids"},
		{"empty id", &fakeProcessing{}, `{"jobIds":[""]}`, json, http.StatusBadRequest, "invalid_job_ids"},
		{"too many", &fakeProcessing{}, tooMany, json, http.StatusBadRequest, "invalid_job_ids"},
		{"no credential", &fakeProcessing{}, `{"jobIds":["job-1"]}`, []string{"Content-Type", "application/json"}, http.StatusUnauthorized, "session_expired"},
		{"store failure", &fakeProcessing{err: errors.New("db: connection reset")}, `{"jobIds":["job-1"]}`, json, http.StatusInternalServerError, "provider_unavailable"},
	}
	for _, tc := range cases {
		r := send(processingRouter(tc.service), http.MethodPost, "/v1/processing-jobs/delete", tc.body, tc.headers...)
		if r.Code != tc.status || errorCode(t, r) != tc.code {
			t.Errorf("%s: status %d", tc.name, r.Code)
		}
	}
}
