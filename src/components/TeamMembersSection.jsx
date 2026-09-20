import React, { useState, useEffect } from "react";
import { 
  Users, 
  UserPlus, 
  Trash2, 
  Loader2, 
  Search, 
  Calendar, 
  ShieldCheck, 
  X, 
  Check, 
  AlertCircle,
  Briefcase
} from "lucide-react";
import { 
  getOrEnsureAuthUser, 
  fetchUserTeamMembers, 
  createUserTeamMember, 
  deleteUserTeamMember 
} from "../firebase.js";

export const TeamMembersSection = ({ currentUser }) => {
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [authUser, setAuthUser] = useState(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("Sales Associate");
  const [customRole, setCustomRole] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Delete modal state (in-app modal, no browser prompt)
  const [memberToDelete, setMemberToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Load Members
  useEffect(() => {
    let mounted = true;
    const loadMembers = async () => {
      setLoading(true);
      const user = await getOrEnsureAuthUser();
      if (!mounted) return;
      setAuthUser(user);

      if (user?.uid) {
        try {
          const userMembers = await fetchUserTeamMembers(user.uid);
          if (mounted) setMembers(userMembers);
        } catch (err) {
          console.warn("Failed loading team members:", err);
        }
      }
      if (mounted) setLoading(false);
    };

    loadMembers();
    return () => { mounted = false; };
  }, [currentUser?.email]);

  // Handle Create Member
  const handleCreateMember = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please provide the team member name.");
      return;
    }
    if (!authUser?.uid) {
      setError("Authentication required. Please refresh.");
      return;
    }

    const finalRole = role === "Other" ? (customRole.trim() || "Team Member") : role;

    setSaving(true);
    setError(null);
    try {
      const newMember = await createUserTeamMember(authUser.uid, {
        name: name.trim(),
        role: finalRole
      });
      setMembers(prev => [newMember, ...prev]);
      setName("");
      setRole("Sales Associate");
      setCustomRole("");
      setIsModalOpen(false);
    } catch (err) {
      setError(err?.message || "Failed to add team member.");
    } finally {
      setSaving(false);
    }
  };

  // Handle Delete Member
  const handleConfirmDeleteMember = async () => {
    if (!authUser?.uid || !memberToDelete) return;
    setDeleteLoading(true);
    try {
      await deleteUserTeamMember(authUser.uid, memberToDelete.id);
      setMembers(prev => prev.filter(m => m.id !== memberToDelete.id));
      setMemberToDelete(null);
    } catch (err) {
      console.warn("Delete team member error:", err);
    } finally {
      setDeleteLoading(false);
    }
  };

  const filteredMembers = members.filter(m => {
    const q = searchQuery.toLowerCase();
    return !q || m.name.toLowerCase().includes(q) || (m.role && m.role.toLowerCase().includes(q));
  });

  const getRoleBadgeColor = (roleStr = "") => {
    const lower = roleStr.toLowerCase();
    if (lower.includes("owner") || lower.includes("director")) return "bg-purple-50 text-purple-700 border-purple-200";
    if (lower.includes("manager") || lower.includes("lead")) return "bg-blue-50 text-blue-700 border-blue-200";
    if (lower.includes("finance") || lower.includes("accountant")) return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (lower.includes("sales") || lower.includes("pos")) return "bg-amber-50 text-amber-800 border-amber-200";
    return "bg-slate-50 text-slate-700 border-slate-200";
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200/60">
              Firestore Cloud Team
            </span>
            <span className="text-xs text-slate-500 font-mono">
              {authUser ? `UID: ${authUser.uid.slice(0, 8)}...` : "Connecting..."}
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 font-serif mt-1">Team Members & Access</h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Manage your staff, store managers, till operators, and accountants saved in your private Firestore database.
          </p>
        </div>

        <div className="shrink-0">
          <button
            type="button"
            onClick={() => {
              setName("");
              setRole("Sales Associate");
              setCustomRole("");
              setError(null);
              setIsModalOpen(true);
            }}
            className="px-4 py-2.5 rounded-xl bg-[#0B192C] hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-md transition-all cursor-pointer"
          >
            <UserPlus className="w-4 h-4 text-emerald-400" />
            <span>Add Member</span>
          </button>
        </div>
      </div>

      {/* Search Bar & Summary */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search members by name or role..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-white border border-slate-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-xs"
          />
        </div>

        <div className="text-xs font-semibold text-slate-500">
          Active Staff: {members.length} {members.length === 1 ? "member" : "members"}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="p-12 bg-white rounded-2xl border border-slate-200/80 flex items-center justify-center gap-3 text-slate-500 text-xs shadow-xs">
          <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
          <span>Retrieving team roster from Firestore...</span>
        </div>
      ) : filteredMembers.length === 0 ? (
        <div className="p-12 bg-white rounded-2xl border border-slate-200/80 text-center space-y-3 shadow-xs">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
            <Users className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-800">No team members found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {searchQuery
                ? `No team members matched "${searchQuery}".`
                : "Add staff, till attendants, or store supervisors to manage roles in your business."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setName("");
              setRole("Sales Associate");
              setCustomRole("");
              setError(null);
              setIsModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold transition-all shadow-xs cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Add First Member</span>
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs divide-y divide-slate-100 overflow-hidden">
          {filteredMembers.map(member => {
            const initials = member.name
              .split(" ")
              .map(n => n[0])
              .filter(Boolean)
              .slice(0, 2)
              .join("")
              .toUpperCase();

            return (
              <div
                key={member.id}
                className="p-4 sm:p-5 flex items-center justify-between hover:bg-slate-50 transition-colors group"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-11 h-11 rounded-2xl bg-slate-100 border border-slate-200/80 flex items-center justify-center font-bold text-slate-700 text-sm shadow-inner shrink-0">
                    {initials || "U"}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-sm font-bold text-slate-900 truncate">
                        {member.name}
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border shrink-0 ${getRoleBadgeColor(member.role)}`}>
                        {member.role || "Team Member"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1">
                      <span className="flex items-center gap-1">
                        <Briefcase className="w-3 h-3 text-slate-400" />
                        Private Firestore Record
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        Added {member.createdAt ? new Date(member.createdAt).toLocaleDateString() : "Today"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setMemberToDelete(member)}
                    title="Remove member"
                    className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: ADD MEMBER (NO BROWSER PROMPT) */}
      {/* ============================================================ */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in">
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 bg-[#0B192C] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-base font-serif">Add Team Member</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateMember} className="p-6 space-y-4">
              {error && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. Peter Otieno"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Role / Designation *
                </label>
                <select
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                >
                  <option value="Store Manager">Store Manager</option>
                  <option value="Finance & Accountant">Finance & Accountant</option>
                  <option value="Sales Associate">Sales Associate / POS Cashier</option>
                  <option value="Inventory Officer">Inventory Officer</option>
                  <option value="Operations Lead">Operations Lead</option>
                  <option value="Other">Other (Custom)</option>
                </select>
              </div>

              {role === "Other" && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Custom Role Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Delivery Driver & Dispatch"
                    value={customRole}
                    onChange={e => setCustomRole(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs shadow-md flex items-center gap-2 transition-all cursor-pointer disabled:opacity-60"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving to Firestore...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Add Member</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: DELETE MEMBER CONFIRMATION (NO BROWSER PROMPT) */}
      {/* ============================================================ */}
      {memberToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in">
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 bg-red-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-red-400" />
                <h3 className="font-bold text-base font-serif">Remove Team Member</h3>
              </div>
              <button
                type="button"
                disabled={deleteLoading}
                onClick={() => setMemberToDelete(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-red-900 transition-colors cursor-pointer disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-700">
                Are you sure you want to remove <span className="font-bold text-slate-950">"{memberToDelete.name}"</span> ({memberToDelete.role || "Team Member"})?
              </p>
              <p className="text-xs text-slate-500">
                Their record will be permanently deleted from your private team roster in Firestore.
              </p>

              <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100">
                <button
                  type="button"
                  disabled={deleteLoading}
                  onClick={() => setMemberToDelete(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deleteLoading}
                  onClick={handleConfirmDeleteMember}
                  className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-extrabold text-xs shadow-md flex items-center gap-2 transition-all cursor-pointer disabled:opacity-60"
                >
                  {deleteLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Removing...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remove Member</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeamMembersSection;
