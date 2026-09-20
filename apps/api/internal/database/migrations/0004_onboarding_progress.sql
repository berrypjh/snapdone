-- 온보딩 진행을 서버가 가진다. mobile과 web 어디서든 같은 단계에서 이어 간다.
-- 단계는 intro → purpose → first-image → complete이다.
-- 목적은 first-image부터 있다. NULL은 아직 답하지 않음, 빈 배열은 건너뜀이다.

ALTER TABLE profiles DROP CONSTRAINT profiles_onboarding_step_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_onboarding_step_check
    CHECK (onboarding_step IN ('intro', 'purpose', 'first-image', 'complete'));

ALTER TABLE profiles ADD COLUMN onboarding_purposes text[];
ALTER TABLE profiles ADD CONSTRAINT profiles_onboarding_purposes_check
    CHECK (onboarding_step NOT IN ('intro', 'purpose') OR onboarding_purposes IS NULL);
