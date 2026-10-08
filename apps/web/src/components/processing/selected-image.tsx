import Image from 'next/image';

/**
 * 고른 사진. 브라우저 안의 blob 주소라 Next 이미지 최적화를 거치지 않는다.
 * 결과 화면에서는 결과가 주인공이라 낮은 칸(`compact`)으로 줄여 보인다.
 */
export function SelectedImage({ url, compact = false }: { url: string; compact?: boolean }) {
  const frame = compact ? 'h-40 bg-background-default' : 'aspect-video bg-background-grey';
  return (
    <div className={`relative overflow-hidden rounded-lg border border-stroke-light ${frame}`}>
      <Image src={url} alt="선택한 사진" fill unoptimized className="object-contain" />
    </div>
  );
}
