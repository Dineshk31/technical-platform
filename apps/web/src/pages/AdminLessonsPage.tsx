import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BookOpen, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { CODING_TOPICS } from '@technical-platform/shared';
import { ApiError } from '../lib/api-client';
import { deleteLesson, listLessons, updateLesson, type AdminLessonListItem } from '../lib/learn-api';
import { useConfirm } from '../components/useConfirm';
import { useToast } from '../components/Toast';
import { PageHeader } from '../components/PageHeader';
import { Badge } from '../components/Badge';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { SkeletonTable } from '../components/Skeleton';

/**
 * Admin content authoring for Learn (§P16-B of the transformation audit) —
 * same filters-row/table/EmptyState/SkeletonTable shape as AdminQuestionBankPage,
 * a parallel content-management surface rather than merged into the Question Bank
 * (lessons and questions are different content types with different review needs).
 */
export function AdminLessonsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const topic = searchParams.get('topic') ?? '';
  const published = searchParams.get('published') ?? '';
  const urlSearch = searchParams.get('search') ?? '';

  const [searchInput, setSearchInput] = useState(urlSearch);
  useEffect(() => setSearchInput(urlSearch), [urlSearch]);

  const [lessons, setLessons] = useState<AdminLessonListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const [requestConfirm, confirmDialog] = useConfirm();
  const { showToast } = useToast();

  async function refresh() {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await listLessons({
        search: urlSearch || undefined,
        topic: topic || undefined,
        isPublished: published === '' ? undefined : published === 'true',
        pageSize: 50,
      });
      if (requestId !== requestIdRef.current) return;
      setLessons(result.data);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof ApiError ? err.message : 'Failed to load lessons');
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }

  function setFilter(key: string, value: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  }

  function handleSearch() {
    setFilter('search', searchInput);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic, published, urlSearch]);

  async function handleTogglePublish(lesson: AdminLessonListItem) {
    const nextState = !lesson.isPublished;
    if (lesson.isPublished) {
      const ok = await requestConfirm({
        title: `Unpublish "${lesson.title}"?`,
        description: 'Students will no longer be able to open this lesson. Their existing progress on it is kept.',
        confirmLabel: 'Unpublish',
        confirmVariant: 'danger',
      });
      if (!ok) return;
    }
    try {
      const updated = await updateLesson(lesson.id, { isPublished: nextState });
      setLessons((prev) => prev.map((l) => (l.id === lesson.id ? { ...l, isPublished: updated.isPublished } : l)));
      showToast('success', nextState ? `"${lesson.title}" published.` : `"${lesson.title}" unpublished.`);
    } catch (err) {
      showToast('error', err instanceof ApiError ? err.message : 'Failed to update lesson');
    }
  }

  async function handleDelete(lesson: AdminLessonListItem) {
    const ok = await requestConfirm({
      title: `Delete "${lesson.title}"?`,
      description: 'This permanently removes the lesson and any student progress on it. This cannot be undone.',
      confirmLabel: 'Delete lesson',
      confirmVariant: 'danger',
    });
    if (!ok) return;
    try {
      await deleteLesson(lesson.id);
      setLessons((prev) => prev.filter((l) => l.id !== lesson.id));
      showToast('success', `"${lesson.title}" deleted.`);
    } catch (err) {
      showToast('error', err instanceof ApiError ? err.message : 'Failed to delete lesson');
    }
  }

  return (
    <div className="dashboard-body">
      {confirmDialog}
      <PageHeader
        title="Lessons"
        subtitle="Author and publish Learn content, grouped by topic."
        actions={
          <Link to="/admin/lessons/new">
            <button className="btn-icon">
              <Plus size={15} /> New lesson
            </button>
          </Link>
        }
      />

      <div className="card">
        <div className="filters-row">
          <input
            placeholder="Search by title"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            style={{ marginBottom: 0, minWidth: 220 }}
          />
          <select value={topic} onChange={(e) => setFilter('topic', e.target.value)}>
            <option value="">All topics</option>
            {CODING_TOPICS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select value={published} onChange={(e) => setFilter('published', e.target.value)}>
            <option value="">Any status</option>
            <option value="true">Published</option>
            <option value="false">Draft</option>
          </select>
          <button className="btn-secondary btn-small" onClick={handleSearch}>
            Search
          </button>
        </div>

        {error && <ErrorState message={error} />}
        {loading ? (
          <SkeletonTable rows={5} columns={5} />
        ) : lessons.length === 0 ? (
          <EmptyState
            icon={<BookOpen size={22} />}
            title="No lessons found"
            description="Create a lesson to start building out the Learn pillar for a topic."
            action={
              <Link to="/admin/lessons/new">
                <button className="btn-icon">
                  <Plus size={15} /> New lesson
                </button>
              </Link>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Topic</th>
                  <th>Order</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lessons.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <Link to={`/admin/lessons/${l.id}/edit`}>{l.title}</Link>
                    </td>
                    <td>
                      <span className="topic-tag">{l.topic}</span>
                    </td>
                    <td>{l.orderIndex}</td>
                    <td>
                      <Badge variant={l.isPublished ? 'success' : 'neutral'}>{l.isPublished ? 'Published' : 'Draft'}</Badge>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                        <button className="btn-secondary btn-small btn-icon" onClick={() => void handleTogglePublish(l)}>
                          {l.isPublished ? <EyeOff size={13} /> : <Eye size={13} />}
                          {l.isPublished ? 'Unpublish' : 'Publish'}
                        </button>
                        <button className="btn-danger btn-small btn-icon" onClick={() => void handleDelete(l)}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
