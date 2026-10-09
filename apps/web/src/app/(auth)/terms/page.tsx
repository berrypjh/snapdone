import type { Metadata } from 'next';

import { CONTACT_EMAIL, EFFECTIVE_DATE, OPERATOR } from '@/components/legal/legal-copy';
import { LegalDocument, type LegalSection } from '@/components/legal/legal-document';

const TITLE = '이용약관';

export const metadata: Metadata = { title: TITLE };

const SECTIONS: LegalSection[] = [
  {
    heading: '1. 목적',
    paragraphs: [
      `이 약관은 ${OPERATOR}가 제공하는 이미지 액션 라우터(이하 "서비스")의 이용 조건을 정합니다.`,
    ],
  },
  {
    heading: '2. 서비스 내용',
    paragraphs: [
      '서비스는 사진이나 스크린샷을 AI로 처리해 글을 정리하거나 영수증 항목을 정리하는 등, 이용자가 하려던 일을 돕습니다.',
    ],
  },
  {
    heading: '3. 이용 계약',
    paragraphs: [
      'Google 계정으로 로그인하면 이 약관과 개인정보처리방침에 동의한 것으로 봅니다.',
      '만 14세 미만은 서비스를 이용할 수 없습니다.',
    ],
  },
  {
    heading: '4. 처리 결과',
    paragraphs: [
      'AI가 만든 처리 결과에는 틀린 내용이 있을 수 있습니다. 금액 · 날짜처럼 중요한 정보는 원본과 직접 확인해 주세요.',
    ],
  },
  {
    heading: '5. 이용자의 의무',
    paragraphs: [
      '다른 사람의 권리를 침해하는 사진이나 법령에 어긋나는 내용을 올려서는 안 됩니다.',
      '서비스를 정상적인 방법 외로 이용하거나 운영을 방해해서는 안 됩니다.',
    ],
  },
  {
    heading: '6. 서비스의 변경과 중단',
    paragraphs: [
      '서비스는 개인 개발자가 운영합니다. 기능을 바꾸거나 서비스를 중단할 수 있으며, 가능한 한 미리 이 페이지나 서비스 화면으로 알립니다.',
    ],
  },
  {
    heading: '7. 책임의 제한',
    paragraphs: [
      '처리 결과를 그대로 믿고 생긴 손해에 대해서는 고의 또는 중대한 과실이 없는 한 책임지지 않습니다.',
    ],
  },
  {
    heading: '8. 탈퇴',
    paragraphs: [
      `탈퇴는 ${CONTACT_EMAIL}로 요청해 주세요. 탈퇴하면 계정과 처리 기록이 삭제되며 되돌릴 수 없습니다.`,
    ],
  },
  {
    heading: '9. 문의',
    paragraphs: [`${OPERATOR} · ${CONTACT_EMAIL}`],
  },
];

/** 이용약관. 로그인 화면 · 앱의 `TERMS_URL`이 이 주소다. */
export default function TermsPage() {
  return <LegalDocument title={TITLE} effectiveDate={EFFECTIVE_DATE} sections={SECTIONS} />;
}
