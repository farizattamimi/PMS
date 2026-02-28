'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Edit2, UserX, UserCheck } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell, TableEmptyState } from '@/components/ui/Table'
import { Badge } from '@/components/ui/Badge'
import { formatDate } from '@/lib/utils'

type AdminTab = 'users' | 'audit' | 'taxonomy'

const ROLE_COLOR: Record<string, any> = { ADMIN: 'danger', MANAGER: 'info', TENANT: 'gray' }
const SYSTEM_ROLES = ['ADMIN', 'MANAGER', 'TENANT']
const WO_CATEGORIES = ['PLUMBING', 'HVAC', 'ELECTRICAL', 'GENERAL', 'TURNOVER', 'OTHER']
const VENDOR_CATEGORIES = ['PLUMBING', 'HVAC', 'ELECTRICAL', 'GENERAL', 'TURNOVER', 'OTHER']

const BLANK_INVITE = { name: '', email: '', password: '', systemRole: 'TENANT', propertyIds: [] as string[] }
const BLANK_EDIT = { name: '', systemRole: 'TENANT', isActive: true, propertyIds: [] as string[] }

export default function AdminPage() {
  const [tab, setTab] = useState<AdminTab>('users')
  const [users, setUsers] = useState<any[]>([])
  const [properties, setProperties] = useState<any[]>([])
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [auditFilter, setAuditFilter] = useState({ entityType: '', entityId: '' })
  const [loading, setLoading] = useState(false)

  // Invite modal
  const [showInvite, setShowInvite] = useState(false)
  const [inviteForm, setInviteForm] = useState(BLANK_INVITE)
  const [inviteSaving, setInviteSaving] = useState(false)
  const [inviteError, setInviteError] = useState('')

  // Edit modal
  const [editUser, setEditUser] = useState<any>(null)
  const [editForm, setEditForm] = useState(BLANK_EDIT)
  const [editSaving, setEditSaving] = useState(false)

  const loadUsers = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/users').then(r => r.json()),
      fetch('/api/properties').then(r => r.json()),
    ]).then(([u, p]) => {
      setUsers(Array.isArray(u) ? u : [])
      setProperties(Array.isArray(p) ? p : [])
      setLoading(false)
    })
  }, [])

  const loadAudit = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (auditFilter.entityType) params.set('entityType', auditFilter.entityType)
    if (auditFilter.entityId) params.set('entityId', auditFilter.entityId)
    const res = await fetch(`/api/audit?${params}`)
    setAuditLogs(await res.json())
    setLoading(false)
  }, [auditFilter.entityType, auditFilter.entityId])

  useEffect(() => {
    if (tab === 'users') loadUsers()
    else if (tab === 'audit') loadAudit()
  }, [tab, loadUsers, loadAudit])

  useEffect(() => { if (tab === 'audit') loadAudit() }, [tab, loadAudit])

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviteSaving(true)
    setInviteError('')
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(inviteForm),
    })
    const data = await res.json()
    setInviteSaving(false)
    if (!res.ok) { setInviteError(data.error ?? 'Failed to create user'); return }
    setShowInvite(false)
    setInviteForm(BLANK_INVITE)
    loadUsers()
  }

  function openEdit(user: any) {
    setEditUser(user)
    setEditForm({
      name: user.name,
      systemRole: user.systemRole,
      isActive: user.isActive,
      propertyIds: user.managedProperties?.map((p: any) => p.id) ?? [],
    })
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    setEditSaving(true)
    await fetch(`/api/users/${editUser.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    setEditSaving(false)
    setEditUser(null)
    loadUsers()
  }

  async function toggleActive(user: any) {
    await fetch(`/api/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !user.isActive }),
    })
    loadUsers()
  }

  function togglePropertyInList(propId: string, ids: string[], setter: (ids: string[]) => void) {
    setter(ids.includes(propId) ? ids.filter(id => id !== propId) : [...ids, propId])
  }

  const INPUT_CLS = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div>
      <PageHeader title="Admin" subtitle="User management, audit log, and taxonomy" />

      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex gap-1">
          {(['users', 'audit', 'taxonomy'] as AdminTab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-2.5 text-sm font-medium border-b-2 capitalize transition-colors ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t === 'audit' ? 'Audit Log' : t === 'taxonomy' ? 'Taxonomy' : 'Users'}
            </button>
          ))}
        </nav>
      </div>

      {loading && tab !== 'taxonomy' && (
        <div className="flex justify-center py-20">
          <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" />
        </div>
      )}

      {/* Users Tab */}
      {!loading && tab === 'users' && (
        <>
          <div className="flex justify-end mb-4">
            <Button onClick={() => setShowInvite(true)}>
              <Plus className="h-4 w-4 mr-2" /> Invite User
            </Button>
          </div>
          <Card padding="none">
            <div className="overflow-x-auto">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Name</TableHeader>
                  <TableHeader>Email</TableHeader>
                  <TableHeader>Role</TableHeader>
                  <TableHeader>Properties</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader>Joined</TableHeader>
                  <TableHeader></TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.length === 0 && <TableEmptyState message="No users" />}
                {users.map(u => (
                  <TableRow key={u.id} className={!u.isActive ? 'opacity-50' : ''}>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell className="text-gray-500">{u.email}</TableCell>
                    <TableCell><Badge variant={ROLE_COLOR[u.systemRole] ?? 'default'}>{u.systemRole}</Badge></TableCell>
                    <TableCell className="text-gray-500 text-sm">
                      {u.managedProperties?.length > 0
                        ? u.managedProperties.map((p: any) => p.name).join(', ')
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.isActive ? 'success' : 'gray'}>{u.isActive ? 'Active' : 'Inactive'}</Badge>
                    </TableCell>
                    <TableCell className="text-gray-500 text-sm">{formatDate(u.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEdit(u)} className="text-gray-400 hover:text-blue-600 transition-colors" title="Edit user">
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button onClick={() => toggleActive(u)} className={`transition-colors ${u.isActive ? 'text-gray-400 hover:text-red-600' : 'text-gray-400 hover:text-green-600'}`} title={u.isActive ? 'Deactivate' : 'Reactivate'}>
                          {u.isActive ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </Card>
        </>
      )}

      {/* Audit Tab */}
      {!loading && tab === 'audit' && (
        <>
          <div className="flex gap-3 mb-4">
            <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={auditFilter.entityType} onChange={e => setAuditFilter({ ...auditFilter, entityType: e.target.value })}>
              <option value="">All Entity Types</option>
              {['Property', 'Unit', 'Tenant', 'Lease', 'LedgerEntry', 'WorkOrder', 'Vendor', 'User'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 max-w-xs" placeholder="Entity ID…" value={auditFilter.entityId} onChange={e => setAuditFilter({ ...auditFilter, entityId: e.target.value })} />
          </div>
          <Card padding="none">
            <div className="overflow-x-auto">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>When</TableHeader>
                  <TableHeader>Actor</TableHeader>
                  <TableHeader>Action</TableHeader>
                  <TableHeader>Entity</TableHeader>
                  <TableHeader>ID</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {auditLogs.length === 0 && <TableEmptyState message="No audit logs" />}
                {auditLogs.map(log => (
                  <TableRow key={log.id}>
                    <TableCell className="text-gray-500 text-sm whitespace-nowrap">{formatDate(log.createdAt)}</TableCell>
                    <TableCell className="text-sm">{log.actor?.name ?? 'System'}</TableCell>
                    <TableCell>
                      <Badge variant={log.action === 'DELETE' ? 'danger' : log.action === 'CREATE' ? 'success' : log.action === 'STATUS_CHANGE' ? 'info' : 'default'}>
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-gray-600 text-sm">{log.entityType}</TableCell>
                    <TableCell className="text-gray-400 text-xs font-mono">{log.entityId.slice(0, 12)}…</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </Card>
        </>
      )}

      {/* Taxonomy Tab */}
      {tab === 'taxonomy' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <h3 className="font-semibold text-gray-900 mb-1">Work Order Categories</h3>
            <p className="text-xs text-gray-400 mb-4">Schema-level enum values — contact your developer to add new categories.</p>
            <div className="space-y-2">
              {WO_CATEGORIES.map(cat => (
                <div key={cat} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <span className="text-sm font-medium text-gray-700">{cat}</span>
                  <Badge variant="success">Active</Badge>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <h3 className="font-semibold text-gray-900 mb-1">Vendor Service Categories</h3>
            <p className="text-xs text-gray-400 mb-4">Shared with work order categories. Same schema-level enum.</p>
            <div className="space-y-2">
              {VENDOR_CATEGORIES.map(cat => (
                <div key={cat} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <span className="text-sm font-medium text-gray-700">{cat}</span>
                  <Badge variant="success">Active</Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Invite User Modal */}
      <Modal isOpen={showInvite} onClose={() => { setShowInvite(false); setInviteForm(BLANK_INVITE); setInviteError('') }} title="Invite User">
        <form onSubmit={handleInvite} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
            <input className={INPUT_CLS} value={inviteForm.name} onChange={e => setInviteForm({ ...inviteForm, name: e.target.value })} placeholder="Jane Smith" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
            <input type="email" className={INPUT_CLS} value={inviteForm.email} onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })} placeholder="jane@example.com" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Temporary Password *</label>
            <input type="password" className={INPUT_CLS} value={inviteForm.password} onChange={e => setInviteForm({ ...inviteForm, password: e.target.value })} placeholder="Min. 8 characters" minLength={8} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">System Role *</label>
            <select className={INPUT_CLS} value={inviteForm.systemRole} onChange={e => setInviteForm({ ...inviteForm, systemRole: e.target.value })}>
              {SYSTEM_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {inviteForm.systemRole === 'MANAGER' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Assign Properties (optional)</label>
              <div className="space-y-1 max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2">
                {properties.map(p => (
                  <label key={p.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-2 py-1 rounded">
                    <input
                      type="checkbox"
                      checked={inviteForm.propertyIds.includes(p.id)}
                      onChange={() => togglePropertyInList(p.id, inviteForm.propertyIds, ids => setInviteForm({ ...inviteForm, propertyIds: ids }))}
                      className="rounded"
                    />
                    <span className="text-sm">{p.name}</span>
                  </label>
                ))}
                {properties.length === 0 && <p className="text-xs text-gray-400 px-2 py-1">No properties available</p>}
              </div>
            </div>
          )}
          {inviteError && <p className="text-sm text-red-600">{inviteError}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => { setShowInvite(false); setInviteForm(BLANK_INVITE); setInviteError('') }}>Cancel</Button>
            <Button type="submit" disabled={inviteSaving}>{inviteSaving ? 'Creating…' : 'Create User'}</Button>
          </div>
        </form>
      </Modal>

      {/* Edit User Modal */}
      <Modal isOpen={!!editUser} onClose={() => setEditUser(null)} title={`Edit User — ${editUser?.name}`}>
        {editUser && (
          <form onSubmit={handleEdit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <input className={INPUT_CLS} value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">System Role</label>
              <select className={INPUT_CLS} value={editForm.systemRole} onChange={e => setEditForm({ ...editForm, systemRole: e.target.value })}>
                {SYSTEM_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Account Status</label>
              <select className={INPUT_CLS} value={editForm.isActive ? 'active' : 'inactive'} onChange={e => setEditForm({ ...editForm, isActive: e.target.value === 'active' })}>
                <option value="active">Active</option>
                <option value="inactive">Inactive (deactivated)</option>
              </select>
            </div>
            {editForm.systemRole === 'MANAGER' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Managed Properties</label>
                <div className="space-y-1 max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2">
                  {properties.map(p => (
                    <label key={p.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-2 py-1 rounded">
                      <input
                        type="checkbox"
                        checked={editForm.propertyIds.includes(p.id)}
                        onChange={() => togglePropertyInList(p.id, editForm.propertyIds, ids => setEditForm({ ...editForm, propertyIds: ids }))}
                        className="rounded"
                      />
                      <span className="text-sm">{p.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={() => setEditUser(null)}>Cancel</Button>
              <Button type="submit" disabled={editSaving}>{editSaving ? 'Saving…' : 'Save Changes'}</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
