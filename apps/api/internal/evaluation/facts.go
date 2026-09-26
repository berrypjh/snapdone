package evaluation

import (
	"regexp"
	"slices"
	"strings"
	"unicode"
)

var (
	digitRun      = regexp.MustCompile(`[0-9]+`)
	thousandComma = regexp.MustCompile(`([0-9]),([0-9]{3})`)
)

// 비교할 모양으로 바꾼 값. 비면 비교할 것이 없다.
func normalizeFact(kind FactKind, value string) string {
	if kind == FactText {
		return foldText(value)
	}
	return strings.Join(numberGroups(kind, value), "-")
}

// 공백을 모두 빼고 소문자로.
func foldText(value string) string {
	return strings.Map(func(r rune) rune {
		if unicode.IsSpace(r) {
			return -1
		}
		return unicode.ToLower(r)
	}, value)
}

// 값 속의 수들. 금액은 천 단위 쉼표를 먼저 없앤다. 앞의 0은 뺀다(09 → 9).
func numberGroups(kind FactKind, value string) []string {
	if kind == FactAmount {
		for thousandComma.MatchString(value) {
			value = thousandComma.ReplaceAllString(value, "$1$2")
		}
	}
	groups := digitRun.FindAllString(value, -1)
	for i, g := range groups {
		if trimmed := strings.TrimLeft(g, "0"); trimmed != "" {
			groups[i] = trimmed
		} else {
			groups[i] = "0"
		}
	}
	return groups
}

// 예측 facts의 값 중 하나가 허용 값 하나를 담고 있는지.
func factFound(f ExpectedFact, predicted []ClassificationFact) bool {
	for _, p := range predicted {
		for _, accepted := range f.AcceptedValues {
			if factMatches(f.Kind, accepted, p.Value) {
				return true
			}
		}
	}
	return false
}

func factMatches(kind FactKind, accepted, value string) bool {
	switch kind {
	case FactText:
		want := foldText(accepted)
		return want != "" && strings.Contains(foldText(value), want)
	case FactAmount:
		want := numberGroups(kind, accepted)
		return len(want) == 1 && slices.Contains(numberGroups(kind, value), want[0])
	}
	return containsRun(numberGroups(kind, value), numberGroups(kind, accepted))
}

// want가 got 안에 순서대로 이어서 있는지.
func containsRun(got, want []string) bool {
	if len(want) == 0 {
		return false
	}
	for i := 0; i+len(want) <= len(got); i++ {
		if slices.Equal(got[i:i+len(want)], want) {
			return true
		}
	}
	return false
}
