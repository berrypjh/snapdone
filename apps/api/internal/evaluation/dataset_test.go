package evaluation

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadDatasetFromTestdata(t *testing.T) {
	ds, err := LoadDataset("testdata/datasets/software-fixture", contract)
	if err != nil {
		t.Fatal(err)
	}
	ids := make([]string, len(ds.Cases))
	for i, c := range ds.Cases {
		ids[i] = c.ID
	}
	if strings.Join(ids, ",") != "sf-dev-01,sf-dev-02,sf-held-01,sf-val-01" {
		t.Fatalf("ids = %v", ids)
	}
	want := map[Split]SplitReadiness{
		Dev:        {Cases: 2, Reviewed: 2, Eligible: 2},
		Validation: {Cases: 1, Reviewed: 1, Eligible: 1},
		HeldOut:    {Cases: 1, Draft: 1},
	}
	for split, w := range want {
		got := ds.Readiness.Splits[split]
		if got.Cases != w.Cases || got.Reviewed != w.Reviewed || got.Draft != w.Draft || got.Eligible != w.Eligible {
			t.Errorf("%s readiness = %+v", split, got)
		}
	}
	if ds.Readiness.BenchmarkReady || !strings.Contains(strings.Join(ds.Readiness.Reasons, "\n"), "software-fixture") {
		t.Errorf("readiness = %+v", ds.Readiness)
	}
	if held := ds.Cases[2]; held.Eligible || held.Blockers[0] != "annotation review is draft" {
		t.Errorf("held-out case = %+v", held.Blockers)
	}
}

// 저장소의 pilot dataset이 loader를 통과하고, readiness가 실제 상태를 말한다.
// 이 테스트는 apps/api 밖(tools/evals)을 읽는다 — Nx test input에 반영할 대상이다.
func TestLoadPilotDataset(t *testing.T) {
	ds, err := LoadDataset("../../../../tools/evals/datasets/pilot-v1", contract)
	if err != nil {
		t.Fatal(err)
	}
	if ds.Manifest.Tier != SyntheticPilot || ds.Readiness.BenchmarkReady {
		t.Fatalf("tier = %s, ready = %v", ds.Manifest.Tier, ds.Readiness.BenchmarkReady)
	}
	dev := ds.Readiness.Splits[Dev]
	if dev.Cases != 7 || dev.Eligible != 7 || len(dev.EligiblePerCategory) != len(contract.Categories) {
		t.Errorf("dev readiness = %+v", dev)
	}
	for _, split := range []Split{Validation, HeldOut} {
		if s := ds.Readiness.Splits[split]; s.Cases != 0 {
			t.Errorf("%s has %d cases; the pilot has no human-reviewed cases yet", split, s.Cases)
		}
	}
	if _, err := ds.Select(Dev, SelectOptions{}); err != nil {
		t.Error(err)
	}
	if _, err := ds.Select(Validation, SelectOptions{}); err == nil {
		t.Error("empty validation split selected")
	}
}

func TestLoadDatasetRejects(t *testing.T) {
	outside := t.TempDir()
	escaped := pngBytes(t, 9)
	if err := os.WriteFile(filepath.Join(outside, "escaped.png"), escaped, 0o644); err != nil {
		t.Fatal(err)
	}
	oversize := append(pngBytes(t, 8), make([]byte, maxFixtureBytes)...)

	cases := map[string]struct {
		build func(d *testDataset)
		want  string
	}{
		"duplicate id": {func(d *testDataset) {
			d.add(Dev, fixtureCase("a", Dev, "place", d.image("a.png", pngBytes(t, 1))))
			d.add(Validation, fixtureCase("a", Validation, "place", d.image("b.png", pngBytes(t, 2))))
		}, "appears twice"},
		"invalid enum in a line": {func(d *testDataset) {
			c := fixtureCase("a", Dev, "place", d.image("a.png", pngBytes(t, 1)))
			c["difficulty"] = "trivial"
			d.add(Dev, c)
		}, "difficulty"},
		"hash mismatch": {func(d *testDataset) {
			ref := d.image("a.png", pngBytes(t, 1))
			ref["sha256"] = sha256Hex([]byte("other"))
			d.add(Dev, fixtureCase("a", Dev, "place", ref))
		}, "sha256 does not match"},
		"content is not the claimed type": {func(d *testDataset) {
			ref := d.image("a.jpg", pngBytes(t, 1))
			ref["mediaType"] = "image/jpeg"
			d.add(Dev, fixtureCase("a", Dev, "place", ref))
		}, "content is image/png, not image/jpeg"},
		"extension disagrees with content": {func(d *testDataset) {
			d.add(Dev, fixtureCase("a", Dev, "place", d.image("a.jpg", pngBytes(t, 1))))
		}, "extension does not match"},
		"oversize": {func(d *testDataset) {
			d.add(Dev, fixtureCase("a", Dev, "place", d.image("big.png", oversize)))
		}, "over the"},
		"absolute path": {func(d *testDataset) {
			d.add(Dev, fixtureCase("a", Dev, "place", imageRef("/etc/hosts.png", "image/png", sha256Hex(escaped))))
		}, "clean relative path"},
		"url path": {func(d *testDataset) {
			d.add(Dev, fixtureCase("a", Dev, "place", imageRef("https://example.com/a.png", "image/png", sha256Hex(escaped))))
		}, "clean relative path"},
		"parent traversal": {func(d *testDataset) {
			d.add(Dev, fixtureCase("a", Dev, "place", imageRef("../escaped.png", "image/png", sha256Hex(escaped))))
		}, "clean relative path"},
		"symlink escape": {func(d *testDataset) {
			if err := os.Symlink(filepath.Join(outside, "escaped.png"), filepath.Join(d.root, "fixtures", "link.png")); err != nil {
				t.Fatal(err)
			}
			d.add(Dev, fixtureCase("a", Dev, "place", imageRef("fixtures/link.png", "image/png", sha256Hex(escaped))))
		}, "outside the dataset"},
		"count mismatch": {func(d *testDataset) {
			d.add(Dev, fixtureCase("a", Dev, "place", d.image("a.png", pngBytes(t, 1))))
			d.manifest["splits"].(map[string]any)["dev"].(map[string]any)["cases"] = 2
		}, "declares 2 cases"},
		"split mismatch": {func(d *testDataset) {
			d.add(Dev, fixtureCase("a", Validation, "place", d.image("a.png", pngBytes(t, 1))))
		}, "file is image-classification/dev"},
		"task mismatch": {func(d *testDataset) {
			c := fixtureCase("a", Dev, "place", d.image("a.png", pngBytes(t, 1)))
			c["task"] = "text-extraction"
			c["expected"] = map[string]any{"textExtraction": map[string]any{"text": "x", "readingOrder": "lines-top-to-bottom"}}
			d.add(Dev, c)
		}, "file is image-classification/dev"},
		"same image across splits": {func(d *testDataset) {
			same := pngBytes(t, 1)
			d.add(Dev, fixtureCase("a", Dev, "place", d.image("a.png", same)))
			d.add(HeldOut, fixtureCase("b", HeldOut, "place", d.image("b.png", same)))
		}, "repeats an image already in dev"},
		"same image within a split": {func(d *testDataset) {
			same := pngBytes(t, 1)
			d.add(Dev, fixtureCase("a", Dev, "place", d.image("a.png", same)))
			d.add(Dev, fixtureCase("b", Dev, "place", d.image("b.png", same)))
		}, "repeats an image"},
		"source group across splits": {func(d *testDataset) {
			a := fixtureCase("a", Dev, "place", d.image("a.png", pngBytes(t, 1)))
			b := fixtureCase("b", HeldOut, "place", d.image("b.png", pngBytes(t, 2)))
			b["provenance"].(map[string]any)["sourceGroupId"] = "a"
			d.add(Dev, a).add(HeldOut, b)
		}, "source group a appears in both"},
		"missing split in manifest": {func(d *testDataset) {
			delete(d.manifest["splits"].(map[string]any), "held-out")
		}, "splits.held-out is required"},
		"unknown manifest field":      {func(d *testDataset) { d.manifest["owner"] = "x" }, "unknown field"},
		"unknown tier":                {func(d *testDataset) { d.manifest["tier"] = "gold" }, "tier"},
		"unsupported manifest schema": {func(d *testDataset) { d.manifest["schemaVersion"] = 2 }, "schemaVersion 2"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			d := newTestDataset(t)
			tc.build(d)
			_, err := d.write().load()
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("err = %v, want %q", err, tc.want)
			}
		})
	}
}

func TestLoadDatasetRejectsMissingSplitFile(t *testing.T) {
	d := newTestDataset(t)
	d.add(Dev, fixtureCase("a", Dev, "place", d.image("a.png", pngBytes(t, 1)))).write()
	if err := os.Remove(filepath.Join(d.root, "held-out.jsonl")); err != nil {
		t.Fatal(err)
	}
	if _, err := d.load(); err == nil || !strings.Contains(err.Error(), "held-out.jsonl") {
		t.Fatalf("err = %v", err)
	}
}

// 파일을 직접 고쳐야 만들 수 있는 오류.
func TestLoadDatasetRejectsBrokenFiles(t *testing.T) {
	cases := map[string]struct {
		mutate func(line []byte) []byte
		want   string
	}{
		"trailing json": {func(l []byte) []byte { return append(bytes.TrimSuffix(l, []byte("\n")), []byte(" {}\n")...) }, "trailing"},
		"invalid utf-8": {func(l []byte) []byte { return append(l, 0xff, '\n') }, "UTF-8"},
		"blank line":    {func(l []byte) []byte { return append(l, '\n') }, "blank"},
		"two on a line": {func(l []byte) []byte { return append(bytes.TrimSuffix(l, []byte("\n")), append([]byte(" "), l...)...) }, "trailing"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			d := newTestDataset(t)
			d.add(Dev, fixtureCase("a", Dev, "place", d.image("a.png", pngBytes(t, 1)))).write()
			line, err := os.ReadFile(filepath.Join(d.root, "dev.jsonl"))
			if err != nil {
				t.Fatal(err)
			}
			d.file("dev.jsonl", tc.mutate(line))
			if _, err := d.load(); err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("err = %v, want %q", err, tc.want)
			}
		})
	}
}

// 검토가 끝나지 않은 case는 읽히되 채점 자격이 없다. 무엇이 모자란지 Blockers가 말한다.
func TestEligibility(t *testing.T) {
	d := newTestDataset(t)
	privacy := fixtureCase("privacy-pending", Dev, "place", d.image("1.png", pngBytes(t, 1)))
	privacy["provenance"].(map[string]any)["privacyReview"] = "draft"
	annotation := fixtureCase("annotation-draft", Dev, "place", d.image("2.png", pngBytes(t, 2)))
	annotation["annotation"].(map[string]any)["review"] = "draft"
	ambiguous := fixtureCase("ambiguous", Dev, "place", d.image("3.png", pngBytes(t, 3)))
	ambiguous["annotation"].(map[string]any)["ambiguity"] = "high"
	agent := fixtureCase("agent-in-validation", Validation, "place", d.image("4.png", pngBytes(t, 4)))
	agent["annotation"].(map[string]any)["method"] = "agent-visual"
	agentDev := fixtureCase("agent-in-dev", Dev, "place", d.image("5.png", pngBytes(t, 5)))
	agentDev["annotation"].(map[string]any)["method"] = "agent-visual"
	ds, err := d.add(Dev, privacy).add(Dev, annotation).add(Dev, ambiguous).add(Validation, agent).add(Dev, agentDev).write().load()
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]string{
		"privacy-pending":     "privacy review is draft",
		"annotation-draft":    "annotation review is draft",
		"ambiguous":           "ambiguity is high",
		"agent-in-validation": "validation needs human review, has agent-visual",
		"agent-in-dev":        "",
	}
	for _, c := range ds.Cases {
		got := strings.Join(c.Blockers, "; ")
		if got != want[c.ID] || c.Eligible != (want[c.ID] == "") {
			t.Errorf("%s blockers = %q, want %q", c.ID, got, want[c.ID])
		}
	}
	if r := ds.Readiness.Splits[Dev]; r.Cases != 4 || r.Reviewed != 3 || r.Draft != 1 || r.Eligible != 1 {
		t.Errorf("dev readiness = %+v", r)
	}
}

func TestSelect(t *testing.T) {
	d := newTestDataset(t)
	// 파일 순서는 b, a — 선택은 id 순이어야 한다.
	d.add(Dev, fixtureCase("b", Dev, "place", d.image("b.png", pngBytes(t, 2))))
	d.add(Dev, fixtureCase("a", Dev, "place", d.image("a.png", pngBytes(t, 1))))
	draft := fixtureCase("c", Validation, "place", d.image("c.png", pngBytes(t, 3)))
	draft["annotation"].(map[string]any)["review"] = "draft"
	d.add(Validation, draft)
	d.add(HeldOut, fixtureCase("h", HeldOut, "place", d.image("h.png", pngBytes(t, 4))))
	ds, err := d.write().load()
	if err != nil {
		t.Fatal(err)
	}

	dev, err := ds.Select(Dev, SelectOptions{})
	if err != nil || len(dev.Cases) != 2 || dev.Cases[0].ID != "a" || dev.Cases[1].ID != "b" || len(dev.Hash) != 64 {
		t.Fatalf("dev = %+v, err = %v", dev, err)
	}
	again, _ := LoadDataset(d.root, contract)
	if sel, _ := again.Select(Dev, SelectOptions{}); sel.Hash != dev.Hash {
		t.Error("selection hash is not stable across loads")
	}

	if _, err := ds.Select(Validation, SelectOptions{}); err == nil || !strings.Contains(err.Error(), "c (annotation review is draft)") {
		t.Errorf("draft in a scored split: err = %v", err)
	} else if strings.Contains(err.Error(), "acceptableActions") {
		t.Error("error text carries case content")
	}
	if sel, err := ds.Select(Validation, SelectOptions{AllowDrafts: true}); err != nil || len(sel.Cases) != 1 {
		t.Errorf("allow drafts: %+v, %v", sel, err)
	}
	if _, err := ds.Select(HeldOut, SelectOptions{}); err == nil || !strings.Contains(err.Error(), "held-out is closed") {
		t.Errorf("held-out without the flag: err = %v", err)
	}
	if sel, err := ds.Select(HeldOut, SelectOptions{AllowHeldOut: true}); err != nil || len(sel.Cases) != 1 {
		t.Errorf("held-out with the flag: %+v, %v", sel, err)
	}
	if _, err := ds.Select("test", SelectOptions{}); err == nil {
		t.Error("unknown split selected")
	}

	// 한 case의 내용이 바뀌면 hash가 바뀐다.
	changed := fixtureCase("a", Dev, "place", imageRef("fixtures/a.png", "image/png", sha256Hex(pngBytes(t, 1))))
	changed["notes"] = "changed"
	d.lines[Dev][1] = changed
	d.manifest["splits"].(map[string]any)["dev"].(map[string]any)["cases"] = 2
	ds2, err := d.write().load()
	if err != nil {
		t.Fatal(err)
	}
	if sel, _ := ds2.Select(Dev, SelectOptions{}); sel.Hash == dev.Hash {
		t.Error("selection hash did not change with the content")
	}
}

func TestSelectRejectsEmptySplit(t *testing.T) {
	d := newTestDataset(t)
	d.add(Dev, fixtureCase("a", Dev, "place", d.image("a.png", pngBytes(t, 1))))
	ds, err := d.write().load()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := ds.Select(Validation, SelectOptions{AllowDrafts: true}); err == nil || !strings.Contains(err.Error(), "not a pass") {
		t.Fatalf("err = %v", err)
	}
}
