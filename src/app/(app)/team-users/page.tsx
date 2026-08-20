"use client";

import { useEffect, useState } from "react";
import {
  OrganizationMember,
  MemberRole,
  fetchOrganizationMembers,
  addOrganizationMember,
  updateMemberRole,
  removeMember,
} from "@/lib/organizationMembersDb";
import { getCurrentUserContext } from "@/lib/currentUserContext";
import TextField from "@/components/TextField";
import Button from "@/components/Button";

const ROLE_LABELS: Record<MemberRole, string> = {
  owner: "Owner",
  project_manager: "Project Manager",
  project_accountant: "Project Accountant",
};

// Deliberately excludes "owner" — promoting someone to co-owner isn't
// exposed in this UI (add_organization_member() also rejects it server-side).
const ASSIGNABLE_ROLES: { value: "project_manager" | "project_accountant"; label: string }[] = [
  { value: "project_manager", label: "Project Manager" },
  { value: "project_accountant", label: "Project Accountant" },
];

type AddFormState = { email: string; role: "project_manager" | "project_accountant" };

const EMPTY_ADD_FORM: AddFormState = { email: "", role: "project_manager" };

export default function TeamUsersPage() {
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [hasOrganization, setHasOrganization] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<AddFormState>(EMPTY_ADD_FORM);
  const [isSavingAdd, setIsSavingAdd] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [removeTarget, setRemoveTarget] = useState<OrganizationMember | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const [roleUpdatingId, setRoleUpdatingId] = useState<string | null>(null);

  function load() {
    setIsLoading(true);
    setError(null);
    Promise.all([fetchOrganizationMembers(), getCurrentUserContext()])
      .then(([memberData, ctx]) => {
        setMembers(memberData);
        setMyUserId(ctx.userId);
        setHasOrganization(ctx.organizationId !== null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load your team."))
      .finally(() => setIsLoading(false));
  }

  useEffect(load, []);

  const myRole = members.find((m) => m.userId === myUserId)?.role;
  const isOwner = myRole === "owner";

  // ── Add member ────────────────────────────────────────────────────────

  function openAdd() {
    setAddForm(EMPTY_ADD_FORM);
    setAddError(null);
    setIsAddOpen(true);
  }

  function closeAdd() {
    setIsAddOpen(false);
    setAddError(null);
  }

  async function handleAdd() {
    if (!addForm.email.trim()) {
      setAddError("Email is required.");
      return;
    }
    setIsSavingAdd(true);
    setAddError(null);
    try {
      await addOrganizationMember(addForm.email, addForm.role);
      closeAdd();
      load();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Could not add this team member.");
    } finally {
      setIsSavingAdd(false);
    }
  }

  // ── Role change ──────────────────────────────────────────────────────

  async function handleRoleChange(member: OrganizationMember, role: "project_manager" | "project_accountant") {
    setRoleUpdatingId(member.userId);
    setError(null);
    try {
      await updateMemberRole(member.userId, role, member.fullName || member.email);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update this team member's role.");
    } finally {
      setRoleUpdatingId(null);
    }
  }

  // ── Remove ───────────────────────────────────────────────────────────

  function openRemove(member: OrganizationMember) {
    setRemoveError(null);
    setRemoveTarget(member);
  }

  function closeRemove() {
    setRemoveTarget(null);
    setRemoveError(null);
  }

  async function handleConfirmRemove() {
    if (!removeTarget) return;
    setIsRemoving(true);
    setRemoveError(null);
    try {
      await removeMember(removeTarget.userId, removeTarget.fullName || removeTarget.email);
      closeRemove();
      load();
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : "Could not remove this team member.");
    } finally {
      setIsRemoving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-navy">Team & Users</h1>
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  if (!hasOrganization) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold text-navy">Team & Users</h1>
        <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center shadow-sm">
          <p className="text-sm font-semibold text-gray-400">No organization yet</p>
          <p className="mt-1 text-xs text-gray-400">Complete your company profile to set one up.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">Team & Users</h1>
          <p className="mt-1 text-sm text-gray-500">
            {isOwner
              ? "People with access to your company's Syntriq account."
              : "People with access to your company's Syntriq account. Only the account owner can make changes here."}
          </p>
        </div>
        {isOwner && (
          <Button type="button" onClick={openAdd} className="w-auto px-5">
            + Add member
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Email</th>
              <th className="px-5 py-3">Role</th>
              <th className="px-5 py-3">Joined</th>
              {isOwner && <th className="px-5 py-3"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {members.map((member) => {
              const isSelf = member.userId === myUserId;
              const canEditThisRow = isOwner && member.role !== "owner";
              return (
                <tr key={member.userId}>
                  <td className="px-5 py-3.5 font-semibold text-navy">
                    {member.fullName || <span className="text-gray-300">—</span>}
                    {isSelf && <span className="ml-1.5 text-xs font-normal text-gray-400">(you)</span>}
                  </td>
                  <td className="px-5 py-3.5 text-gray-600">{member.email}</td>
                  <td className="px-5 py-3.5 text-gray-600">
                    {canEditThisRow ? (
                      <select
                        value={member.role}
                        disabled={roleUpdatingId === member.userId}
                        onChange={(e) =>
                          handleRoleChange(member, e.target.value as "project_manager" | "project_accountant")
                        }
                        className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-navy focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal disabled:opacity-50"
                      >
                        {ASSIGNABLE_ROLES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      ROLE_LABELS[member.role]
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-gray-600">{new Date(member.joinedAt).toLocaleDateString()}</td>
                  {isOwner && (
                    <td className="px-5 py-3.5">
                      {canEditThisRow && (
                        <div className="flex items-center justify-end">
                          <button
                            type="button"
                            onClick={() => openRemove(member)}
                            className="text-xs font-semibold text-red-500 hover:underline"
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add member modal */}
      {isAddOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={isSavingAdd ? undefined : closeAdd}
        >
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
              <h2 className="text-lg font-bold text-navy">Add team member</h2>
              {!isSavingAdd && (
                <button type="button" onClick={closeAdd} className="text-gray-400 hover:text-gray-600 text-xl leading-none mt-0.5">
                  ×
                </button>
              )}
            </div>

            <div className="flex flex-col gap-4 p-6">
              <p className="text-xs text-gray-400">
                They&apos;ll need an existing Syntriq account first — if they don&apos;t have one yet, ask them to sign up,
                then add them here.
              </p>
              <TextField
                label="Email"
                id="memberEmail"
                type="email"
                required
                value={addForm.email}
                onChange={(e) => setAddForm((prev) => ({ ...prev, email: e.target.value }))}
              />
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Role</label>
                <select
                  value={addForm.role}
                  onChange={(e) =>
                    setAddForm((prev) => ({ ...prev, role: e.target.value as "project_manager" | "project_accountant" }))
                  }
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-navy focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                >
                  {ASSIGNABLE_ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              {addError && <p className="text-sm text-red-600">{addError}</p>}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={closeAdd}
                  disabled={isSavingAdd}
                  className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-navy hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={isSavingAdd}
                  className="flex-1 rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal/90 disabled:opacity-50"
                >
                  {isSavingAdd ? "Adding…" : "Add"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Remove confirm modal */}
      {removeTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={isRemoving ? undefined : closeRemove}
        >
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
              <h2 className="text-lg font-bold text-navy">Remove team member</h2>
              {!isRemoving && (
                <button type="button" onClick={closeRemove} className="text-gray-400 hover:text-gray-600 text-xl leading-none mt-0.5">
                  ×
                </button>
              )}
            </div>

            <div className="flex flex-col gap-4 p-6">
              <p className="text-sm text-gray-600">
                Remove <strong className="text-navy">{removeTarget.fullName || removeTarget.email}</strong> from your
                team? They&apos;ll lose access to this company&apos;s Syntriq account.
              </p>
              {removeError && <p className="text-sm text-red-600">{removeError}</p>}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={closeRemove}
                  disabled={isRemoving}
                  className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-navy hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmRemove}
                  disabled={isRemoving}
                  className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {isRemoving ? "Removing…" : "Yes, remove"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
