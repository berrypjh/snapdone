/** 스타일시트가 애니메이션하는 속성. URL 조각이 가리키는 요소에 붙인다. */
export const FLASH_ATTRIBUTE = 'data-anchor-flash';

type Marked = {
  removeAttribute: (name: string) => void;
  setAttribute: (name: string, value: string) => void;
  /** 두 호출 사이에서 읽는다. 여기서 강제되는 레이아웃 계산이 애니메이션을 다시 재생시킨다. */
  offsetWidth?: number;
};

type Lookup = { getElementById: (id: string) => Marked | null };

const decode = (id: string) => {
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
};

/**
 * URL 조각이 가리키는 요소를 표시하고 돌려준다(없으면 null). CSS `:target`만으로는 안 된다.
 * 라우터는 `pushState`로 움직이고 브라우저는 실제 조각 이동에만 대상을 다시 계산해서,
 * 앱 안에서 따라간 링크는 제목이 표시되지 않은 채로 남는다.
 */
export const markAnchor = (lookup: Lookup, hash: string): Marked | null => {
  const id = decode(hash.replace(/^#/, ''));
  const element = id ? lookup.getElementById(id) : null;
  if (!element) return null;

  element.removeAttribute(FLASH_ATTRIBUTE);
  void element.offsetWidth;
  element.setAttribute(FLASH_ATTRIBUTE, '');
  return element;
};
