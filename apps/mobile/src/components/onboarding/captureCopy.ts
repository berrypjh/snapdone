import type { CaptureResult } from '../../onboarding/capture';

export type CaptureNotice = { message: string; openSettings: boolean };

/** 촬영 · 선택 결과를 사용자에게 보일 안내로 바꾼다. 고르거나 취소했으면 안내가 없다. */
export const captureNotice = (result: CaptureResult): CaptureNotice | null => {
  switch (result.type) {
    case 'selected':
    case 'cancelled':
      return null;
    case 'camera-denied':
      return result.canAskAgain
        ? {
            message: '카메라를 쓰려면 권한을 허용해 주세요. 사진에서 선택할 수도 있습니다.',
            openSettings: false,
          }
        : {
            message: '카메라 권한이 꺼져 있습니다. 설정에서 허용하거나 사진에서 선택해 주세요.',
            openSettings: true,
          };
    case 'failed':
      return {
        message:
          result.source === 'camera'
            ? '카메라를 열지 못했습니다. 사진에서 선택해 주세요.'
            : '사진을 불러오지 못했습니다. 다시 시도해 주세요.',
        openSettings: false,
      };
  }
};
