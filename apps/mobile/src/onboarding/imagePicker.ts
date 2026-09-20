import {
  launchCameraAsync,
  launchImageLibraryAsync,
  requestCameraPermissionsAsync,
  UIImagePickerPreferredAssetRepresentationMode,
} from 'expo-image-picker';

import type { CaptureDeps } from './capture';

/**
 * 사진 한 장만 받는다. 영상 · base64 · EXIF(위치 정보가 들어갈 수 있음)는 받지 않는다.
 * iOS 사진 선택은 가장 호환되는 형식으로 받는다 — 처리 서버가 HEIC를 받지 않는다.
 */
const options = {
  mediaTypes: ['images' as const],
  base64: false,
  exif: false,
  preferredAssetRepresentationMode: UIImagePickerPreferredAssetRepresentationMode.Compatible,
};

/** 시스템 카메라 · 사진 선택기. 권한과 picker를 아는 곳은 여기뿐이다. */
export const systemImageCapture: CaptureDeps = {
  requestCameraPermission: requestCameraPermissionsAsync,
  launchCamera: () => launchCameraAsync(options),
  launchLibrary: () => launchImageLibraryAsync(options),
};
