package config

import (
	"net"
	"os"
)

type Config struct {
	Host        string
	Port        string
	Environment string
	DatabaseURL string

	Auth *Auth
}

// 환경 변수에서 설정을 읽고, 값이 없으면 로컬 개발 환경을 위한 기본값을 사용한다.
// 인증 설정이 일부만 있거나 잘못됐으면 오류를 반환한다.
func Load() (Config, error) {
	cfg := Config{
		Host:        env("API_HOST", "127.0.0.1"),
		Port:        env("API_PORT", "8080"),
		Environment: env("API_ENV", "development"),
		DatabaseURL: os.Getenv("DATABASE_URL"),
	}
	auth, err := loadAuth(cfg.Environment == "production")
	if err != nil {
		return Config{}, err
	}
	cfg.Auth = auth
	return cfg, nil
}

// HTTP 서버가 사용할 host:port 형식의 주소를 반환한다.
func (c Config) Addr() string {
	return net.JoinHostPort(c.Host, c.Port)
}

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
