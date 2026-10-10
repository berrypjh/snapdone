import { File } from 'expo-file-system';

/**
 * 사진 파일을 multipart `image` 필드에 담는다. 형식은 서버가 내용으로 판별한다.
 * Expo SDK의 전역 fetch는 RN식 `{ uri, name, type }` 항목을 받지 않아 파일 객체(`bytes()`)로 넘긴다.
 */
export const photoForm = (uri: string): FormData => {
  const form = new FormData();
  form.append('image', new File(uri));
  return form;
};
