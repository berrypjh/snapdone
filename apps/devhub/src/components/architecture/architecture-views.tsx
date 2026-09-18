'use client';

import type { ReactNode } from 'react';

import type { ArchitectureModel } from '@/lib/architecture-layout';

import { ViewSwitch } from '../canvas/view-switch';

import { ArchitectureMap } from './architecture-map';
import { ArchitectureOutline } from './architecture-outline';

type ArchitectureViewsProps = {
  model: ArchitectureModel;
  kind?: string;
  query?: string;
  /** The kind filter, on the row of the view switch. */
  filter?: ReactNode;
};

/** The architecture as a drawing or as a list, with the same filter applied to both. */
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
