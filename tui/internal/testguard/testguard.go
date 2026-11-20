// Copyright(C) 2025-2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

// Package testguard stops TUI tests from reaching the developer's real GAIA
// daemon or real Lemonade. Every package with tests blank-imports it from a
// guard_test.go; TestEveryTestPackageImportsGuard keeps new packages honest.
// It imports nothing from this module so in-package tests can use it freely.
package testguard

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"

	"github.com/amd/gaia/tui/internal/netguard"
)

// OptInEnv lets a test that truly needs the real services run.
const OptInEnv = "GAIA_TEST_REAL_SERVICES"

const lemonadeDefaultPort = 13305

// realPorts maps each fixed real-service port to what it is.
var realPorts = map[int]string{lemonadeDefaultPort: "Lemonade"}

func init() {
	// Read before any TestMain repoints GAIA_HOME at a temp dir.
	if home, err := os.UserHomeDir(); err == nil {
		gaia := filepath.Join(home, ".gaia")
		if env := strings.TrimSpace(os.Getenv("GAIA_HOME")); env != "" {
			gaia = os.ExpandEnv(env)
		}
		addPort(filepath.Join(gaia, "host", "instance.json"), "GAIA daemon")
		addPort(filepath.Join(gaia, "lemonade", "state.json"), "GAIA's embedded Lemonade")
		if gaia != filepath.Join(home, ".gaia") {
			addPort(filepath.Join(home, ".gaia", "host", "instance.json"), "GAIA daemon")
			addPort(filepath.Join(home, ".gaia", "lemonade", "state.json"), "GAIA's embedded Lemonade")
		}
	}
	install()
}

func addPort(path, what string) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return
	}
	var rec struct {
		Port int `json:"port"`
	}
	if json.Unmarshal(raw, &rec) == nil && rec.Port > 0 && rec.Port <= 65535 {
		realPorts[rec.Port] = what
	}
}

// onRefusal panics by default: transport goroutines dial off the test's own
// stack, and a panic cannot be swallowed by the caller's error handling.
var onRefusal = func(err error) { panic(err.Error()) }

func install() {
	netguard.Check = func(network, addr string) error {
		if err := Refusal(network, addr); err != nil {
			onRefusal(err)
			return err
		}
		return nil
	}
	if t, ok := http.DefaultTransport.(*http.Transport); ok {
		t.DialContext = netguard.DialContext(&net.Dialer{})
	}
}

// Refusal returns the error for a dial to a real service, or nil to allow it.
func Refusal(network, addr string) error {
	if os.Getenv(OptInEnv) == "1" || !strings.HasPrefix(network, "tcp") {
		return nil
	}
	host, portStr, err := net.SplitHostPort(addr)
	if err != nil {
		return nil
	}
	port, err := strconv.Atoi(portStr)
	if err != nil {
		return nil
	}
	what, real := realPorts[port]
	if !real || !isLocal(host) {
		return nil
	}
	return fmt.Errorf("%s dialed the real %s at %s. Use an httptest server or a stub "+
		"(lemonade.StubDaemonTargetForTest, daemon.StubDefaultStartForTest, "+
		"lemonade.StubEnsureEmbeddedForTest, setupapitest) and point GAIA_HOME and %s at a temp dir. "+
		"A test that truly needs the real service runs with %s=1",
		testName(), what, addr, "GAIA_DAEMON_HOME", OptInEnv)
}

func isLocal(host string) bool {
	switch strings.ToLower(host) {
	case "localhost", "127.0.0.1", "::1", "0.0.0.0", "":
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

// testName names the Test functions running in this binary, found on every
// goroutine's stack (a transport dials off the test's own goroutine).
func testName() string {
	buf := make([]byte, 1<<20)
	buf = buf[:runtime.Stack(buf, true)]
	seen := map[string]bool{}
	var names []string
	for _, m := range testFrame.FindAllSubmatch(buf, -1) {
		if n := string(m[1]); !seen[n] {
			seen[n] = true
			names = append(names, n)
		}
	}
	switch len(names) {
	case 0:
		return "A test in " + filepath.Base(os.Args[0])
	case 1:
		return names[0]
	}
	return "One of " + strings.Join(names, ", ")
}

var testFrame = regexp.MustCompile(`(?m)^[\w./-]+\.(Test\w+)\(`)
