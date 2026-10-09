import { Stack } from '@berrypjh/react-ui';

export type LegalSection = { heading: string; paragraphs: string[] };

type LegalDocumentProps = {
  title: string;
  /** 시행일(YYYY-MM-DD). Go `AUTH_TERMS_VERSION` · `AUTH_PRIVACY_VERSION`과 같은 값을 쓴다. */
  effectiveDate: string;
  sections: LegalSection[];
};

/** `2026-10-09` → `2026. 10. 9.` (제품 날짜 형식) */
const displayDate = (isoDate: string) => {
  const [year, month, day] = isoDate.split('-').map(Number);
  return `${year}. ${month}. ${day}.`;
};

/** 이용약관 · 개인정보처리방침 본문. 로그인 화면과 앱이 이 주소를 새 창 · 브라우저로 연다. */
export function LegalDocument({ title, effectiveDate, sections }: LegalDocumentProps) {
  return (
    <article>
      <Stack gap="xl">
        <header>
          <h1 className="typo-heading-h4">{title}</h1>
          <p className="mt-2 typo-caption-default text-text-light">
            시행일 <time dateTime={effectiveDate}>{displayDate(effectiveDate)}</time>
          </p>
        </header>
        {sections.map((section) => (
          <section key={section.heading}>
            <h2 className="typo-body-medium-strong">{section.heading}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="mt-2 typo-paragraph-default">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </Stack>
    </article>
  );
}
