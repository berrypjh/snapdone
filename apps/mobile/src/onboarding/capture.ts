import type { ImagePickerResult, PermissionResponse } from 'expo-image-picker';

/** 다음 단계로 넘기는 사진. 기기 안의 파일 주소만 갖고, 원본 데이터 · 메타데이터는 옮기지 않는다. */
export type SelectedImage = { uri: string };

export type CaptureSource = 'camera' | 'library';

export type CaptureResult =
  | { type: 'selected'; image: SelectedImage }
  | { type: 'cancelled' }
  | { type: 'camera-denied'; canAskAgain: boolean }
  | { type: 'failed'; source: CaptureSource };

export type CaptureDeps = {
  requestCameraPermission: () => Promise<Pick<PermissionResponse, 'granted' | 'canAskAgain'>>;
  launchCamera: () => Promise<ImagePickerResult>;
  launchLibrary: () => Promise<ImagePickerResult>;
};

/** picker 결과를 앱이 쓰는 모양으로 좁힌다. 취소는 오류가 아니다. */
export const toCaptureResult = (
  result: ImagePickerResult,
  source: CaptureSource,
): CaptureResult => {
  if (result.canceled) return { type: 'cancelled' };
  const uri = result.assets[0]?.uri;
  return uri ? { type: 'selected', image: { uri } } : { type: 'failed', source };
};

const launch = async (deps: CaptureDeps, source: CaptureSource): Promise<CaptureResult> => {
  if (source === 'camera') {
    const { granted, canAskAgain } = await deps.requestCameraPermission();
    if (!granted) return { type: 'camera-denied', canAskAgain };
  }
  const result = await (source === 'camera' ? deps.launchCamera() : deps.launchLibrary());
  return toCaptureResult(result, source);
};

/**
 * 촬영 · 선택을 한 번에 하나만 연다. 열려 있는 동안 다시 부르면 `null`을 돌려주고 아무것도 열지 않는다.
 * 카메라 권한은 이때만 요청한다. 사진 선택은 시스템 선택기라 권한을 묻지 않는다.
 */
export const createImageCapture = (deps: CaptureDeps) => {
  let pending = false;

  return async (source: CaptureSource): Promise<CaptureResult | null> => {
    if (pending) return null;
    pending = true;
    try {
      return await launch(deps, source);
    } catch {
      return { type: 'failed', source };
    } finally {
      pending = false;
    }
  };
};
