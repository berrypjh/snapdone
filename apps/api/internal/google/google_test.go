package google

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

const (
	clientID = "client-123.apps.googleusercontent.com"
	nonce    = "nonce-abc"
)

// idToken은 서명 없는 테스트용 ID token을 만든다. 서명 부분은 검사하지 않는다.
func idToken(t *testing.T, overrides map[string]any) string {
	t.Helper()
	claim := map[string]any{
		"iss":   "https://accounts.google.com",
		"aud":   clientID,
		"exp":   time.Now().Add(time.Hour).Unix(),
		"nonce": nonce,
		"sub":   "google-sub-1",
	}
	for k, v := range overrides {
		claim[k] = v
	}
	payload, err := json.Marshal(claim)
	if err != nil {
		t.Fatal(err)
	}
	return "eyJhbGciOiJSUzI1NiJ9." + base64.RawURLEncoding.EncodeToString(payload) + ".sig"
}

// handlerTransport는 포트를 열지 않고 요청을 handler로 바로 보낸다.
// 요청 context가 끝나면 handler를 기다리지 않고 오류를 돌려준다(client timeout 재현).
type handlerTransport struct{ handler http.Handler }

func (h handlerTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	recorder := httptest.NewRecorder()
	done := make(chan struct{})
	go func() {
		h.handler.ServeHTTP(recorder, req)
		close(done)
	}()
	select {
	case <-done:
		return recorder.Result(), nil
	case <-req.Context().Done():
		return nil, req.Context().Err()
	}
}

// fakeGoogle은 token 요청 form을 기록하고 handler로 응답하는 가짜 token endpoint를 쓰는 client를 만든다.
func fakeGoogle(t *testing.T, handler http.HandlerFunc) (*Client, *url.Values) {
	t.Helper()
	var form url.Values
	client := NewClient(clientID, "secret", "https://api.example.com/v1/auth/oauth/callback")
	client.TokenURL = "https://token.test/token"
	client.HTTP.Transport = handlerTransport{http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			t.Error(err)
		}
		form = r.PostForm
		handler(w, r)
	})}
	return client, &form
}

func tokenResponse(token string) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]string{"id_token": token, "access_token": "unused"})
	}
}

func TestAuthorizeURLFixesScopeRedirectAndPKCE(t *testing.T) {
	client := NewClient(clientID, "secret", "https://api.example.com/v1/auth/oauth/callback")

	u, err := url.Parse(client.AuthorizeURL("g-state", "g-challenge", nonce))
	if err != nil {
		t.Fatal(err)
	}
	if u.Scheme+"://"+u.Host+u.Path != AuthorizeEndpoint {
		t.Errorf("endpoint = %s", u.Scheme+"://"+u.Host+u.Path)
	}
	want := map[string]string{
		"client_id":             clientID,
		"redirect_uri":          "https://api.example.com/v1/auth/oauth/callback",
		"response_type":         "code",
		"scope":                 "openid",
		"state":                 "g-state",
		"nonce":                 nonce,
		"code_challenge":        "g-challenge",
		"code_challenge_method": "S256",
	}
	query := u.Query()
	if len(query) != len(want) {
		t.Errorf("query has %d params, want exactly %d: %v", len(query), len(want), query)
	}
	for key, value := range want {
		if query.Get(key) != value {
			t.Errorf("%s = %q, want %q", key, query.Get(key), value)
		}
	}
}

func TestExchangeSendsVerifierAndSecretAndReturnsSub(t *testing.T) {
	client, form := fakeGoogle(t, tokenResponse(idToken(t, nil)))

	sub, err := client.Exchange(context.Background(), "auth-code", "g-verifier", nonce)
	if err != nil {
		t.Fatal(err)
	}
	if sub != "google-sub-1" {
		t.Errorf("sub = %q", sub)
	}
	for key, value := range map[string]string{
		"code": "auth-code", "code_verifier": "g-verifier", "client_id": clientID,
		"client_secret": "secret", "grant_type": "authorization_code",
		"redirect_uri": "https://api.example.com/v1/auth/oauth/callback",
	} {
		if form.Get(key) != value {
			t.Errorf("form %s = %q, want %q", key, form.Get(key), value)
		}
	}
}

func TestExchangeAcceptsBareIssuer(t *testing.T) {
	client, _ := fakeGoogle(t, tokenResponse(idToken(t, map[string]any{"iss": "accounts.google.com"})))

	if _, err := client.Exchange(context.Background(), "code", "v", nonce); err != nil {
		t.Errorf("bare issuer rejected: %v", err)
	}
}

func TestExchangeRejectsInvalidIDTokenClaims(t *testing.T) {
	cases := map[string]string{
		"wrong iss":     idToken(t, map[string]any{"iss": "https://evil.example.com"}),
		"wrong aud":     idToken(t, map[string]any{"aud": "other-client"}),
		"aud as array":  idToken(t, map[string]any{"aud": []string{clientID}}),
		"expired":       idToken(t, map[string]any{"exp": time.Now().Add(-time.Minute).Unix()}),
		"wrong nonce":   idToken(t, map[string]any{"nonce": "replayed"}),
		"missing nonce": idToken(t, map[string]any{"nonce": ""}),
		"missing sub":   idToken(t, map[string]any{"sub": ""}),
		"not a jwt":     "garbage",
		"bad payload":   "a.!!!.c",
	}
	for name, token := range cases {
		t.Run(name, func(t *testing.T) {
			client, _ := fakeGoogle(t, tokenResponse(token))

			if _, err := client.Exchange(context.Background(), "code", "v", nonce); !errors.Is(err, ErrInvalidIDToken) {
				t.Errorf("err = %v, want ErrInvalidIDToken", err)
			}
		})
	}
}

func TestExchangeMapsTokenEndpointFailures(t *testing.T) {
	status := func(code int) http.HandlerFunc {
		return func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(code) }
	}
	cases := []struct {
		name    string
		handler http.HandlerFunc
		want    error
	}{
		{"400 invalid_grant", status(http.StatusBadRequest), ErrRejected},
		{"401", status(http.StatusUnauthorized), ErrRejected},
		{"500", status(http.StatusInternalServerError), ErrUnavailable},
		{"503", status(http.StatusServiceUnavailable), ErrUnavailable},
		{"redirect is not followed", func(w http.ResponseWriter, r *http.Request) {
			http.Redirect(w, r, "https://evil.example.com", http.StatusFound)
		}, ErrUnavailable},
		{"malformed body", func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte("{")) }, ErrUnavailable},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			client, _ := fakeGoogle(t, tc.handler)

			if _, err := client.Exchange(context.Background(), "code", "v", nonce); !errors.Is(err, tc.want) {
				t.Errorf("err = %v, want %v", err, tc.want)
			}
		})
	}
}

func TestExchangeTimesOut(t *testing.T) {
	client, _ := fakeGoogle(t, func(_ http.ResponseWriter, r *http.Request) { <-r.Context().Done() })
	client.HTTP.Timeout = 50 * time.Millisecond

	if _, err := client.Exchange(context.Background(), "code", "v", nonce); !errors.Is(err, ErrUnavailable) {
		t.Errorf("err = %v, want ErrUnavailable", err)
	}
}

func TestExchangeErrorsDoNotLeakSecrets(t *testing.T) {
	client, _ := fakeGoogle(t, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":"invalid_grant"}`))
	})

	_, err := client.Exchange(context.Background(), "the-code", "the-verifier", nonce)
	for _, secret := range []string{"the-code", "the-verifier", "secret"} {
		if strings.Contains(err.Error(), secret) {
			t.Errorf("error %q leaks %q", err, secret)
		}
	}
}
