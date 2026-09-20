import { notFound } from 'next/navigation';

/** 이 layout 아래의 모든 URL에 두 슬롯이 걸린다. 복원할 수 없는 슬롯은 404다. */
export default function Default() {
  notFound();
}
