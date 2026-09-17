package config

import (
	"encoding/base64"
	"errors"
	"fmt"
	"net/url"
	"os"
	"strings"
)

type Auth struct {
	PublicBaseURL     string
	WebOrigin         string
	MobileRedirectURI string
	EncryptionKey     []byte // 32바이트. 환경변수에는 base64로 둔다
	EncryptionKeyID   string
	TermsVersion      string
	PrivacyVersion    string
}

var authKeys = []string{
	"AUTH_PUBLIC_BASE_URL",
	"AUTH_WEB_ORIGIN",
	"AUTH_MOBILE_REDIRECT_URI",
	"AUTH_ENCRYPTION_KEY",
	"AUTH_ENCRYPTION_KEY_ID",
	"AUTH_TERMS_VERSION",
	"AUTH_PRIVACY_VERSION",
}

func loadAuth(production bool) (*Auth, error) {
	values := map[string]string{}
	var missing []string
	for _, key := range authKeys {
		values[key] = os.Getenv(key)
		if values[key] == "" {
			missing = append(missing, key)
		}
	}
	if len(missing) == len(authKeys) {
		return nil, nil
	}
	if len(missing) > 0 {
		return nil, fmt.Errorf("auth config is partial; missing %s", strings.Join(missing, ", "))
	}

	key, err := base64.StdEncoding.DecodeString(values["AUTH_ENCRYPTION_KEY"])
	if err != nil || len(key) != 32 {
		return nil, errors.New("AUTH_ENCRYPTION_KEY must be base64 of 32 bytes")
	}
	auth := &Auth{
		PublicBaseURL:     values["AUTH_PUBLIC_BASE_URL"],
		WebOrigin:         values["AUTH_WEB_ORIGIN"],
		MobileRedirectURI: values["AUTH_MOBILE_REDIRECT_URI"],
		EncryptionKey:     key,
		EncryptionKeyID:   values["AUTH_ENCRYPTION_KEY_ID"],
		TermsVersion:      values["AUTH_TERMS_VERSION"],
		PrivacyVersion:    values["AUTH_PRIVACY_VERSION"],
	}
	return auth, auth.validateURLs(production)
}

func (a *Auth) validateURLs(production bool) error {
	if err := checkURL("AUTH_PUBLIC_BASE_URL", a.PublicBaseURL, production, false); err != nil {
		return err
	}
	if err := checkURL("AUTH_WEB_ORIGIN", a.WebOrigin, production, true); err != nil {
		return err
	}
	u, err := url.Parse(a.MobileRedirectURI)
	if err != nil || u.Scheme == "" || u.Fragment != "" || u.RawQuery != "" {
		return errors.New("AUTH_MOBILE_REDIRECT_URI must be an absolute URI without query or fragment")
	}
	return nil
}

// http(s) 절대 URL인지 본다. production은 https만, originOnly면 경로도 허용하지 않는다.
func checkURL(key, raw string, production, originOnly bool) error {
	u, err := url.Parse(raw)
	valid := err == nil && u.Host != "" && u.User == nil && u.RawQuery == "" && u.Fragment == "" &&
		(u.Scheme == "https" || (u.Scheme == "http" && !production)) &&
		(!originOnly || u.Path == "")
	if !valid {
		if originOnly {
			return fmt.Errorf("%s must be a scheme://host[:port] origin (https in production)", key)
		}
		return fmt.Errorf("%s must be an absolute URL without query or fragment (https in production)", key)
	}
	return nil
}
