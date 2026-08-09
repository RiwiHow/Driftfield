import {
  BookMarked,
  BookOpen,
  Castle,
  Crown,
  Earth,
  Landmark,
  Map,
  Orbit,
  ScrollText,
  Shield,
  Sparkles,
  Swords,
  Users,
  type LucideProps,
} from 'lucide-react';

import type { ProjectIconId } from '../../../shared/contracts/project-layout';

const ICONS = {
  'book-marked': BookMarked,
  'book-open': BookOpen,
  castle: Castle,
  crown: Crown,
  earth: Earth,
  landmark: Landmark,
  map: Map,
  orbit: Orbit,
  'scroll-text': ScrollText,
  shield: Shield,
  sparkles: Sparkles,
  swords: Swords,
  users: Users,
} satisfies Record<ProjectIconId, React.ComponentType<LucideProps>>;

export const ProjectIcon = ({
  icon,
  ...props
}: LucideProps & { icon: ProjectIconId }) => {
  const Icon = ICONS[icon];
  return <Icon {...props} />;
};
