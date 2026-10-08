export const SELECT = '선택';
export const CANCEL = '취소';
export const selectedCount = (count: number) => `${count}개 선택됨`;
export const selectAll = (day: string) => `${day} 전체 선택`;
export const deleteSelected = (count: number) => `선택한 ${count}개 삭제`;
export const confirmDelete = (count: number) =>
  `선택한 ${count}개 기록을 삭제할까요? 삭제하면 되돌릴 수 없습니다.`;
export const DELETE_YES = '삭제';
export const deletedCount = (count: number) => `${count}개를 삭제했습니다.`;
export const DELETE_FAILED = '삭제하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.';
