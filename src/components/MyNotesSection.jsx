import React, { useState, useEffect } from "react";
import { 
  FileText, 
  Plus, 
  Trash2, 
  Loader2, 
  Search, 
  Calendar, 
  Clock, 
  X, 
  Check, 
  AlertCircle,
  StickyNote
} from "lucide-react";
import { 
  getOrEnsureAuthUser, 
  fetchUserNotes, 
  createUserNote, 
  deleteUserNote 
} from "../firebase.js";

export const MyNotesSection = ({ currentUser }) => {
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [authUser, setAuthUser] = useState(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Delete modal state (in-app modal, no browser prompt)
  const [noteToDelete, setNoteToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Load Notes
  useEffect(() => {
    let mounted = true;
    const loadNotes = async () => {
      setLoading(true);
      const user = await getOrEnsureAuthUser();
      if (!mounted) return;
      setAuthUser(user);

      if (user?.uid) {
        try {
          const userNotes = await fetchUserNotes(user.uid);
          if (mounted) setNotes(userNotes);
        } catch (err) {
          console.warn("Failed loading notes:", err);
        }
      }
      if (mounted) setLoading(false);
    };

    loadNotes();
    return () => { mounted = false; };
  }, [currentUser?.email]);

  // Handle Save Note
  const handleCreateNote = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Please provide a note title.");
      return;
    }
    if (!authUser?.uid) {
      setError("Authentication required. Please refresh.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const newNote = await createUserNote(authUser.uid, {
        title: title.trim(),
        content: content.trim()
      });
      setNotes(prev => [newNote, ...prev]);
      setTitle("");
      setContent("");
      setIsModalOpen(false);
    } catch (err) {
      setError(err?.message || "Failed to create note.");
    } finally {
      setSaving(false);
    }
  };

  // Handle Delete Note
  const handleConfirmDeleteNote = async () => {
    if (!authUser?.uid || !noteToDelete) return;
    setDeleteLoading(true);
    try {
      await deleteUserNote(authUser.uid, noteToDelete.id);
      setNotes(prev => prev.filter(n => n.id !== noteToDelete.id));
      setNoteToDelete(null);
    } catch (err) {
      console.warn("Delete note error:", err);
    } finally {
      setDeleteLoading(false);
    }
  };

  const filteredNotes = notes.filter(n => {
    const q = searchQuery.toLowerCase();
    return !q || n.title.toLowerCase().includes(q) || (n.content && n.content.toLowerCase().includes(q));
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200/60">
              Firestore Cloud Notes
            </span>
            <span className="text-xs text-slate-500 font-mono">
              {authUser ? `UID: ${authUser.uid.slice(0, 8)}...` : "Connecting..."}
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 font-serif mt-1">My Notes & Memos</h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Keep meeting minutes, supplier renegotiation notes, and strategic SME ideas private to your account.
          </p>
        </div>

        <div className="shrink-0">
          <button
            type="button"
            onClick={() => {
              setTitle("");
              setContent("");
              setError(null);
              setIsModalOpen(true);
            }}
            className="px-4 py-2.5 rounded-xl bg-[#0B192C] hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-md transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 text-amber-400" />
            <span>New Note</span>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search notes..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-white border border-slate-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-xs"
          />
        </div>

        <div className="text-xs font-semibold text-slate-500">
          Total: {notes.length} {notes.length === 1 ? "note" : "notes"}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="p-12 bg-white rounded-2xl border border-slate-200/80 flex items-center justify-center gap-3 text-slate-500 text-xs shadow-xs">
          <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
          <span>Retrieving your private notes from Firestore...</span>
        </div>
      ) : filteredNotes.length === 0 ? (
        <div className="p-12 bg-white rounded-2xl border border-slate-200/80 text-center space-y-3 shadow-xs">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-600">
            <StickyNote className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-800">No notes found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {searchQuery
                ? `No notes matched "${searchQuery}".`
                : "Capture your first strategy note, customer feedback, or supplier agreement memo."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setTitle("");
              setContent("");
              setError(null);
              setIsModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-extrabold transition-all shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create First Note</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredNotes.map(note => (
            <div
              key={note.id}
              className="bg-white p-5 rounded-2xl border border-slate-200/80 hover:border-slate-300 hover:shadow-md transition-all flex flex-col justify-between group"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900 line-clamp-2">
                    {note.title}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setNoteToDelete(note)}
                    title="Delete note"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {note.content && (
                  <p className="text-xs text-slate-600 mt-2.5 leading-relaxed whitespace-pre-wrap line-clamp-5 bg-slate-50/70 p-3 rounded-xl border border-slate-100 font-sans">
                    {note.content}
                  </p>
                )}
              </div>

              <div className="pt-3 mt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  {note.createdAt ? new Date(note.createdAt).toLocaleDateString() : "Today"}
                </span>
                <span className="font-mono text-[10px] text-slate-400">
                  {note.createdAt ? new Date(note.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: NEW NOTE (NO BROWSER PROMPT) */}
      {/* ============================================================ */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in">
          <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 bg-[#0B192C] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-base font-serif">Create New Note</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateNote} className="p-6 space-y-4">
              {error && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Note Title *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. Supplier Payment Terms Renegotiation"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Content / Details (Optional)
                </label>
                <textarea
                  rows={4}
                  placeholder="Write down meeting minutes, action items, financial milestones..."
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 leading-relaxed resize-none"
                />
              </div>

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
                  className="px-5 py-2.5 rounded-xl bg-[#0B192C] hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md flex items-center gap-2 transition-all cursor-pointer disabled:opacity-60"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving to Firestore...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Create Note</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: DELETE NOTE CONFIRMATION (NO BROWSER PROMPT) */}
      {/* ============================================================ */}
      {noteToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in">
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 bg-red-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-red-400" />
                <h3 className="font-bold text-base font-serif">Delete Note</h3>
              </div>
              <button
                type="button"
                disabled={deleteLoading}
                onClick={() => setNoteToDelete(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-red-900 transition-colors cursor-pointer disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-700">
                Are you sure you want to delete note <span className="font-bold text-slate-950">"{noteToDelete.title}"</span>?
              </p>
              <p className="text-xs text-slate-500">
                This document will be permanently removed from your private Firestore collection.
              </p>

              <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100">
                <button
                  type="button"
                  disabled={deleteLoading}
                  onClick={() => setNoteToDelete(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deleteLoading}
                  onClick={handleConfirmDeleteNote}
                  className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-extrabold text-xs shadow-md flex items-center gap-2 transition-all cursor-pointer disabled:opacity-60"
                >
                  {deleteLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Note</span>
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

export default MyNotesSection;
