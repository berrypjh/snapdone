-- 사진 처리 작업. 사진은 저장하지 않고 상태와 결과만 남긴다.
-- running은 처리 중, completed는 result가 있는 완료, failed는 결과 없는 실패다.

CREATE TABLE processing_jobs (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    status      text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
    result      jsonb,
    created_at  timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,
    CHECK ((status = 'completed') = (result IS NOT NULL)),
    CHECK ((status = 'running') = (finished_at IS NULL))
);

CREATE INDEX processing_jobs_user_id_idx ON processing_jobs (user_id);
