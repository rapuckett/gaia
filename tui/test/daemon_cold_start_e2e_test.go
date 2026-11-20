package test

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/amd/gaia/tui/internal/daemon"
)

// The TUI used to hold the start lock while `gaia daemon start` ran, and that
// command waits on the same lock — so every cold start timed out. Only the real
// Python launcher takes the lock, so this runs it against this checkout's src/.
//
// Set GAIA_E2E_PYTHON to an interpreter with GAIA's dependencies; otherwise
// python3 on PATH is tried, and the test skips when it cannot import the daemon.
func TestColdStartThroughTheRealGaiaDaemonStart(t *testing.T) {
	if testing.Short() {
		t.Skip("spawns a real daemon")
	}
	python := os.Getenv("GAIA_E2E_PYTHON")
	if python == "" {
		p, err := exec.LookPath("python3")
		if err != nil {
			t.Skip("no python3 on PATH and GAIA_E2E_PYTHON is unset")
		}
		python = p
	}
	src, err := filepath.Abs(filepath.Join("..", "..", "src"))
	if err != nil {
		t.Fatal(err)
	}
	env := isolatedDaemonEnv(t, src)

	probe := exec.Command(python, "-c", "import gaia.cli, gaia.daemon.server")
	probe.Env = env
	if out, err := probe.CombinedOutput(); err != nil {
		t.Skipf("%s cannot import the GAIA daemon from %s: %v\n%s", python, src, err, out)
	}

	gaia := func(ctx context.Context, args ...string) *exec.Cmd {
		return daemonCommand(ctx, python, env, args...)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if out, err := gaia(ctx, "stop").CombinedOutput(); err != nil {
			t.Errorf("gaia daemon stop: %v\n%s", err, out)
		}
	})

	client := daemon.New(daemon.Options{
		StartCommand: func(ctx context.Context) (*exec.Cmd, error) { return gaia(ctx, "start"), nil },
		Logf:         t.Logf,
	})

	// Two callers at once must both succeed and land on the same daemon.
	const callers = 2
	var wg sync.WaitGroup
	insts := make([]*daemon.Instance, callers)
	errs := make([]error, callers)
	for i := range callers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			insts[i], errs[i] = client.StartOrAttach(context.Background())
		}()
	}
	wg.Wait()

	for i, err := range errs {
		if err != nil {
			t.Fatalf("caller %d could not cold-start the daemon: %v", i, err)
		}
	}
	if insts[0].PID != insts[1].PID {
		t.Errorf("concurrent callers started two daemons: pid %d and pid %d", insts[0].PID, insts[1].PID)
	}
}

// isolatedDaemonEnv moves the whole GAIA home, not just the daemon's files: a
// daemon with only GAIA_DAEMON_HOME moved still runs the user's Lemonade, log
// and stores, and its `gaia daemon stop` stops the user's Lemonade.
func isolatedDaemonEnv(t *testing.T, src string) []string {
	t.Helper()
	root := t.TempDir()
	gaiaHome := filepath.Join(root, ".gaia")
	isolated := map[string]string{
		"HOME":              root,
		"GAIA_HOME":         gaiaHome,
		daemon.EnvHome:      filepath.Join(gaiaHome, "host"),
		"GAIA_LOG_FILE":     filepath.Join(gaiaHome, "gaia.log"),
		"LEMONADE_BASE_URL": "http://127.0.0.1:9",
	}
	env := append(os.Environ(), "PYTHONPATH="+src)
	for k, v := range isolated {
		t.Setenv(k, v)
		env = append(env, k+"="+v)
	}
	return env
}

func daemonCommand(ctx context.Context, python string, env []string, args ...string) *exec.Cmd {
	cmd := exec.CommandContext(ctx, python, append([]string{"-m", "gaia.cli", "daemon"}, args...)...)
	cmd.Env = env
	return cmd
}

// lastEnv is what a child process sees: exec keeps the last value of a repeated key.
func lastEnv(env []string, key string) string {
	val := ""
	for _, kv := range env {
		if k, v, ok := strings.Cut(kv, "="); ok && k == key {
			val = v
		}
	}
	return val
}

// The e2e above is never run to prove its own isolation; this checks, without
// spawning anything, that its start and stop commands see only a temp home.
func TestColdStartDaemonCommandsUseATempHome(t *testing.T) {
	realHome, err := os.UserHomeDir()
	if err != nil {
		t.Fatal(err)
	}
	env := isolatedDaemonEnv(t, "/src")
	for _, args := range [][]string{{"start"}, {"stop"}} {
		cmd := daemonCommand(context.Background(), "python3", env, args...)
		home, gaiaHome := lastEnv(cmd.Env, "HOME"), lastEnv(cmd.Env, "GAIA_HOME")
		if home == "" || home == realHome || !strings.HasPrefix(gaiaHome, home+string(filepath.Separator)) {
			t.Fatalf("daemon %s gets HOME=%q GAIA_HOME=%q; want both in one temp dir, not %q", args[0], home, gaiaHome, realHome)
		}
		for _, key := range []string{daemon.EnvHome, "GAIA_LOG_FILE"} {
			if v := lastEnv(cmd.Env, key); !strings.HasPrefix(v, gaiaHome+string(filepath.Separator)) {
				t.Errorf("daemon %s gets %s=%q, outside its GAIA_HOME %q", args[0], key, v, gaiaHome)
			}
		}
		if v := lastEnv(cmd.Env, "LEMONADE_BASE_URL"); v != "http://127.0.0.1:9" {
			t.Errorf("daemon %s gets LEMONADE_BASE_URL=%q; it must not reach a real Lemonade", args[0], v)
		}
	}
}
