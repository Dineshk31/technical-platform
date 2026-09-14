import { useEffect, useRef, useState } from 'react';
import { Ban, CheckCircle2, Pencil, Users as UsersIcon } from 'lucide-react';
import { USER_ROLE_CODES, type UserRoleCode } from '@technical-platform/shared';
import { ApiError } from '../lib/api-client';
import { listUsers, updateUser, type UpdateUserInput, type UserDto } from '../lib/users-api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/useConfirm';
import { PageHeader } from '../components/PageHeader';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { SkeletonTable } from '../components/Skeleton';

const PAGE_SIZE = 20;

/**
 * Real admin Users management (§P1-6 of the transformation plan) — search,
 * filter by role/department/batch, edit department/batch/role, deactivate/
 * reactivate. Only possible now that `PATCH /users/:id` exists (§P1-5); every
 * security-relevant change (role, isActive) is still enforced server-side —
 * this page never trusts its own disabled-button logic as the real guard.
 */
export function AdminUsersPage() {
  const { user: me } = useAuth();
  const { showToast } = useToast();
  const [requestConfirm, confirmDialog] = useConfirm();

  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [role, setRole] = useState<UserRoleCode | ''>('');
  const [department, setDepartment] = useState('');
  const [batch, setBatch] = useState('');
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<UserDto[]>([]);
  const [meta, setMeta] = useState({ page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const [editing, setEditing] = useState<UserDto | null>(null);
  const [editRole, setEditRole] = useState<UserRoleCode>('STUDENT');
  const [editDepartment, setEditDepartment] = useState('');
  const [editBatch, setEditBatch] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function refresh() {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await listUsers({
        page,
        pageSize: PAGE_SIZE,
        role: role || undefined,
        search: search || undefined,
        department: department || undefined,
        batch: batch || undefined,
      });
      if (requestId !== requestIdRef.current) return;
      setRows(result.data);
      setMeta(result.meta);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof ApiError ? err.message : 'Failed to load users');
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, role, department, batch, page]);

  function handleSearch() {
    setSearch(searchInput);
    setPage(1);
  }

  function openEdit(u: UserDto) {
    setEditing(u);
    setEditRole(u.role);
    setEditDepartment(u.department ?? '');
    setEditBatch(u.batch ?? '');
    setSaveError(null);
  }

  async function applyUpdate(id: string, input: UpdateUserInput, successMessage: string) {
    try {
      const updated = await updateUser(id, input);
      setRows((prev) => prev.map((r) => (r.id === id ? updated : r)));
      showToast('success', successMessage);
      return true;
    } catch (err) {
      showToast('error', err instanceof ApiError ? err.message : 'Failed to update user');
      return false;
    }
  }

  async function handleSaveEdit() {
    if (!editing) return;
    setSaving(true);
    setSaveError(null);
    try {
      const input: UpdateUserInput = {
        department: editDepartment.trim() || null,
        batch: editBatch.trim() || null,
      };
      if (editRole !== editing.role) input.role = editRole;
      const updated = await updateUser(editing.id, input);
      setRows((prev) => prev.map((r) => (r.id === editing.id ? updated : r)));
      showToast('success', `${updated.name}'s account was updated.`);
      setEditing(null);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Failed to update user');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(u: UserDto) {
    const activating = !u.isActive;
    const ok = await requestConfirm({
      title: activating ? `Reactivate ${u.name}?` : `Deactivate ${u.name}?`,
      description: activating
        ? `${u.name} (${u.email}) will be able to sign in again immediately.`
        : `${u.name} (${u.email}) will be signed out and unable to sign in until reactivated.`,
      confirmLabel: activating ? 'Reactivate' : 'Deactivate',
      confirmVariant: activating ? 'success' : 'danger',
    });
    if (!ok) return;
    void applyUpdate(u.id, { isActive: activating }, activating ? `${u.name} reactivated.` : `${u.name} deactivated.`);
  }

  return (
    <div className="dashboard-body">
      {confirmDialog}
      <PageHeader title="Users" subtitle="Search, filter, and manage every account on the platform." />

      <div className="card">
        <div className="filters-row">
          <input
            placeholder="Search by name or email"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            style={{ marginBottom: 0, minWidth: 220 }}
          />
          <select
            value={role}
            onChange={(e) => {
              setRole(e.target.value as UserRoleCode | '');
              setPage(1);
            }}
          >
            <option value="">All roles</option>
            {USER_ROLE_CODES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <input
            placeholder="Department"
            value={department}
            onChange={(e) => {
              setDepartment(e.target.value);
              setPage(1);
            }}
            style={{ marginBottom: 0, maxWidth: 160 }}
          />
          <input
            placeholder="Batch"
            value={batch}
            onChange={(e) => {
              setBatch(e.target.value);
              setPage(1);
            }}
            style={{ marginBottom: 0, maxWidth: 140 }}
          />
          <button className="btn-secondary btn-small" onClick={handleSearch}>
            Search
          </button>
        </div>

        {error && <ErrorState message={error} />}
        {loading ? (
          <SkeletonTable rows={6} columns={6} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<UsersIcon size={22} />} title="No users match this filter" />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Department</th>
                    <th>Batch</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((u) => {
                    const isSelf = u.id === me?.id;
                    return (
                      <tr key={u.id}>
                        <td>
                          {u.name}
                          {isSelf && (
                            <span className="field-hint" style={{ margin: 0, marginLeft: '0.4rem', display: 'inline' }}>
                              (you)
                            </span>
                          )}
                        </td>
                        <td>{u.email}</td>
                        <td>
                          <Badge variant={u.role === 'ADMIN' ? 'accent' : 'info'}>{u.role}</Badge>
                        </td>
                        <td>{u.department ?? '—'}</td>
                        <td>{u.batch ?? '—'}</td>
                        <td>
                          <Badge variant={u.isActive ? 'success' : 'danger'}>{u.isActive ? 'Active' : 'Inactive'}</Badge>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button className="btn-secondary btn-small btn-icon" onClick={() => openEdit(u)}>
                              <Pencil size={13} /> Edit
                            </button>
                            <button
                              className={`btn-small btn-icon ${u.isActive ? 'btn-danger' : 'btn-submit'}`}
                              disabled={isSelf}
                              title={isSelf ? "You can't deactivate your own account" : undefined}
                              onClick={() => void handleToggleActive(u)}
                            >
                              {u.isActive ? (
                                <>
                                  <Ban size={13} /> Deactivate
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 size={13} /> Reactivate
                                </>
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {meta.totalPages > 1 && (
              <div className="action-row" style={{ justifyContent: 'flex-end', marginTop: '1rem', marginBottom: 0 }}>
                <button className="btn-secondary btn-small" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </button>
                <Badge variant="neutral">
                  Page {meta.page} of {meta.totalPages} ({meta.total} total)
                </Badge>
                <button className="btn-secondary btn-small" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <Modal open={editing !== null} onClose={() => setEditing(null)}>
        {editing && (
          <>
            <p className="modal-title">Edit {editing.name}</p>
            <p className="modal-body" style={{ marginBottom: '1rem' }}>
              {editing.email}
            </p>
            <label htmlFor="edit-role">Role</label>
            <select
              id="edit-role"
              value={editRole}
              onChange={(e) => setEditRole(e.target.value as UserRoleCode)}
              disabled={editing.id === me?.id}
            >
              {USER_ROLE_CODES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {editing.id === me?.id && <p className="field-hint">You can't change your own role.</p>}

            <label htmlFor="edit-department">Department</label>
            <input id="edit-department" value={editDepartment} onChange={(e) => setEditDepartment(e.target.value)} />

            <label htmlFor="edit-batch">Batch</label>
            <input id="edit-batch" value={editBatch} onChange={(e) => setEditBatch(e.target.value)} />

            {saveError && <p className="form-error">{saveError}</p>}

            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setEditing(null)} disabled={saving}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => void handleSaveEdit()} disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
