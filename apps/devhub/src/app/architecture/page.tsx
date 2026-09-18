import { ArchitectureHeader } from '@/components/architecture/architecture-header';

/**
 * The architecture workspace header. It is the page segment so that after a navigation Next
 * scrolls to and focuses the top of the workspace, not the inspector (the `@inspector` slot).
 */
export default function ArchitecturePage() {
  return <ArchitectureHeader />;
}
