-- 처리 작업에 적용한 사진 유형과 처리 방식. 작업을 만들 때 읽은 사용자 처리 방식에서 서버가 고른다.
-- 화면이 지금 처리 방식을 다시 읽어 짐작하지 않도록 작업에 남긴다. 고르기 전 · 고르지 않은 작업은 둘 다 NULL이다.
-- 값 짝은 internal/processing outputFields · internal/preference와 같다.
-- processed outcome은 고른 유형 · 처리 방식과 같아야 하고, unsupported · ambiguous는 처리 방식을 고르지 않는다.

ALTER TABLE processing_jobs
    ADD COLUMN image_type text,
    ADD COLUMN applied_action text,
    ADD CONSTRAINT processing_jobs_selection_check CHECK (
        (image_type IS NULL AND applied_action IS NULL) OR coalesce((image_type, applied_action) IN (
            ('text', 'extract_and_translate'), ('text', 'extract_text'),
            ('text', 'summarize'), ('text', 'extract_and_summarize'),
            ('receipt', 'record_expense'), ('receipt', 'extract_text'), ('receipt', 'summarize')
        ), false)
    ),
    ADD CONSTRAINT processing_jobs_outcome_selection_check CHECK (
        outcome IS NULL OR coalesce(CASE outcome->>'kind'
            WHEN 'processed' THEN outcome->>'imageType' = image_type AND outcome->>'appliedAction' = applied_action
            ELSE image_type IS NULL
        END, false)
    );
