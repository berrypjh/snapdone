// Package config loads API server settings from the environment.
package config

import (
	"net"
	"os"
)

// Config holds the runtime settings of the API server.
type Config struct {
	Host        string
	Port        string
	Environment string
}

// Load reads settings from environment variables, falling back to local
// development defaults when a variable is unset or empty.
func Load() Config {
	return Config{
		Host:        env("API_HOST", "127.0.0.1"),
		Port:        env("API_PORT", "8080"),
		Environment: env("API_ENV", "development"),
	}
}

// Addr returns the address the HTTP server listens on.
func (c Config) Addr() string {
	return net.JoinHostPort(c.Host, c.Port)
}

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
