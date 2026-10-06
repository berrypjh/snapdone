-- 처리 작업의 출처. onboarding은 온보딩을 마치기 전의 첫 사진, general은 온보딩을 마친 뒤의 사진이다.
-- 서버가 요청 세션의 온보딩 단계로 정하고 클라이언트는 고르지 않는다.
-- 지금까지는 온보딩 첫 사진 말고 사진을 올릴 곳이 없었으므로 기존 행은 onboarding이다.
-- DEFAULT는 기존 행을 채우는 데만 쓰고 지운다. 새 작업이 출처를 빠뜨리면 NOT NULL이 거절한다.

ALTER TABLE processing_jobs
    ADD COLUMN origin text NOT NULL DEFAULT 'onboarding'
        CONSTRAINT processing_jobs_origin_check CHECK (origin IN ('onboarding', 'general'));
ALTER TABLE processing_jobs ALTER COLUMN origin DROP DEFAULT;
