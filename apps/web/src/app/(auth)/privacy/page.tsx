import type { Metadata } from 'next';

import { CONTACT_EMAIL, EFFECTIVE_DATE, OPERATOR } from '@/components/legal/legal-copy';
import { LegalDocument, type LegalSection } from '@/components/legal/legal-document';

const TITLE = '개인정보처리방침';

export const metadata: Metadata = { title: TITLE };

const SECTIONS: LegalSection[] = [
  {
    heading: '1. 수집하는 정보',
    paragraphs: [
      `${OPERATOR}는 서비스 제공에 필요한 최소한의 정보만 처리합니다.`,
      'Google 계정 식별자: Google 로그인 시 Google이 알려 주는 계정 고유 번호만 받습니다. 이메일 · 이름 · 프로필 사진은 받지 않습니다.',
      '서비스 이용 정보: 처리 결과(사진에서 읽은 글, 영수증 항목 등)와 처리 일시, 처리 방식 설정, 시작 안내 진행 단계, 동의한 약관 · 방침의 버전을 저장합니다.',
      '사진 확인값: 같은 사진을 다시 처리하는지 확인하려고 사진 내용으로 계산한 고유값(SHA-256)을 저장합니다. 이 값으로 사진을 되살릴 수 없습니다.',
      '로그인 정보: 로그인 유지를 위해 세션의 만료 시각과 마지막 사용 시각을 저장합니다. 로그인 토큰은 원문이 아닌 변환한 값으로만 저장합니다.',
    ],
  },
  {
    heading: '2. 사진의 처리',
    paragraphs: [
      '올린 사진은 처리하는 동안에만 쓰고 저장하지 않습니다. 처리가 끝나면 결과만 남습니다.',
      '사진에 다른 사람의 개인정보(이름, 전화번호, 계좌번호 등)가 들어 있으면 처리 결과에도 남을 수 있습니다. 필요한 사진만 올려 주세요.',
    ],
  },
  {
    heading: '3. 이용 목적',
    paragraphs: [
      '로그인과 본인 확인, 사진 처리와 결과 제공, 처리 기록 보관, 설정 유지에만 이용합니다. 광고나 마케팅에는 이용하지 않습니다.',
    ],
  },
  {
    heading: '4. 처리 위탁과 국외 이전',
    paragraphs: [
      '서비스 운영을 위해 다음 업체에 처리를 맡깁니다.',
      'Anthropic, PBC(미국): 사진의 내용 분석. 처리를 요청할 때 사진이 네트워크로 전송되며, 해당 업체의 정책에 따라 처리됩니다.',
      'Google LLC: 로그인 인증(Google 로그인), 서버와 데이터베이스 운영(Google Cloud, 서울 리전).',
    ],
  },
  {
    heading: '5. 보관 기간과 파기',
    paragraphs: [
      '계정이 있는 동안 보관합니다. 처리 기록은 기록 화면에서 언제든 직접 삭제할 수 있습니다.',
      '탈퇴를 요청하면 계정과 그 계정의 처리 기록 · 설정 · 로그인 정보를 지체 없이 파기합니다.',
    ],
  },
  {
    heading: '6. 이용자의 권리',
    paragraphs: [
      `자신의 정보에 대한 열람 · 정정 · 삭제 · 처리 정지와 탈퇴를 요청할 수 있습니다. ${CONTACT_EMAIL}로 요청해 주세요.`,
    ],
  },
  {
    heading: '7. 쿠키와 브라우저 저장소',
    paragraphs: [
      '로그인 상태를 유지하려고 쿠키를 사용합니다. 화면 테마 선택은 이용자의 브라우저에만 저장합니다.',
    ],
  },
  {
    heading: '8. 개인정보 보호책임자',
    paragraphs: [`${OPERATOR} · ${CONTACT_EMAIL}`],
  },
  {
    heading: '9. 방침의 변경',
    paragraphs: ['이 방침을 바꾸면 시행일을 고쳐 이 페이지에 알립니다.'],
  },
];

/** 개인정보처리방침. 로그인 화면 · 앱의 `PRIVACY_URL`이 이 주소다. */
export default function PrivacyPage() {
  return <LegalDocument title={TITLE} effectiveDate={EFFECTIVE_DATE} sections={SECTIONS} />;
}
