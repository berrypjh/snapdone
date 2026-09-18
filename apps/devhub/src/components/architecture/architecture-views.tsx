'use client';

import type { ArchitectureModel } from '@/lib/architecture-layout';

import { ViewSwitch } from '../canvas/view-switch';

import { ArchitectureMap } from './architecture-map';
import { ArchitectureOutline } from './architecture-outline';

type ArchitectureViewsProps = { model: ArchitectureModel; kind?: string; query?: string };

/** The architecture as a drawing or as a list, with the same filter applied to both. */
export function ArchitectureViews(props: ArchitectureViewsProps) {
  return (
    <ViewSwitch
      label="아키텍처"
      canvas={<ArchitectureMap {...props} />}
      list={<ArchitectureOutline {...props} />}
    />
  );
}
