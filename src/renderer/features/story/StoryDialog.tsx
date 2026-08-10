import { Clock3, GitBranch, RefreshCw, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ProjectStorySnapshot } from '../../../shared/contracts/project-story';

export type StorySection = 'chronicle' | 'threads' | 'personae';

interface StoryDialogProps {
  error: boolean;
  isLoading: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh: () => void;
  onSectionChange: (section: StorySection) => void;
  open: boolean;
  section: StorySection;
  story: ProjectStorySnapshot | null;
}

export function StoryDialog({
  error,
  isLoading,
  onOpenChange,
  onRefresh,
  onSectionChange,
  open,
  section,
  story,
}: StoryDialogProps) {
  const { t } = useTranslation('story');
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="story-dialog">
        <div className="story-dialog-heading">
          <div>
            <DialogTitle>{t(`sections.${section}`)}</DialogTitle>
            <DialogDescription>{t(`descriptions.${section}`)}</DialogDescription>
          </div>
          <Button
            aria-label={t('refresh')}
            disabled={isLoading}
            onClick={onRefresh}
            size="icon"
            variant="ghost"
          >
            <RefreshCw className={isLoading ? 'story-spinner' : undefined} size={14} />
          </Button>
        </div>
        <nav aria-label={t('navigation')} className="story-navigation">
          <StoryNavigationButton
            active={section === 'personae'}
            icon={<Users aria-hidden="true" size={14} />}
            label={t('sections.personae')}
            onClick={() => onSectionChange('personae')}
          />
          <StoryNavigationButton
            active={section === 'chronicle'}
            icon={<Clock3 aria-hidden="true" size={14} />}
            label={t('sections.chronicle')}
            onClick={() => onSectionChange('chronicle')}
          />
          <StoryNavigationButton
            active={section === 'threads'}
            icon={<GitBranch aria-hidden="true" size={14} />}
            label={t('sections.threads')}
            onClick={() => onSectionChange('threads')}
          />
        </nav>
        <div className="story-content">
          {error ? (
            <p className="story-message" role="alert">{t('loadError')}</p>
          ) : story === null ? (
            <p className="story-message">{t('loading')}</p>
          ) : section === 'personae' ? (
            <PersonaeView story={story} />
          ) : section === 'chronicle' ? (
            <ChronicleView story={story} />
          ) : (
            <ThreadsView story={story} />
          )}
        </div>
        {story !== null ? (
          <footer className="story-footer">{t('revision', { revision: story.revision })}</footer>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function StoryNavigationButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={active ? 'is-active' : undefined} onClick={onClick} type="button">
      {icon}<span>{label}</span>
    </button>
  );
}

function PersonaeView({ story }: { story: ProjectStorySnapshot }) {
  const { t } = useTranslation('story');
  if (story.personae.length === 0) return <EmptyState />;
  return (
    <div className="story-list">
      {story.personae.map((persona) => (
        <article className="story-record" key={persona.id}>
          <div><strong>{persona.name}</strong>{persona.role ? <span>{persona.role}</span> : null}</div>
          {persona.summary ? <p>{persona.summary}</p> : <p>{t('noDescription')}</p>}
        </article>
      ))}
    </div>
  );
}

function ChronicleView({ story }: { story: ProjectStorySnapshot }) {
  const { t } = useTranslation('story');
  if (story.timelines.length === 0) return <EmptyState />;
  return (
    <div className="story-groups">
      {story.timelines.map((timeline) => {
        const moments = story.moments.filter(
          (moment) => moment.timelineId === timeline.id,
        );
        return (
          <section className="story-group" key={timeline.id}>
            <header><strong>{timeline.title}</strong>{timeline.isPrimary ? <span>{t('primary')}</span> : null}</header>
            {timeline.summary ? <p>{timeline.summary}</p> : null}
            {moments.length === 0 ? <p className="story-message">{t('empty')}</p> : moments.map((moment) => (
              <div className="chronicle-moment" key={moment.id}>
                <div><time>{moment.displayTime}</time><span>{t(`precision.${moment.precision}`)}</span></div>
                {moment.note ? <p>{moment.note}</p> : null}
                {story.events
                  .filter((event) => event.startMomentId === moment.id)
                  .map((event) => {
                    const participants = story.eventParticipants
                      .filter((item) => item.eventId === event.id)
                      .map((item) => story.personae.find((persona) => persona.id === item.personaId)?.name)
                      .filter((name): name is string => name !== undefined);
                    return (
                      <article className="story-record" key={event.id}>
                        <div><strong>{event.title}</strong><span>{t(`eventStatus.${event.status}`)}</span></div>
                        {event.summary ? <p>{event.summary}</p> : null}
                        {participants.length > 0 ? <small>{participants.join(' · ')}</small> : null}
                      </article>
                    );
                  })}
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

function ThreadsView({ story }: { story: ProjectStorySnapshot }) {
  const { t } = useTranslation('story');
  if (story.threads.length === 0) return <EmptyState />;
  return (
    <div className="story-groups">
      {story.threads.map((thread) => (
        <section className="story-group" key={thread.id}>
          <header><strong>{thread.title}</strong><span>{t(`threadStatus.${thread.status}`)}</span></header>
          {thread.summary ? <p>{thread.summary}</p> : null}
          {story.beats.filter((beat) => beat.threadId === thread.id).map((beat) => (
            <article className="story-record" key={beat.id}>
              <div><span>{t(`beatKind.${beat.kind}`)}</span><span>{t(`threadStatus.${beat.status}`)}</span></div>
              <strong>{beat.title}</strong>
              {beat.description ? <p>{beat.description}</p> : null}
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}

function EmptyState() {
  const { t } = useTranslation('story');
  return <p className="story-message">{t('empty')}</p>;
}
