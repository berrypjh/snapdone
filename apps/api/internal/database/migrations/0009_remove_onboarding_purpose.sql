-- 온보딩의 사용 목적 단계를 없앤다. 고른 목적은 어디에서도 쓰지 않았다.
-- 단계는 intro → first-image → complete이다. 목적 단계에 있던 사용자는 첫 사진 단계에서 이어 간다.

UPDATE profiles SET onboarding_step = 'first-image' WHERE onboarding_step = 'purpose';

ALTER TABLE profiles DROP CONSTRAINT profiles_onboarding_purposes_check;
ALTER TABLE profiles DROP COLUMN onboarding_purposes;

ALTER TABLE profiles DROP CONSTRAINT profiles_onboarding_step_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_onboarding_step_check
    CHECK (onboarding_step IN ('intro', 'first-image', 'complete'));
