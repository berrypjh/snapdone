'use client';

import { ViewSwitch } from '@berrypjh/devhub-ui';
import type { ReactNode } from 'react';

import type { ArchitectureModel } from '@/lib/catalog/architecture-layout';

import { ArchitectureMap } from './architecture-map';
import { ArchitectureOutline } from './architecture-outline';

type ArchitectureViewsProps = {
  model: ArchitectureModel;
  kind?: string;
  query?: string;
  /** 종류 필터. 보기 전환 줄에 함께 놓인다. */
  filter?: ReactNode;
};

/** 아키텍처를 그림이나 목록으로. 같은 필터를 둘에 똑같이 적용한다. */
export function ArchitectureViews({ filter, ...props }: ArchitectureViewsProps) {
  return (
    <ViewSwitch
      label="아키텍처"
      tools={filter}
      canvas={<ArchitectureMap {...props} />}
      list={<ArchitectureOutline {...props} />}
    />
  );
}
