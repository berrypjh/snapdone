package auth

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
)

// 암호문의 key_id가 현재 키와 다르거나, 암호문 · AAD가 맞지 않는다.
var ErrDecrypt = errors.New("auth: decrypt failed")

// 32바이트 CSPRNG opaque 토큰(base64url)과 저장용 해시를 만든다.
func NewToken() (token string, hash []byte) {
	raw := make([]byte, 32)
	rand.Read(raw) // Go 1.24+: 실패하면 반환하지 않고 프로세스를 멈춘다
	token = base64.RawURLEncoding.EncodeToString(raw)
	return token, HashToken(token)
}

// 토큰 · 코드 · state 원문의 SHA-256 해시. 저장소는 이 값만 받는다.
func HashToken(token string) []byte {
	sum := sha256.Sum256([]byte(token))
	return sum[:]
}

// AES-256-GCM. 암호문 앞에 임의 nonce가 붙는다.
type Cipher struct {
	keyID string
	aead  cipher.AEAD
}

func NewCipher(keyID string, key []byte) (*Cipher, error) {
	if keyID == "" || len(key) != 32 {
		return nil, fmt.Errorf("auth: cipher needs a key id and a 32-byte key")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCMWithRandomNonce(block)
	if err != nil {
		return nil, err
	}
	return &Cipher{keyID: keyID, aead: aead}, nil
}

func (c *Cipher) KeyID() string { return c.keyID }

// plaintext를 암호화한다. aad는 이 값을 소유한 행의 식별자다.
func (c *Cipher) Seal(plaintext, aad []byte) []byte {
	return c.aead.Seal(nil, nil, plaintext, aad)
}

// keyID는 암호문과 함께 저장된 값이다. 현재 키가 아니면 ErrDecrypt를 반환한다.
func (c *Cipher) Open(keyID string, sealed, aad []byte) ([]byte, error) {
	if keyID != c.keyID {
		return nil, ErrDecrypt
	}
	plaintext, err := c.aead.Open(nil, nil, sealed, aad)
	if err != nil {
		return nil, ErrDecrypt
	}
	return plaintext, nil
}

// PKCE S256 challenge: base64url(SHA-256(verifier)).
func ChallengeS256(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}
