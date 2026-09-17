-- 앱이 만든 OAuth state. 앱 복귀 URI에 그대로 돌려주고 exchange에서 다시 확인한다.
-- 비밀 값이 아니라 요청을 묶는 값이므로 원문으로 둔다.

ALTER TABLE auth_transactions ADD COLUMN client_state text NOT NULL;
CREATE UNIQUE INDEX auth_transactions_client_state_idx ON auth_transactions (client_state);

ALTER TABLE one_time_grants ADD COLUMN client_state text;
