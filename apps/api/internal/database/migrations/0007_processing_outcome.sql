-- 처리 작업의 제품 결과와 재처리 관계. 사진은 여전히 저장하지 않는다.
-- outcome은 사진 유형 · 적용한 처리 방식 · 그 결과다(internal/processing Outcome). 분류 결과(result)와 따로 둔다.
-- 이 migration 전의 작업은 outcome이 없다(NULL) — 기본값으로 채우지 않는다.
-- outcome은 끝난 작업에만 있다. ambiguous도 끝난 작업이라 stale running 규칙에 걸리지 않는다.
-- image_sha256은 사진 내용의 SHA-256(hex)이다. 사진을 되살릴 수 없고, 재처리가 같은 사진인지 보는 데만 쓴다.
-- source_job_id는 재처리의 원래 작업이다. 같은 사용자의 작업만 가리키고, 원래 작업이 사라지면 NULL이 된다.

ALTER TABLE processing_jobs
    ADD COLUMN outcome jsonb,
    ADD COLUMN image_sha256 text
        CONSTRAINT processing_jobs_image_sha256_check CHECK (image_sha256 ~ '^[0-9a-f]{64}$'),
    ADD COLUMN source_job_id uuid;

-- 재처리가 다른 사용자의 작업을 가리키지 못하게 (id, user_id)로 참조한다.
ALTER TABLE processing_jobs ADD CONSTRAINT processing_jobs_id_user_id_key UNIQUE (id, user_id);

ALTER TABLE processing_jobs
    ADD CONSTRAINT processing_jobs_source_job_fkey FOREIGN KEY (source_job_id, user_id)
        REFERENCES processing_jobs (id, user_id) ON DELETE SET NULL (source_job_id),
    ADD CONSTRAINT processing_jobs_source_job_check
        CHECK (source_job_id IS NULL OR (source_job_id <> id AND image_sha256 IS NOT NULL)),
    -- 값이 빠진 outcome(NULL 비교)도 통과하지 못하게 coalesce로 거짓을 만든다.
    ADD CONSTRAINT processing_jobs_outcome_check CHECK (
        outcome IS NULL OR coalesce(status = 'completed' AND (
            outcome->>'kind' IN ('unsupported', 'ambiguous') OR
            (outcome->>'kind' = 'processed' AND (outcome->>'imageType', outcome->>'appliedAction') IN (
                ('text', 'extract_and_translate'), ('text', 'extract_text'),
                ('text', 'summarize'), ('text', 'extract_and_summarize'),
                ('receipt', 'record_expense'), ('receipt', 'extract_text'), ('receipt', 'summarize')
            ))
        ), false)
    );

CREATE INDEX processing_jobs_source_job_id_idx ON processing_jobs (source_job_id);
