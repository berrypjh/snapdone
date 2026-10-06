package httpserver

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"snapdone/api/internal/processing"
)

// PNG 파일 서명. http.DetectContentType이 image/png로 본다.
var pngImage = append([]byte("\x89PNG\r\n\x1a\n"), make([]byte, 64)...)

// fakeProcessing은 user-1의 job-1과 최근 작업 recent만 알고, 시작 요청과 목록을 물은 사용자를 기록한다.
type fakeProcessing struct {
	job       processing.Job
	recent    []processing.Job
	err       error
	userID    string
	origin    processing.Origin
	mediaType string
	image     []byte
}

func (f *fakeProcessing) Start(_ context.Context, userID string, origin processing.Origin, image []byte, mediaType string) (processing.Job, error) {
	f.userID, f.origin, f.image, f.mediaType = userID, origin, image, mediaType
	return processing.Job{ID: "job-1", Status: processing.StatusRunning}, nil
}

func (f *fakeProcessing) Recent(_ context.Context, userID string) ([]processing.Job, error) {
	f.userID = userID
	if userID != "user-1" {
		return []processing.Job{}, f.err
	}
	return f.recent, f.err
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
		"purpose":     processing.OriginOnboarding,
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
