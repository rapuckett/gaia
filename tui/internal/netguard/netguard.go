// Copyright(C) 2025-2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

// Package netguard is the one seam through which the TUI's own dialers pass, so
// a test binary can refuse connections to the developer's real services. It is
// inert in production: Check stays nil unless internal/testguard sets it.
package netguard

import (
	"context"
	"net"
)

// Check, when set, runs before every guarded dial; a non-nil error aborts it.
var Check func(network, addr string) error

// DialContext wraps d's dial with Check.
func DialContext(d *net.Dialer) func(ctx context.Context, network, addr string) (net.Conn, error) {
	return func(ctx context.Context, network, addr string) (net.Conn, error) {
		if Check != nil {
			if err := Check(network, addr); err != nil {
				return nil, err
			}
		}
		return d.DialContext(ctx, network, addr)
	}
}
