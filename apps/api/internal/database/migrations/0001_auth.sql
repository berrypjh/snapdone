-- 인증: 사용자, 로그인 수단, profile, 세션, OAuth 트랜잭션, 일회용 grant.
-- 토큰 · 코드 · state는 원문을 저장하지 않고 SHA-256 해시만 저장한다.

CREATE TABLE users (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 한 사용자의 로그인 수단. subject는 provider가 준 사용자 식별자 그대로다.
-- 이메일은 인증 근거가 아니고 계정 병합에도 쓰지 않으므로 저장하지 않는다.
CREATE TABLE identities (
    provider   text NOT NULL CHECK (provider IN ('google', 'apple', 'naver', 'kakao')),
    subject    text NOT NULL,
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, subject)
);

CREATE INDEX identities_user_id_idx ON identities (user_id);

-- terms_version · privacy_version은 가입 시 동의한 문서 버전이다.
CREATE TABLE profiles (
    user_id         uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    onboarding_step text NOT NULL DEFAULT 'intro' CHECK (onboarding_step IN ('intro', 'complete')),
    terms_version   text NOT NULL,
    privacy_version text NOT NULL,
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- root 세션(parent_id NULL)과 그 아래 child 세션. root를 취소하면 child도 무효다.
CREATE TABLE auth_sessions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind                text NOT NULL CHECK (kind IN ('mobile', 'web')),
    parent_id           uuid REFERENCES auth_sessions (id) ON DELETE CASCADE,
    token_hash          bytea NOT NULL UNIQUE,
    created_at          timestamptz NOT NULL DEFAULT now(),
    absolute_expires_at timestamptz NOT NULL,
    idle_expires_at     timestamptz NOT NULL,
    last_seen_at        timestamptz NOT NULL DEFAULT now(),
    revoked_at          timestamptz,
    CHECK (idle_expires_at <= absolute_expires_at)
);

CREATE INDEX auth_sessions_user_id_idx ON auth_sessions (user_id);
CREATE INDEX auth_sessions_parent_id_idx ON auth_sessions (parent_id);

-- OAuth 시작부터 provider 콜백까지의 상태. upstream verifier · nonce는 AES-GCM으로 암호화하고
-- 암호문을 만든 키를 key_id로 남긴다.
CREATE TABLE auth_transactions (
    state_hash        bytea PRIMARY KEY,
    purpose           text NOT NULL CHECK (purpose IN ('mobile_login', 'web_login')),
    provider          text NOT NULL CHECK (provider IN ('google', 'apple', 'naver', 'kakao')),
    client_challenge  text NOT NULL,
    upstream_verifier bytea,
    upstream_nonce    bytea,
    key_id            text,
    created_at        timestamptz NOT NULL DEFAULT now(),
    expires_at        timestamptz NOT NULL,
    consumed_at       timestamptz,
    CHECK (key_id IS NOT NULL OR (upstream_verifier IS NULL AND upstream_nonce IS NULL))
);

-- 로그인 콜백 · WebView 핸드오프가 발급하는 짧은 일회용 코드.
CREATE TABLE one_time_grants (
    code_hash         bytea PRIMARY KEY,
    purpose           text NOT NULL CHECK (purpose IN ('mobile_login', 'web_login', 'handoff')),
    user_id           uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    parent_session_id uuid REFERENCES auth_sessions (id) ON DELETE CASCADE,
    client_challenge  text,
    next              text,
    created_at        timestamptz NOT NULL DEFAULT now(),
    expires_at        timestamptz NOT NULL,
    consumed_at       timestamptz
);
