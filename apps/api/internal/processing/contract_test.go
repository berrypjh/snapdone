package processing

import (
	"context"
	"encoding/json"
	"reflect"
	"testing"
)

func TestDescribeContractMatchesTheParser(t *testing.T) {
	c := DescribeContract()
	if len(c.Categories) != 7 || len(c.Actions) != 5 || len(c.Confidence) != 3 {
		t.Fatalf("sizes = %d %d %d", len(c.Categories), len(c.Actions), len(c.Confidence))
	}
	for _, category := range c.Categories {
		for _, action := range c.Actions {
			for _, level := range c.Confidence {
				text := `{"category":"` + category + `","facts":[],"suggestedAction":"` + action + `","confidence":"` + level + `"}`
				if _, err := parseResult(text); err != nil {
					t.Errorf("parser rejects %s: %v", text, err)
				}
			}
		}
	}
	if c.Instructions != instructions || c.Request != request || len(c.Hash) != 64 {
		t.Errorf("contract = %+v", c)
	}
	if c.Hash != DescribeContract().Hash {
		t.Error("hash is not stable")
	}
}

// 돌려준 값을 바꿔도 분류기의 enum · schema는 그대로다.
func TestDescribeContractIsACopy(t *testing.T) {
	c := DescribeContract()
	c.Categories[0] = "food"
	c.Actions[0] = "buy"
	c.Confidence[0] = "0.9"
	c.Schema["properties"] = nil

	if _, err := parseResult(`{"category":"food","facts":[],"suggestedAction":"buy","confidence":"0.9"}`); err == nil {
		t.Error("mutating the descriptor changed the parser")
	}
	if _, err := parseResult(`{"category":"place","facts":[],"suggestedAction":"save_place","confidence":"high"}`); err != nil {
		t.Error(err)
	}
	if resultSchema()["properties"] == nil || !reflect.DeepEqual(DescribeContract().Categories, categories) {
		t.Error("mutating the descriptor changed the schema or the enums")
	}
}

// 두 공급자가 실제로 보내는 지시 · 요청 · schema가 descriptor와 같다.
func TestDescribeContractMatchesProviderRequests(t *testing.T) {
	c := DescribeContract()
	var want any
	encoded, _ := json.Marshal(c.Schema)
	_ = json.Unmarshal(encoded, &want)

	t.Run("claude", func(t *testing.T) {
		classifier, body, _ := fakeClaude(t, "end_turn", resultJSON)
		if _, err := classifier.Classify(context.Background(), []byte("x"), "image/png"); err != nil {
			t.Fatal(err)
		}
		system := (*body)["system"].([]any)[0].(map[string]any)["text"]
		content := (*body)["messages"].([]any)[0].(map[string]any)["content"].([]any)
		text := content[1].(map[string]any)["text"]
		schema := (*body)["output_config"].(map[string]any)["format"].(map[string]any)["schema"]
		if system != c.Instructions || text != c.Request || !reflect.DeepEqual(schema, want) {
			t.Errorf("system = %v, text = %v, schema = %v", system, text, schema)
		}
	})
	t.Run("openai", func(t *testing.T) {
		classifier, _, body := fakeChat(t, "", 200, "stop", resultJSON)
		if _, err := classifier.Classify(context.Background(), []byte("x"), "image/png"); err != nil {
			t.Fatal(err)
		}
		messages := (*body)["messages"].([]any)
		system := messages[0].(map[string]any)["content"]
		text := messages[1].(map[string]any)["content"].([]any)[1].(map[string]any)["text"]
		schema := (*body)["response_format"].(map[string]any)["json_schema"].(map[string]any)["schema"]
		if system != c.Instructions || text != c.Request || !reflect.DeepEqual(schema, want) {
			t.Errorf("system = %v, text = %v, schema = %v", system, text, schema)
		}
	})
}
