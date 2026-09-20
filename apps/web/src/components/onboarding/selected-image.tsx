import Image from 'next/image';

/** 고른 사진. 브라우저 안의 blob 주소라 Next 이미지 최적화를 거치지 않는다. */
export function SelectedImage({ url }: { url: string }) {
  return (
    <div className="relative aspect-video overflow-hidden rounded-lg border border-stroke-light bg-background-grey">
      <Image src={url} alt="선택한 사진" fill unoptimized className="object-contain" />
    </div>
  );
}
