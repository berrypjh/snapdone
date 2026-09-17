package auth

import (
	"bytes"
	"encoding/base64"
	"errors"
	"testing"
)

func TestNewTokenIsRandom32BytesWithMatchingHash(t *testing.T) {
	token, hash := NewToken()
	other, _ := NewToken()

	raw, err := base64.RawURLEncoding.DecodeString(token)
	if err != nil || len(raw) != 32 {
		t.Fatalf("token decodes to %d bytes (err %v), want 32", len(raw), err)
	}
	if token == other {
		t.Error("two tokens are equal")
	}
	if !bytes.Equal(hash, HashToken(token)) || len(hash) != 32 {
		t.Error("hash does not match HashToken(token)")
	}
}

func newTestCipher(t *testing.T, keyID string, fill byte) *Cipher {
	t.Helper()
	c, err := NewCipher(keyID, bytes.Repeat([]byte{fill}, 32))
	if err != nil {
		t.Fatal(err)
	}
	return c
}

func TestCipherRoundTrip(t *testing.T) {
	c := newTestCipher(t, "k1", 1)
	sealed := c.Seal([]byte("verifier"), []byte("row-1"))

	got, err := c.Open("k1", sealed, []byte("row-1"))
	if err != nil || string(got) != "verifier" {
		t.Fatalf("Open = %q, %v", got, err)
	}
	if bytes.Equal(sealed, c.Seal([]byte("verifier"), []byte("row-1"))) {
		t.Error("sealing twice gave identical ciphertext; nonce is not random")
	}
}

func TestCipherRejectsWrongAADKeyIDOrKey(t *testing.T) {
	c := newTestCipher(t, "k1", 1)
	sealed := c.Seal([]byte("verifier"), []byte("row-1"))

	cases := map[string]func() error{
		"aad":    func() error { _, err := c.Open("k1", sealed, []byte("row-2")); return err },
		"key id": func() error { _, err := c.Open("k2", sealed, []byte("row-1")); return err },
		"key":    func() error { _, err := newTestCipher(t, "k1", 2).Open("k1", sealed, []byte("row-1")); return err },
	}
	for name, open := range cases {
		if err := open(); !errors.Is(err, ErrDecrypt) {
			t.Errorf("%s mismatch: err = %v, want ErrDecrypt", name, err)
		}
	}
}

func TestNewCipherRejectsShortKey(t *testing.T) {
	if _, err := NewCipher("k1", make([]byte, 16)); err == nil {
		t.Error("16-byte key accepted")
	}
}
