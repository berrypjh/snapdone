-- 이미지 유형별 처리 방식. 고른 적이 없는 사용자(기존 사용자 포함)도 기본값을 가진다.
-- 값 목록은 internal/preference와 같다. 텍스트 · 외국어와 영수증은 고를 수 있는 값이 다르다.

ALTER TABLE profiles
    ADD COLUMN processing_text_action text NOT NULL DEFAULT 'extract_and_translate'
        CONSTRAINT profiles_processing_text_action_check
        CHECK (processing_text_action IN ('extract_and_translate', 'extract_text', 'summarize', 'extract_and_summarize')),
    ADD COLUMN processing_receipt_action text NOT NULL DEFAULT 'record_expense'
        CONSTRAINT profiles_processing_receipt_action_check
        CHECK (processing_receipt_action IN ('record_expense', 'extract_text', 'summarize'));
