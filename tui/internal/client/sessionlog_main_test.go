// Copyright(C) 2025-2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

package client

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/amd/gaia/tui/internal/control"
	"github.com/amd/gaia/tui/internal/daemon"
)

// TestMain points the session log and the GAIA and daemon homes at a temp dir,
// and stops Lemonade detection probing a real port: a test run must not read or
// write the developer's own ~/.gaia, or behave differently on a machine without one.
func TestMain(m *testing.M) {
	dir, err := os.MkdirTemp("", "gaia-tui-log-")
	if err != nil {
		panic(err)
	}
	os.Setenv(control.EnvHome, dir)
	os.Setenv("GAIA_HOME", dir)
	os.Setenv(daemon.EnvHome, filepath.Join(dir, "daemon"))
	subprocessLemonadePorts = nil
	code := m.Run()
	control.CloseLog()
	os.RemoveAll(dir)
	os.Exit(code)
}
