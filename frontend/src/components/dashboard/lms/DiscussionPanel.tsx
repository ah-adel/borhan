import { useEffect, useState } from 'react';
import { MessageCircle, Send } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';
import {
  createCourseDiscussion,
  createDiscussionReply,
  fetchCourseDiscussions,
  fetchDiscussionReplies,
} from '@/services/lmsRepository';
import type { CourseDiscussion, DiscussionReply } from '@/types/lms';

type DiscussionPanelProps = {
  courseId: string;
  lessonId: string | null;
  canPost: boolean;
};

export function DiscussionPanel({ courseId, lessonId, canPost }: DiscussionPanelProps) {
  const { t, formatDate } = useI18n();
  const [lessonScope, setLessonScope] = useState(Boolean(lessonId));
  const [threads, setThreads] = useState<CourseDiscussion[]>([]);
  const [repliesByThread, setRepliesByThread] = useState<Record<string, DiscussionReply[]>>({});
  const [expandedThreadId, setExpandedThreadId] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [showComposer, setShowComposer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    const selectedLessonId = lessonScope ? lessonId : null;
    setLoading(true);
    setError('');
    setExpandedThreadId(null);
    setRepliesByThread({});
    fetchCourseDiscussions(courseId, selectedLessonId)
      .then((items) => { if (mounted) setThreads(items); })
      .catch(() => { if (mounted) setError(t('lmsDiscussion.loadError')); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [courseId, lessonId, lessonScope, t]);

  async function reloadThreads() {
    setThreads(await fetchCourseDiscussions(courseId, lessonScope ? lessonId : null));
  }

  async function handleCreateThread(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    setError('');
    try {
      await createCourseDiscussion(courseId, {
        lesson_id: lessonScope ? lessonId : null,
        title: title.trim(),
        content: content.trim(),
      });
      setTitle('');
      setContent('');
      setShowComposer(false);
      await reloadThreads();
    } catch {
      setError(t('lmsDiscussion.postError'));
    } finally {
      setSaving(false);
    }
  }

  async function toggleReplies(threadId: string) {
    if (expandedThreadId === threadId) {
      setExpandedThreadId(null);
      return;
    }
    setExpandedThreadId(threadId);
    if (repliesByThread[threadId]) return;
    try {
      const replies = await fetchDiscussionReplies(threadId);
      setRepliesByThread((current) => ({ ...current, [threadId]: replies }));
    } catch {
      setError(t('lmsDiscussion.loadError'));
    }
  }

  async function handleReply(event: React.FormEvent<HTMLFormElement>, threadId: string) {
    event.preventDefault();
    const reply = replyDrafts[threadId]?.trim();
    if (!reply) return;
    setSaving(true);
    setError('');
    try {
      const created = await createDiscussionReply(threadId, reply);
      setRepliesByThread((current) => ({ ...current, [threadId]: [...(current[threadId] ?? []), created] }));
      setReplyDrafts((current) => ({ ...current, [threadId]: '' }));
    } catch {
      setError(t('lmsDiscussion.postError'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-5" aria-labelledby="discussion-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="discussion-title" className="text-lg font-semibold text-gray-900 dark:text-white">{t('lmsDiscussion.title')}</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{lessonScope && lessonId ? t('lmsDiscussion.thisLesson') : t('lmsDiscussion.courseWide')}</p>
        </div>
        <div className="flex rounded-lg border border-gray-200 bg-gray-100 p-1 dark:border-gray-700 dark:bg-gray-800" role="group" aria-label={t('lmsDiscussion.title')}>
          <button type="button" onClick={() => setLessonScope(false)} aria-pressed={!lessonScope} className={`rounded-md px-3 py-1.5 text-sm font-medium ${!lessonScope ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white' : 'text-gray-500 dark:text-gray-300'}`}>{t('lmsDiscussion.courseWide')}</button>
          <button type="button" onClick={() => setLessonScope(true)} disabled={!lessonId} aria-pressed={lessonScope} className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-40 ${lessonScope ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white' : 'text-gray-500 dark:text-gray-300'}`}>{t('lmsDiscussion.thisLesson')}</button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-900/50 dark:bg-error-950/20 dark:text-error-300" role="alert">{error}</div>}

      {canPost && (!showComposer ? (
        <button type="button" className="btn-primary" onClick={() => setShowComposer(true)}><MessageCircle className="h-4 w-4" />{t('lmsDiscussion.newThread')}</button>
      ) : (
        <form onSubmit={(event) => void handleCreateThread(event)} className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/60">
          <label className="label-text">{t('lmsDiscussion.threadTitle')}<input className="input-field mt-1" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={255} required /></label>
          <label className="label-text">{t('lmsDiscussion.threadContent')}<textarea className="input-field mt-1" value={content} onChange={(event) => setContent(event.target.value)} rows={4} maxLength={10000} required /></label>
          <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setShowComposer(false)}>{t('common.cancel')}</button><button type="submit" className="btn-primary" disabled={saving}><Send className="h-4 w-4" />{t('lmsDiscussion.postThread')}</button></div>
        </form>
      ))}

      {loading ? <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400" role="status">{t('common.loading')}</p> : threads.length === 0 ? <p className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">{t('lmsDiscussion.noThreads')}</p> : (
        <div className="divide-y divide-gray-200 dark:divide-gray-800">
          {threads.map((thread) => {
            const isExpanded = expandedThreadId === thread.id;
            const replies = repliesByThread[thread.id] ?? [];
            return (
              <article key={thread.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{thread.title}</h4>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-gray-600 dark:text-gray-300">{thread.content}</p>
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{thread.user_name} · {formatDate(thread.created_at, { dateStyle: 'medium', timeStyle: 'short' })}</p>
                  </div>
                  <button type="button" className="btn-secondary shrink-0" aria-expanded={isExpanded} onClick={() => void toggleReplies(thread.id)}>{t('lmsDiscussion.replies')} ({replies.length})</button>
                </div>

                {isExpanded && <div className="mt-4 space-y-3 border-s border-gray-200 ps-4 dark:border-gray-700">
                  {replies.length === 0 ? <p className="text-sm text-gray-500 dark:text-gray-400">{t('lmsDiscussion.noReplies')}</p> : replies.map((reply) => <div key={reply.id} className="rounded-lg bg-gray-50 px-3 py-2.5 dark:bg-gray-900/70"><p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-200">{reply.content}</p><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{reply.user_name} · {formatDate(reply.created_at, { dateStyle: 'medium', timeStyle: 'short' })}</p></div>)}
                  {canPost && <form onSubmit={(event) => void handleReply(event, thread.id)} className="flex gap-2"><input className="input-field min-w-0" value={replyDrafts[thread.id] ?? ''} onChange={(event) => setReplyDrafts((current) => ({ ...current, [thread.id]: event.target.value }))} placeholder={t('lmsDiscussion.replyPlaceholder')} maxLength={10000} required /><button type="submit" className="btn-primary shrink-0 px-3" disabled={saving} aria-label={t('lmsDiscussion.postReply')} title={t('lmsDiscussion.postReply')}><Send className="h-4 w-4" /></button></form>}
                </div>}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}