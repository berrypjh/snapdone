package auth

import "testing"

// 핸드오프 뒤 경로는 정해진 경로이거나, 소문자 uuid 하나로 된 처리 결과 경로뿐이다. wildcard가 아니다.
func TestAllowedNext(t *testing.T) {
	for _, next := range []string{
		"/", "/history", "/settings/processing",
		"/history/4f1c2a9e-0000-4000-8000-000000000000",
	} {
		if !allowedNext(next) {
			t.Errorf("%q: want allowed", next)
		}
	}
	for _, next := range []string{
		"/history/",
		"/history/job-1",
		"/history/4F1C2A9E-0000-4000-8000-000000000000",
		"/history/4f1c2a9e-0000-4000-8000-00000000000",
		"/history/4f1c2a9e-0000-4000-8000-000000000000/",
		"/history/4f1c2a9e-0000-4000-8000-000000000000?x=1",
		"/history/4f1c2a9e-0000-4000-8000-000000000000/receipt",
		"/history/../settings",
		"/history/4f1c2a9e-0000-4000-8000-000000000000\n",
		"//history/4f1c2a9e-0000-4000-8000-000000000000",
		"/settings/processing/",
	} {
		if allowedNext(next) {
			t.Errorf("%q: want refused", next)
		}
	}
}
