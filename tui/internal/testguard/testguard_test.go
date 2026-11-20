// Copyright(C) 2025-2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

package testguard

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRefusesRealLemonadeAndDaemon(t *testing.T) {
	t.Setenv(OptInEnv, "")
	realPorts[54321] = "the GAIA daemon" // stands in for the port in the real instance.json
	defer delete(realPorts, 54321)

	for _, addr := range []string{"localhost:13305", "127.0.0.1:13305", "[::1]:13305", "127.0.0.1:54321"} {
		err := Refusal("tcp", addr)
		if err == nil {
			t.Fatalf("dial to %s was allowed", addr)
		}
		if !strings.Contains(err.Error(), "TestRefusesRealLemonadeAndDaemon") || !strings.Contains(err.Error(), OptInEnv) {
			t.Errorf("refusal for %s does not name the test and the fix: %v", addr, err)
		}
	}
}

func TestDefaultTransportRefusesRealLemonade(t *testing.T) {
	t.Setenv(OptInEnv, "")
	var got error
	prev := onRefusal
	onRefusal = func(err error) { got = err }
	defer func() { onRefusal = prev }()
	if resp, err := http.Get("http://127.0.0.1:13305/api/v1/health"); err == nil {
		resp.Body.Close()
		t.Fatal("http.Get reached the real Lemonade port")
	}
	if got == nil || !strings.Contains(got.Error(), "TestDefaultTransportRefusesRealLemonade") {
		t.Fatalf("refusal missing or does not name the test: %v", got)
	}
}

func TestAllowsHTTPTestServerAndOptIn(t *testing.T) {
	t.Setenv(OptInEnv, "")
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {}))
	defer srv.Close()
	resp, err := http.Get(srv.URL)
	if err != nil {
		t.Fatalf("httptest server was refused: %v", err)
	}
	resp.Body.Close()

	t.Setenv(OptInEnv, "1")
	if err := Refusal("tcp", "127.0.0.1:13305"); err != nil {
		t.Errorf("opt-in did not allow the dial: %v", err)
	}
}

func TestEveryTestPackageImportsGuard(t *testing.T) {
	root := filepath.Join("..", "..")
	var missing []string
	for _, top := range []string{"internal", "test"} {
		_ = filepath.Walk(filepath.Join(root, top), func(path string, info os.FileInfo, err error) error {
			if err != nil || !info.IsDir() {
				return nil
			}
			tests, _ := filepath.Glob(filepath.Join(path, "*_test.go"))
			if len(tests) == 0 || filepath.Base(path) == "testguard" || filepath.Base(path) == "netguard" {
				return nil
			}
			if _, err := os.Stat(filepath.Join(path, "guard_test.go")); err != nil {
				missing = append(missing, path)
			}
			return nil
		})
	}
	if len(missing) > 0 {
		t.Fatalf("test packages without guard_test.go (copy one that blank-imports internal/testguard): %v", missing)
	}
}
