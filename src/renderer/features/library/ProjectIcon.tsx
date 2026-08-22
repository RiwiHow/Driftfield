import dynamicIconImports from 'lucide-react/dynamicIconImports';
import { FolderOpen, type LucideIcon, type LucideProps } from 'lucide-react';
import { lazy, Suspense, type LazyExoticComponent } from 'react';

import type { ProjectIconId } from '../../../shared/contracts/project-layout';

const iconComponents = new Map<
  ProjectIconId,
  LazyExoticComponent<LucideIcon>
>();

const getIconComponent = (
  icon: ProjectIconId,
): LazyExoticComponent<LucideIcon> => {
  const existing = iconComponents.get(icon);
  if (existing !== undefined) return existing;
  const component = lazy(dynamicIconImports[icon]);
  iconComponents.set(icon, component);
  return component;
};

export const ProjectIcon = ({
  icon,
  ...props
}: LucideProps & { icon: ProjectIconId }) => {
  const Icon = getIconComponent(icon);
  return (
    <Suspense fallback={<FolderOpen {...props} />}>
      <Icon {...props} />
    </Suspense>
  );
};
