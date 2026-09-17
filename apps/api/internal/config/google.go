package config

import (
	"errors"
	"os"
)

// Google OAuth Web application 클라이언트. secret은 프로세스 환경변수(Secret Manager 주입)로만 받는다.
type Google struct {
	ClientID     string
	ClientSecret string
}

// 둘 다 비면 Google 로그인 비활성(nil). 하나만 있거나 인증 기반 없이 있으면 오류다.
func loadGoogle(auth *Auth) (*Google, error) {
	id, secret := os.Getenv("GOOGLE_CLIENT_ID"), os.Getenv("GOOGLE_CLIENT_SECRET")
	if id == "" && secret == "" {
		return nil, nil
	}
	if id == "" || secret == "" {
		return nil, errors.New("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together")
	}
	if auth == nil {
		return nil, errors.New("GOOGLE_* requires the AUTH_* settings")
	}
	return &Google{ClientID: id, ClientSecret: secret}, nil
}
