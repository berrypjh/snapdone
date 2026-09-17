-- 인증: 사용자, 로그인 수단, profile, 세션.
-- 토큰은 원문을 저장하지 않고 SHA-256 해시만 저장한다.

CREATE TABLE users (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 한 사용자의 로그인 수단. subject는 provider가 준 사용자 식별자 그대로다.
CREATE TABLE identities (
    provider   text NOT NULL CHECK (provider IN ('google', 'apple', 'naver', 'kakao')),
    subject    text NOT NULL,
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, subject)
);

CREATE INDEX identities_user_id_idx ON identities (user_id);

CREATE TABLE profiles (
    user_id         uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    onboarding_step text NOT NULL DEFAULT 'intro' CHECK (onboarding_step IN ('intro', 'complete')),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash bytea NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);
