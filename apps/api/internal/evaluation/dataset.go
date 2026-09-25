package evaluation

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"slices"
	"strings"
	"unicode/utf8"

	"snapdone/api/internal/processing"
)

const ManifestSchemaVersion = 1

// production이 받는 사진 상한(httpserver.maxImageBytes)과 같은 값. 제품에 들어올 수 없는 사진은 평가에도 넣지 않는다.
const maxFixtureBytes = 7_500_000

// production이 받는 형식(httpserver.imageTypes)과 그 확장자. 형식은 파일 이름이 아니라 내용으로 판별한다.
var fixtureExtensions = map[string][]string{
	"image/jpeg": {".jpg", ".jpeg"},
	"image/png":  {".png"},
	"image/gif":  {".gif"},
	"image/webp": {".webp"},
}

// dataset이 무엇을 증명할 수 있는지. software-fixture는 loader 검증용이고 benchmark로 세지 않는다.
type Tier string

const (
	SoftwareFixture Tier = "software-fixture"
	SyntheticPilot  Tier = "synthetic-pilot"
	GoldenBenchmark Tier = "golden-benchmark"
)

// dataset 디렉터리의 manifest.json.
type Manifest struct {
	SchemaVersion int                 `json:"schemaVersion"`
	Name          string              `json:"name"`
	Version       int                 `json:"version"`
	Task          Task                `json:"task"`
	Tier          Tier                `json:"tier"`
	License       string              `json:"license"`
	Guideline     string              `json:"guideline"`
	Splits        map[Split]SplitFile `json:"splits"`
	// split별 category당 목표 case 수. 목표는 정책이고, 수를 채우려고 정답을 지어내지 않는다.
	TargetPerCategory map[Split]int `json:"targetPerCategory"`
}

// split 하나의 JSONL 파일과 그 안의 case 수. 수가 실제와 다르면 읽기를 거절한다.
type SplitFile struct {
	File  string `json:"file"`
	Cases int    `json:"cases"`
}

func (m Manifest) Validate() error {
	checks := []error{
		schemaVersion("manifest", m.SchemaVersion, ManifestSchemaVersion),
		identifier("name", m.Name),
		oneOf("task", m.Task, tasks),
		oneOf("tier", m.Tier, []Tier{SoftwareFixture, SyntheticPilot, GoldenBenchmark}),
		nonEmpty("license", m.License),
		nonEmpty("guideline", m.Guideline),
	}
	if m.Version < 1 {
		checks = append(checks, errors.New("evaluation: version starts at 1"))
	}
	for _, split := range splits {
		file, ok := m.Splits[split]
		if !ok {
			checks = append(checks, fmt.Errorf("evaluation: splits.%s is required", split))
			continue
		}
		checks = append(checks, relativePath("splits."+string(split)+".file", file.File))
		if file.Cases < 0 {
			checks = append(checks, fmt.Errorf("evaluation: splits.%s.cases is not negative", split))
		}
	}
	for split, target := range m.TargetPerCategory {
		checks = append(checks, oneOf("targetPerCategory key", split, splits))
		if target < 0 {
			checks = append(checks, errors.New("evaluation: targetPerCategory is not negative"))
		}
	}
	for split := range m.Splits {
		checks = append(checks, oneOf("splits key", split, splits))
	}
	return errors.Join(checks...)
}

// 읽어 들인 case. Line은 JSONL 원문 한 줄, Image는 사진 byte다. 둘 다 selection hash에 들어간다.
type LoadedCase struct {
	Case
	Line  []byte
	Image []byte
	// 채점에 쓸 수 있는지. 아니면 Blockers가 이유를 말한다.
	Eligible bool
	Blockers []string
}

// 검증을 마친 dataset. Cases는 id 순이다.
type Dataset struct {
	Root      string
	Manifest  Manifest
	Cases     []LoadedCase
	Readiness Readiness
}

// dataset이 benchmark로 쓸 준비가 됐는지와, 아니라면 무엇이 모자란지.
type Readiness struct {
	Tier           Tier
	Splits         map[Split]SplitReadiness
	BenchmarkReady bool
	Reasons        []string
}

type SplitReadiness struct {
	Cases    int
	Reviewed int
	Draft    int
	Eligible int
	// category별 채점 가능 case 수(image-classification만).
	EligiblePerCategory map[string]int
	TargetPerCategory   int
}

// 디렉터리에서 dataset을 읽고 전부 검증한다. 사진은 root 안의 파일만 읽는다(symlink 포함).
func LoadDataset(dir string, contract processing.Contract) (Dataset, error) {
	root, err := datasetRoot(dir)
	if err != nil {
		return Dataset{}, err
	}
	manifest, err := readManifest(root)
	if err != nil {
		return Dataset{}, err
	}
	var cases []LoadedCase
	ids := map[string]bool{}
	for _, split := range splits {
		lines, err := readLines(root, manifest.Splits[split].File)
		if err != nil {
			return Dataset{}, err
		}
		if len(lines) != manifest.Splits[split].Cases {
			return Dataset{}, fmt.Errorf("evaluation: %s declares %d cases but %s has %d", split, manifest.Splits[split].Cases, manifest.Splits[split].File, len(lines))
		}
		for i, line := range lines {
			c, err := DecodeCase(bytes.NewReader(line), contract)
			if err != nil {
				return Dataset{}, fmt.Errorf("evaluation: %s line %d: %w", manifest.Splits[split].File, i+1, err)
			}
			if c.Split != split || c.Task != manifest.Task {
				return Dataset{}, fmt.Errorf("evaluation: case %s is %s/%s but the file is %s/%s", c.ID, c.Task, c.Split, manifest.Task, split)
			}
			if ids[c.ID] {
				return Dataset{}, fmt.Errorf("evaluation: case id %s appears twice", c.ID)
			}
			ids[c.ID] = true
			loaded := LoadedCase{Case: c, Line: line}
			if c.Task != Translation {
				if loaded.Image, err = readFixture(root, c.ID, *c.Input.Image); err != nil {
					return Dataset{}, err
				}
			}
			cases = append(cases, loaded)
		}
	}
	if err := checkLeakage(cases); err != nil {
		return Dataset{}, err
	}
	slices.SortFunc(cases, func(a, b LoadedCase) int { return strings.Compare(a.ID, b.ID) })
	for i := range cases {
		cases[i].Blockers = blockers(cases[i].Case)
		cases[i].Eligible = len(cases[i].Blockers) == 0
	}
	return Dataset{Root: root, Manifest: manifest, Cases: cases, Readiness: readinessOf(manifest, cases, contract)}, nil
}

// symlink를 푼 절대 경로. 이 아래만 읽는다.
func datasetRoot(dir string) (string, error) {
	abs, err := filepath.Abs(dir)
	if err != nil {
		return "", err
	}
	root, err := filepath.EvalSymlinks(abs)
	if err != nil {
		return "", fmt.Errorf("evaluation: dataset root: %w", err)
	}
	info, err := os.Stat(root)
	if err != nil || !info.IsDir() {
		return "", fmt.Errorf("evaluation: dataset root %s is not a directory", dir)
	}
	return root, nil
}

// root 아래의 상대 경로를 실제 파일로 푼다. symlink · `..`로 root 밖에 닿으면 거절한다.
func contained(root, rel string) (string, error) {
	if err := relativePath("path", rel); err != nil {
		return "", err
	}
	resolved, err := filepath.EvalSymlinks(filepath.Join(root, filepath.FromSlash(rel)))
	if err != nil {
		return "", fmt.Errorf("evaluation: %s: %w", rel, err)
	}
	if resolved != root && !strings.HasPrefix(resolved, root+string(filepath.Separator)) {
		return "", fmt.Errorf("evaluation: %s resolves outside the dataset", rel)
	}
	return resolved, nil
}

// URL · 절대 경로 · `..` · 정리되지 않은 경로를 거절한다.
func relativePath(field, value string) error {
	clean := path.Clean(value)
	if value == "" || strings.Contains(value, "://") || strings.Contains(value, "\\") ||
		path.IsAbs(value) || filepath.IsAbs(value) || clean != value || clean == "." || strings.HasPrefix(clean, "..") {
		return fmt.Errorf("evaluation: %s %q must be a clean relative path inside the dataset", field, value)
	}
	return nil
}

func readManifest(root string) (Manifest, error) {
	file, err := contained(root, "manifest.json")
	if err != nil {
		return Manifest{}, err
	}
	f, err := os.Open(file)
	if err != nil {
		return Manifest{}, err
	}
	defer f.Close()
	var manifest Manifest
	if err := decodeStrict(f, &manifest); err != nil {
		return Manifest{}, fmt.Errorf("evaluation: manifest.json: %w", err)
	}
	if err := manifest.Validate(); err != nil {
		return Manifest{}, err
	}
	return manifest, nil
}

// JSONL의 줄들. 빈 파일은 0줄이고, 중간의 빈 줄과 잘못된 UTF-8은 거절한다.
func readLines(root, rel string) ([][]byte, error) {
	file, err := contained(root, rel)
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(file)
	if err != nil {
		return nil, err
	}
	if !utf8.Valid(data) {
		return nil, fmt.Errorf("evaluation: %s is not valid UTF-8", rel)
	}
	if len(data) == 0 {
		return nil, nil
	}
	lines := bytes.Split(bytes.TrimSuffix(data, []byte("\n")), []byte("\n"))
	for i, line := range lines {
		if len(bytes.TrimSpace(line)) == 0 {
			return nil, fmt.Errorf("evaluation: %s line %d is blank", rel, i+1)
		}
	}
	return lines, nil
}

// 사진 파일을 읽어 크기 · 형식 · 확장자 · hash를 case와 대조한다.
func readFixture(root, caseID string, ref ImageRef) ([]byte, error) {
	file, err := contained(root, ref.Path)
	if err != nil {
		return nil, fmt.Errorf("evaluation: case %s: %w", caseID, err)
	}
	info, err := os.Stat(file)
	if err != nil {
		return nil, err
	}
	if info.Size() > maxFixtureBytes {
		return nil, fmt.Errorf("evaluation: case %s image is %d bytes, over the %d byte limit", caseID, info.Size(), maxFixtureBytes)
	}
	data, err := os.ReadFile(file)
	if err != nil {
		return nil, err
	}
	detected := http.DetectContentType(data)
	extensions, supported := fixtureExtensions[detected]
	if !supported || detected != ref.MediaType {
		return nil, fmt.Errorf("evaluation: case %s image content is %s, not %s", caseID, detected, ref.MediaType)
	}
	if !slices.Contains(extensions, strings.ToLower(path.Ext(ref.Path))) {
		return nil, fmt.Errorf("evaluation: case %s image extension does not match %s", caseID, detected)
	}
	sum := sha256.Sum256(data)
	if hex.EncodeToString(sum[:]) != ref.SHA256 {
		return nil, fmt.Errorf("evaluation: case %s image sha256 does not match", caseID)
	}
	return data, nil
}

// 같은 사진이나 같은 원본(sourceGroupId)이 split 사이에 걸치면 정답이 샌다. 비슷한 사진(near-duplicate)은 아직 잡지 못한다.
func checkLeakage(cases []LoadedCase) error {
	imageSplit := map[string]Split{}
	groupSplit := map[string]Split{}
	for _, c := range cases {
		if c.Image != nil {
			sum := sha256.Sum256(c.Image)
			key := hex.EncodeToString(sum[:])
			if seen, ok := imageSplit[key]; ok {
				return fmt.Errorf("evaluation: case %s repeats an image already in %s", c.ID, seen)
			}
			imageSplit[key] = c.Split
		}
		group := c.Provenance.SourceGroupID
		if seen, ok := groupSplit[group]; ok && seen != c.Split {
			return fmt.Errorf("evaluation: source group %s appears in both %s and %s", group, seen, c.Split)
		}
		groupSplit[group] = c.Split
	}
	return nil
}

// 채점에 쓰지 못하는 이유. 검토가 실제로 있었는지는 코드가 알 수 없고 provenance를 적은 사람의 책임이다.
func blockers(c Case) []string {
	var reasons []string
	if c.Annotation.Review != Reviewed {
		reasons = append(reasons, "annotation review is "+string(c.Annotation.Review))
	}
	if c.Provenance.PrivacyReview != Reviewed {
		reasons = append(reasons, "privacy review is "+string(c.Provenance.PrivacyReview))
	}
	if c.Annotation.Ambiguity == Ambiguous {
		reasons = append(reasons, "ambiguity is high")
	}
	if c.Split != Dev && c.Annotation.Method != Human {
		reasons = append(reasons, string(c.Split)+" needs human review, has "+string(c.Annotation.Method))
	}
	return reasons
}

func readinessOf(manifest Manifest, cases []LoadedCase, contract processing.Contract) Readiness {
	r := Readiness{Tier: manifest.Tier, Splits: map[Split]SplitReadiness{}}
	if manifest.Tier != GoldenBenchmark {
		r.Reasons = append(r.Reasons, fmt.Sprintf("tier is %s, not %s", manifest.Tier, GoldenBenchmark))
	}
	for _, split := range splits {
		s := SplitReadiness{EligiblePerCategory: map[string]int{}, TargetPerCategory: manifest.TargetPerCategory[split]}
		for _, c := range cases {
			if c.Split != split {
				continue
			}
			s.Cases++
			if c.Annotation.Review == Reviewed {
				s.Reviewed++
			} else {
				s.Draft++
			}
			if c.Eligible {
				s.Eligible++
				if c.Expected.Classification != nil {
					s.EligiblePerCategory[c.Expected.Classification.Category]++
				}
			}
		}
		if s.Eligible < s.Cases {
			r.Reasons = append(r.Reasons, fmt.Sprintf("%s: %d of %d cases eligible", split, s.Eligible, s.Cases))
		}
		if manifest.Task == ImageClassification {
			for _, category := range contract.Categories {
				if s.EligiblePerCategory[category] < s.TargetPerCategory {
					r.Reasons = append(r.Reasons, fmt.Sprintf("%s: %s has %d of %d eligible", split, category, s.EligiblePerCategory[category], s.TargetPerCategory))
				}
			}
		} else if s.Eligible < s.TargetPerCategory {
			r.Reasons = append(r.Reasons, fmt.Sprintf("%s: %d of %d eligible", split, s.Eligible, s.TargetPerCategory))
		}
		r.Splits[split] = s
	}
	r.BenchmarkReady = len(r.Reasons) == 0
	return r
}

type SelectOptions struct {
	// 채점 자격이 없는 case도 포함한다(구조 검증 · 시험 실행용). 점수는 benchmark가 아니다.
	AllowDrafts bool
	// held-out을 고른다. 마지막 확인이 아니면 열지 않는다.
	AllowHeldOut bool
}

// 한 split의 채점 대상과 그 내용의 hash. Cases는 id 순이라 hash는 파일 순서와 무관하다.
type Selection struct {
	Split Split
	Cases []LoadedCase
	Hash  string
}

// split의 case를 고른다. 비어 있으면 거절한다 — 빈 split의 100%는 성공이 아니다.
func (d Dataset) Select(split Split, opts SelectOptions) (Selection, error) {
	if err := oneOf("split", split, splits); err != nil {
		return Selection{}, err
	}
	if split == HeldOut && !opts.AllowHeldOut {
		return Selection{}, errors.New("evaluation: held-out is closed; select it only for a final check with AllowHeldOut")
	}
	var chosen []LoadedCase
	var ineligible []string
	for _, c := range d.Cases {
		if c.Split != split {
			continue
		}
		chosen = append(chosen, c)
		if !c.Eligible {
			ineligible = append(ineligible, c.ID+" ("+strings.Join(c.Blockers, "; ")+")")
		}
	}
	if len(chosen) == 0 {
		return Selection{}, fmt.Errorf("evaluation: %s has no cases; an empty split is not a pass", split)
	}
	if len(ineligible) > 0 && !opts.AllowDrafts {
		return Selection{}, fmt.Errorf("evaluation: %s has %d cases not eligible for scoring: %s", split, len(ineligible), strings.Join(ineligible, ", "))
	}
	return Selection{Split: split, Cases: chosen, Hash: selectionHash(d.Manifest, split, chosen)}, nil
}

// 고른 case의 내용 hash. id 순으로 id · JSONL 원문 · 사진 byte를 잇는다.
func selectionHash(manifest Manifest, split Split, chosen []LoadedCase) string {
	h := sha256.New()
	fmt.Fprintf(h, "%s@%d/%s\n", manifest.Name, manifest.Version, split)
	for _, c := range chosen {
		for _, part := range [][]byte{[]byte(c.ID), c.Line, c.Image} {
			_, _ = h.Write(part)
			_, _ = io.WriteString(h, "\n")
		}
	}
	return hex.EncodeToString(h.Sum(nil))
}
