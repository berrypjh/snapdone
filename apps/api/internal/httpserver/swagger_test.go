package httpserver

import (
	"encoding/json"
	"net/http"
	"slices"
	"strings"
	"testing"

	"snapdone/api/docs/swagger"
)

// 생성된 Swagger 문서의 "METHOD path" 목록.
func documentedOperations(t *testing.T) []string {
	t.Helper()
	var doc struct {
		Paths map[string]map[string]json.RawMessage `json:"paths"`
	}
	if err := json.Unmarshal([]byte(swagger.SwaggerInfo.ReadDoc()), &doc); err != nil {
		t.Fatal(err)
	}
	var ops []string
	for path, methods := range doc.Paths {
		for method := range methods {
			ops = append(ops, strings.ToUpper(method)+" "+path)
		}
	}
	return ops
}

// Gin 경로 매개변수(:jobId)를 Swagger 표기({jobId})로 바꾼다.
func swaggerPath(ginPath string) string {
	segments := strings.Split(ginPath, "/")
	for i, segment := range segments {
		if name, ok := strings.CutPrefix(segment, ":"); ok {
			segments[i] = "{" + name + "}"
		}
	}
	return strings.Join(segments, "/")
}

// 등록된 route와 Swagger 문서가 일치해야 한다. 새 endpoint에 주석을 달지 않았거나
// `nx run api:swagger`로 다시 생성하지 않으면 여기서 실패한다.
// HEAD route는 GET을 그대로 받는 것이라 GET 문서로 대신하고, Swagger UI route는 제외한다.
func TestEveryRouteIsDocumentedInSwagger(t *testing.T) {
	documented := documentedOperations(t)

	var registered []string
	for _, route := range NewRouter(Deps{Swagger: true}).Routes() {
		path := swaggerPath(route.Path)
		switch {
		case strings.HasPrefix(path, "/swagger/"):
		case route.Method == http.MethodHead:
			if !slices.Contains(documented, "GET "+path) {
				t.Errorf("HEAD %s has no documented GET", path)
			}
		default:
			registered = append(registered, route.Method+" "+path)
		}
	}

	slices.Sort(registered)
	slices.Sort(documented)
	if !slices.Equal(registered, documented) {
		t.Errorf("routes and Swagger differ; add annotations and run `nx run api:swagger`\nregistered: %v\ndocumented: %v",
			registered, documented)
	}
	if len(registered) != 17 {
		t.Errorf("registered %d API routes, want 17", len(registered))
	}
}

// Bearer가 필요한 endpoint만 BearerAuth로 문서화한다.
func TestSwaggerSecurityMatchesBearerRoutes(t *testing.T) {
	var doc struct {
		SecurityDefinitions map[string]struct {
			Type string `json:"type"`
			In   string `json:"in"`
			Name string `json:"name"`
		} `json:"securityDefinitions"`
		Paths map[string]map[string]struct {
			Security []map[string][]string `json:"security"`
		} `json:"paths"`
	}
	if err := json.Unmarshal([]byte(swagger.SwaggerInfo.ReadDoc()), &doc); err != nil {
		t.Fatal(err)
	}
	if def := doc.SecurityDefinitions["BearerAuth"]; def.Type != "apiKey" || def.In != "header" || def.Name != "Authorization" {
		t.Errorf("BearerAuth = %+v", def)
	}

	var secured []string
	for path, methods := range doc.Paths {
		for method, op := range methods {
			if len(op.Security) > 0 {
				secured = append(secured, strings.ToUpper(method)+" "+path)
			}
		}
	}
	slices.Sort(secured)
	want := []string{
		"GET /v1/auth/session", "GET /v1/onboarding", "GET /v1/processing-jobs/{jobId}", "GET /v1/processing-preferences",
		"POST /v1/auth/handoff/start", "POST /v1/auth/logout", "POST /v1/onboarding/complete", "POST /v1/processing-jobs",
		"PUT /v1/onboarding", "PUT /v1/processing-preferences/{imageType}",
	}
	if !slices.Equal(secured, want) {
		t.Errorf("secured operations = %v, want %v", secured, want)
	}
}
