import React, { useState, useEffect, useRef } from "react";
import { 
  Folder, 
  FolderPlus, 
  FileText, 
  FilePlus, 
  Trash2, 
  Loader2, 
  Search, 
  HardDrive, 
  Calendar, 
  X, 
  Filter,
  Check,
  AlertCircle,
  Download,
  Upload,
  CloudUpload,
  CheckCircle2,
  Sparkles
} from "lucide-react";
import { 
  getOrEnsureAuthUser, 
  fetchUserFolders, 
  createUserFolder, 
  deleteUserFolder, 
  fetchUserFiles, 
  createUserFile,
  deleteUserFile,
  uploadUserFileToStorage, 
  getUserFileDownloadUrl, 
  deleteUserStorageFile,
  formatFileSize 
} from "../firebase.js";

export const MyFilesSection = ({ currentUser }) => {
  const MAX_FREE_FILES = 5;
  const [loading, setLoading] = useState(true);
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [selectedFolderId, setSelectedFolderId] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [authUser, setAuthUser] = useState(null);

  // Free plan limit & Upgrade modal
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const isLimitReached = Boolean(authUser?.uid && files.length >= MAX_FREE_FILES);

  // Folder modal
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderLoading, setFolderLoading] = useState(false);
  const [folderError, setFolderError] = useState(null);

  // Folder delete confirmation modal (no browser prompt)
  const [folderToDelete, setFolderToDelete] = useState(null);
  const [folderDeleteLoading, setFolderDeleteLoading] = useState(false);

  // File modal: "Upload File" (Firebase Storage + Firestore)
  const [isFileModalOpen, setIsFileModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileFolderId, setFileFolderId] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [fileError, setFileError] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  // File download state
  const [downloadingId, setDownloadingId] = useState(null);

  // File delete confirmation modal (no browser prompt)
  const [fileToDelete, setFileToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  // Global inline notice for completed actions
  const [globalNotice, setGlobalNotice] = useState(null);

  // Load user files & folders
  useEffect(() => {
    let mounted = true;
    const loadData = async () => {
      setLoading(true);
      const user = await getOrEnsureAuthUser();
      if (!mounted) return;
      setAuthUser(user);

      if (user?.uid) {
        try {
          const [loadedFolders, loadedFiles] = await Promise.all([
            fetchUserFolders(user.uid),
            fetchUserFiles(user.uid)
          ]);
          if (mounted) {
            setFolders(loadedFolders);
            setFiles(loadedFiles);
          }
        } catch (err) {
          console.warn("Failed loading files/folders:", err);
        }
      }
      if (mounted) setLoading(false);
    };

    loadData();
    return () => { mounted = false; };
  }, [currentUser?.email]);

  // Dismiss global notice after 5 seconds
  useEffect(() => {
    if (!globalNotice) return;
    const timer = setTimeout(() => {
      setGlobalNotice(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [globalNotice]);

  // Handle Create Folder
  const handleCreateFolder = async (e) => {
    e.preventDefault();
    if (!folderName.trim()) {
      setFolderError("Please provide a folder name.");
      return;
    }
    if (!authUser?.uid) {
      setFolderError("Authentication required. Please refresh.");
      return;
    }

    setFolderLoading(true);
    setFolderError(null);
    try {
      const newFolder = await createUserFolder(authUser.uid, { name: folderName.trim() });
      setFolders(prev => [newFolder, ...prev]);
      setFolderName("");
      setIsFolderModalOpen(false);
      setGlobalNotice({
        type: "success",
        message: `Folder "${newFolder.name}" created successfully.`
      });
    } catch (err) {
      setFolderError(err?.message || "Failed to create folder.");
    } finally {
      setFolderLoading(false);
    }
  };

  // Handle Delete Folder Confirmation
  const handleConfirmDeleteFolder = async () => {
    if (!authUser?.uid || !folderToDelete) return;
    setFolderDeleteLoading(true);
    try {
      await deleteUserFolder(authUser.uid, folderToDelete.id);
      setFolders(prev => prev.filter(f => f.id !== folderToDelete.id));
      if (selectedFolderId === folderToDelete.id) {
        setSelectedFolderId("all");
      }
      const removedName = folderToDelete.name;
      setFolderToDelete(null);
      setGlobalNotice({
        type: "success",
        message: `Folder "${removedName}" deleted.`
      });
    } catch (err) {
      console.warn("Delete folder failed:", err);
    } finally {
      setFolderDeleteLoading(false);
    }
  };

  // Handle File Input Selection
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setFileError(null);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
      setFileError(null);
    }
  };

  // Handle Upload File (Storage + Firestore)
  const handleUploadFile = async (e) => {
    e.preventDefault();
    if (!authUser?.uid) {
      setFileError("Authentication required. Please sign in or refresh.");
      return;
    }
    if (!selectedFile) {
      setFileError("Please select a file to upload.");
      return;
    }
    if (files.length >= MAX_FREE_FILES) {
      setFileError("You’ve reached the free plan limit.");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setFileError(null);

    try {
      const uploadedFile = await uploadUserFileToStorage(
        authUser.uid,
        selectedFile,
        fileFolderId || null,
        (progress) => {
          setUploadProgress(progress);
        }
      );

      // Update UI immediately (add row in the table)
      setFiles(prev => [uploadedFile, ...prev]);
      setIsFileModalOpen(false);
      setSelectedFile(null);
      setFileFolderId("");
      setUploadProgress(0);
      setGlobalNotice({
        type: "success",
        message: `File "${uploadedFile.name}" successfully uploaded.`
      });
    } catch (err) {
      console.error("Upload failed:", err);
      setFileError(err?.message || "Failed to upload file to Firebase Storage.");
    } finally {
      setIsUploading(false);
    }
  };

  // Handle File Download (Open safely in new tab or trigger download, no alerts)
  const handleDownloadFile = async (file) => {
    if (!authUser?.uid || !file) return;
    setDownloadingId(file.id);
    setGlobalNotice(null);

    try {
      const downloadURL = file.downloadURL || (await getUserFileDownloadUrl(authUser.uid, file));
      if (!downloadURL) throw new Error("Could not retrieve download link.");

      const link = document.createElement("a");
      link.href = downloadURL;
      link.download = file.name || "download";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setGlobalNotice({
        type: "success",
        message: `Download started for "${file.name}".`
      });
    } catch (err) {
      console.error("Download failed:", err);
      setGlobalNotice({
        type: "error",
        message: `Download failed: ${err?.message || "Storage error"}`
      });
    } finally {
      setDownloadingId(null);
    }
  };

  // Handle Confirm Delete File (Storage + Firestore)
  const handleConfirmDeleteFile = async () => {
    if (!authUser?.uid || !fileToDelete) return;
    setDeleteLoading(true);
    setDeleteError(null);

    try {
      await deleteUserStorageFile(authUser.uid, fileToDelete);
      // Update UI instantly
      setFiles(prev => prev.filter(f => f.id !== fileToDelete.id));
      const deletedName = fileToDelete.name;
      setFileToDelete(null);
      setGlobalNotice({
        type: "success",
        message: `"${deletedName}" permanently deleted from Storage & Firestore.`
      });
    } catch (err) {
      console.error("Delete failed:", err);
      setDeleteError(err?.message || "Failed to delete file.");
    } finally {
      setDeleteLoading(false);
    }
  };

  // Filtered files
  const filteredFiles = files.filter(f => {
    const matchesFolder = selectedFolderId === "all" || f.folderId === selectedFolderId;
    const matchesSearch = !searchQuery || f.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFolder && matchesSearch;
  });

  const getFolderName = (fId) => {
    if (!fId) return null;
    const f = folders.find(item => item.id === fId);
    return f ? f.name : null;
  };

  if (!loading && !authUser) {
    return (
      <div className="p-8 sm:p-12 bg-white rounded-3xl border border-red-200 text-center space-y-4 shadow-sm max-w-lg mx-auto my-8">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center text-red-600">
          <AlertCircle className="w-7 h-7" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-slate-900">Access Restricted</h2>
          <p className="text-xs sm:text-sm text-slate-500">
            You must be logged in to view and upload files. Please sign in to your account.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200/60">
              Firebase Storage + Firestore
            </span>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
              isLimitReached
                ? "bg-amber-100 text-amber-900 border-amber-300"
                : "bg-slate-100 text-slate-700 border-slate-200"
            }`}>
              Free Plan: {files.length}/{MAX_FREE_FILES} files
            </span>
            <span className="text-xs text-slate-500 font-mono">
              {authUser ? `UID: ${authUser.uid.slice(0, 8)}...` : "Connecting..."}
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 font-serif mt-1">My Files & Documents</h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Upload files directly to Firebase Storage with secured metadata in your private Firestore vault.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              setFolderName("");
              setFolderError(null);
              setIsFolderModalOpen(true);
            }}
            className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs sm:text-sm flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
          >
            <FolderPlus className="w-4 h-4 text-amber-500" />
            <span>New Folder</span>
          </button>

          {isLimitReached && (
            <button
              type="button"
              onClick={() => setIsUpgradeModalOpen(true)}
              className="px-3.5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs sm:text-sm flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-slate-950" />
              <span>Upgrade</span>
            </button>
          )}

          <button
            type="button"
            disabled={isLimitReached}
            onClick={() => {
              if (isLimitReached) return;
              setSelectedFile(null);
              setFileFolderId(selectedFolderId !== "all" ? selectedFolderId : "");
              setUploadProgress(0);
              setFileError(null);
              setIsFileModalOpen(true);
            }}
            title={isLimitReached ? "You’ve reached the free plan limit." : "Upload new file"}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all ${
              isLimitReached
                ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed shadow-none"
                : "bg-[#0B192C] hover:bg-emerald-700 text-white shadow-md cursor-pointer"
            }`}
          >
            <Upload className={`w-4 h-4 ${isLimitReached ? "text-slate-400" : "text-emerald-400"}`} />
            <span>Add File</span>
          </button>
        </div>
      </div>

      {/* Free Plan Limit Notice Banner */}
      {isLimitReached && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs animate-in fade-in">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 border border-amber-300/60 flex items-center justify-center text-amber-700 shrink-0 mt-0.5 sm:mt-0">
              <AlertCircle className="w-5 h-5 text-amber-700" />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-950">
                You’ve reached the free plan limit.
              </p>
              <p className="text-xs text-amber-800/90 mt-0.5">
                Free plan includes up to {MAX_FREE_FILES} files ({files.length} of {MAX_FREE_FILES} files used). Upgrade your plan to store unlimited files and documents.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsUpgradeModalOpen(true)}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow-sm transition-all shrink-0 cursor-pointer self-start sm:self-auto"
          >
            <Sparkles className="w-3.5 h-3.5 text-slate-950" />
            <span>Upgrade</span>
          </button>
        </div>
      )}

      {/* Global In-App Notification Banner */}
      {globalNotice && (
        <div className={`p-3.5 rounded-xl text-xs font-bold flex items-center justify-between shadow-xs transition-all ${
          globalNotice.type === "success" 
            ? "bg-emerald-50 border border-emerald-200 text-emerald-800" 
            : "bg-red-50 border border-red-200 text-red-800"
        }`}>
          <div className="flex items-center gap-2">
            {globalNotice.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{globalNotice.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setGlobalNotice(null)}
            className="p-1 rounded hover:bg-black/5 text-slate-500 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Filter / Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search documents by name..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-white border border-slate-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-xs"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <span className="text-xs font-semibold text-slate-500 flex items-center gap-1 shrink-0">
            <Filter className="w-3.5 h-3.5" /> Filter:
          </span>
          <button
            type="button"
            onClick={() => setSelectedFolderId("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
              selectedFolderId === "all"
                ? "bg-slate-900 text-white shadow-xs"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            All Files ({files.length})
          </button>
          {folders.map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setSelectedFolderId(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                selectedFolderId === f.id
                  ? "bg-amber-500 text-slate-950 font-extrabold shadow-xs"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              <Folder className="w-3.5 h-3.5" />
              <span>{f.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Folders Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-400">
            Folders ({folders.length})
          </h2>
        </div>

        {loading ? (
          <div className="p-8 bg-white rounded-2xl border border-slate-200/80 flex items-center justify-center gap-3 text-slate-500 text-xs">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
            <span>Loading your folders from Firestore...</span>
          </div>
        ) : folders.length === 0 ? (
          <div className="p-6 bg-slate-50 rounded-2xl border border-dashed border-slate-300 text-center space-y-2">
            <div className="w-10 h-10 mx-auto rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600">
              <FolderPlus className="w-5 h-5" />
            </div>
            <p className="text-xs font-bold text-slate-700">No folders created yet</p>
            <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
              Organize your invoices, business licenses, and tax documents into structured folders.
            </p>
            <button
              type="button"
              onClick={() => {
                setFolderName("");
                setFolderError(null);
                setIsFolderModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-800 text-xs font-bold hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <FolderPlus className="w-3.5 h-3.5 text-amber-500" />
              Create First Folder
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {folders.map(folder => {
              const fileCount = files.filter(f => f.folderId === folder.id).length;
              const isSelected = selectedFolderId === folder.id;
              return (
                <div
                  key={folder.id}
                  onClick={() => setSelectedFolderId(isSelected ? "all" : folder.id)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer group flex flex-col justify-between ${
                    isSelected
                      ? "bg-amber-50/70 border-amber-300 shadow-xs ring-2 ring-amber-400/40"
                      : "bg-white border-slate-200/80 hover:border-slate-300 hover:shadow-xs"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="w-10 h-10 rounded-xl bg-amber-100/80 flex items-center justify-center text-amber-600">
                      <Folder className="w-5 h-5" />
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFolderToDelete(folder);
                      }}
                      title="Delete folder"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="mt-3">
                    <h3 className="text-sm font-bold text-slate-900 truncate">{folder.name}</h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">{fileCount} {fileCount === 1 ? "file" : "files"}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Files Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-400">
            Files & Documents ({filteredFiles.length})
          </h2>
          {selectedFolderId !== "all" && (
            <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 font-medium">
              Filtered by folder: {getFolderName(selectedFolderId)}
            </span>
          )}
        </div>

        {loading ? (
          <div className="p-10 bg-white rounded-2xl border border-slate-200/80 flex items-center justify-center gap-3 text-slate-500 text-xs">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
            <span>Fetching files from Firestore & Cloud Storage...</span>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="p-10 bg-white rounded-2xl border border-slate-200/80 text-center space-y-3 shadow-xs">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-600">
              <HardDrive className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-800">No files found</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {searchQuery
                  ? `No documents matching "${searchQuery}".`
                  : "You haven't uploaded any files to this view yet."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (isLimitReached) {
                  setIsUpgradeModalOpen(true);
                  return;
                }
                setSelectedFile(null);
                setFileFolderId(selectedFolderId !== "all" ? selectedFolderId : "");
                setUploadProgress(0);
                setFileError(null);
                setIsFileModalOpen(true);
              }}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer ${
                isLimitReached
                  ? "bg-amber-500 hover:bg-amber-400 text-slate-950 font-black"
                  : "bg-slate-900 hover:bg-emerald-600 text-white"
              }`}
            >
              {isLimitReached ? <Sparkles className="w-3.5 h-3.5 text-slate-950" /> : <Upload className="w-3.5 h-3.5" />}
              <span>{isLimitReached ? "Upgrade Plan (Limit Reached)" : "Upload First File"}</span>
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs divide-y divide-slate-100 overflow-hidden">
            {/* Table Header: name, type, size, actions */}
            <div className="hidden sm:grid grid-cols-12 gap-4 px-5 py-3 bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200/80">
              <div className="col-span-5">Name</div>
              <div className="col-span-3">Type</div>
              <div className="col-span-2">Size</div>
              <div className="col-span-2 text-right">Actions</div>
            </div>

            {/* Table Rows */}
            {filteredFiles.map(file => {
              const folderLabel = getFolderName(file.folderId);
              const isDownloading = downloadingId === file.id;

              return (
                <div
                  key={file.id}
                  className="p-4 sm:px-5 sm:py-3.5 grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 items-center hover:bg-slate-50/80 transition-colors group"
                >
                  {/* Name column */}
                  <div className="sm:col-span-5 flex items-center gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200/80 flex items-center justify-center text-slate-600 shrink-0">
                      <FileText className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-900 truncate" title={file.name}>
                          {file.name}
                        </span>
                        {folderLabel && (
                          <span className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200/80 text-amber-800 text-[10px] font-bold shrink-0">
                            {folderLabel}
                          </span>
                        )}
                        {file.storagePath && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-emerald-50 text-emerald-700 border border-emerald-200/60 hidden md:inline">
                            Storage
                          </span>
                        )}
                      </div>
                      <div className="sm:hidden flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                        <span className="font-mono uppercase">{file.type ? file.type.split("/")[1] || file.type : "FILE"}</span>
                        <span>•</span>
                        <span className="font-semibold">{file.size || "Unknown"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Type column */}
                  <div className="hidden sm:flex sm:col-span-3 items-center min-w-0">
                    <span 
                      className="px-2.5 py-0.5 rounded-md text-[11px] font-mono bg-slate-100 text-slate-700 border border-slate-200/80 truncate max-w-full"
                      title={file.type || "application/octet-stream"}
                    >
                      {file.type ? file.type.replace("application/", "").replace("image/", "IMG/").toUpperCase() : "DOCUMENT"}
                    </span>
                  </div>

                  {/* Size column */}
                  <div className="hidden sm:flex sm:col-span-2 items-center text-xs font-semibold text-slate-600">
                    {file.size || "Unknown"}
                  </div>

                  {/* Actions column: Download + Delete */}
                  <div className="sm:col-span-2 flex items-center justify-end gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={isDownloading}
                      onClick={() => handleDownloadFile(file)}
                      title="Download file from Firebase Storage"
                      className="p-2 rounded-lg text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {isDownloading ? (
                        <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setFileToDelete(file);
                        setDeleteError(null);
                      }}
                      title="Delete file permanently"
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
      </div>

      {/* ============================================================ */}
      {/* MODAL: NEW FOLDER (NO BROWSER PROMPT) */}
      {/* ============================================================ */}
      {isFolderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in">
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 bg-[#0B192C] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FolderPlus className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-base font-serif">Create New Folder</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsFolderModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateFolder} className="p-6 space-y-4">
              {folderError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{folderError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Folder Name *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. KRA Certificates & Tax Filing"
                  value={folderName}
                  onChange={e => setFolderName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100">
                <button
                  type="button"
                  disabled={folderLoading}
                  onClick={() => setIsFolderModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={folderLoading}
                  className="px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs shadow-md flex items-center gap-2 transition-all cursor-pointer disabled:opacity-60"
                >
                  {folderLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Create Folder</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: DELETE FOLDER CONFIRMATION (NO BROWSER PROMPT) */}
      {/* ============================================================ */}
      {folderToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in">
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 bg-red-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-red-400" />
                <h3 className="font-bold text-base font-serif">Delete Folder</h3>
              </div>
              <button
                type="button"
                disabled={folderDeleteLoading}
                onClick={() => setFolderToDelete(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm font-semibold text-slate-800">
                Are you sure you want to delete the folder <span className="font-bold text-slate-900">"{folderToDelete.name}"</span>?
              </p>
              <p className="text-xs text-slate-500">
                Files within this folder will not be erased; they will remain available in your Root Files collection.
              </p>

              <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100">
                <button
                  type="button"
                  disabled={folderDeleteLoading}
                  onClick={() => setFolderToDelete(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={folderDeleteLoading}
                  onClick={handleConfirmDeleteFolder}
                  className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-extrabold text-xs shadow-md flex items-center gap-2 transition-all cursor-pointer disabled:opacity-60"
                >
                  {folderDeleteLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Folder</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: UPLOAD FILE (IN-APP MODAL: "Upload File") */}
      {/* ============================================================ */}
      {isFileModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in">
          <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 bg-[#0B192C] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-base font-serif">Upload File</h3>
              </div>
              <button
                type="button"
                disabled={isUploading}
                onClick={() => setIsFileModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUploadFile} className="p-6 space-y-4">
              {fileError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{fileError}</span>
                </div>
              )}

              {/* Hidden File Input */}
              <input
                ref={fileInputRef}
                type="file"
                disabled={isUploading}
                onChange={handleFileChange}
                className="hidden"
              />

              {/* File Picker Zone */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Choose File *
                </label>
                {selectedFile ? (
                  <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate" title={selectedFile.name}>
                          {selectedFile.name}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {formatFileSize(selectedFile.size)} • {selectedFile.type || "application/octet-stream"}
                        </p>
                      </div>
                    </div>
                    {!isUploading && (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold shrink-0 cursor-pointer shadow-2xs"
                      >
                        Change
                      </button>
                    )}
                  </div>
                ) : (
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer ${
                      isDragging
                        ? "border-emerald-500 bg-emerald-50/60"
                        : "border-slate-300 hover:border-emerald-500 hover:bg-slate-50/80 bg-slate-50/40"
                    }`}
                  >
                    <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-100/70 flex items-center justify-center text-emerald-700 mb-2">
                      <CloudUpload className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-bold text-slate-800">
                      Click to choose file or drag & drop
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Files are saved to Firebase Storage under <span className="font-mono text-[11px] text-slate-600">user_uploads/{'{uid}'}/...</span>
                    </p>
                  </div>
                )}
              </div>

              {/* Optional Folder Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Folder (Optional)
                </label>
                <select
                  disabled={isUploading}
                  value={fileFolderId}
                  onChange={e => setFileFolderId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white cursor-pointer disabled:bg-slate-100"
                >
                  <option value="">No folder (Root level)</option>
                  {folders.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>

              {/* Upload Progress Bar */}
              {isUploading && (
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                      Uploading to Firebase Storage...
                    </span>
                    <span className="font-mono text-emerald-700">{uploadProgress}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-600 transition-all duration-150 rounded-full"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Modal Actions */}
              <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => setIsFileModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploading || !selectedFile}
                  className="px-5 py-2.5 rounded-xl bg-[#0B192C] hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                      <span>Uploading ({uploadProgress}%)...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Upload File</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: DELETE FILE CONFIRMATION (NO BROWSER PROMPT) */}
      {/* ============================================================ */}
      {fileToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in">
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 bg-red-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-red-400" />
                <h3 className="font-bold text-base font-serif">Delete File</h3>
              </div>
              <button
                type="button"
                disabled={deleteLoading}
                onClick={() => {
                  setFileToDelete(null);
                  setDeleteError(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {deleteError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{deleteError}</span>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-800">
                  Are you sure you want to permanently delete this file?
                </p>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-3">
                  <FileText className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">{fileToDelete.name}</p>
                    <p className="text-[11px] text-slate-500 font-semibold">{fileToDelete.size || "Unknown size"}</p>
                  </div>
                </div>
                <p className="text-xs text-slate-500">
                  This file will be permanently removed from Firebase Storage and its metadata record will be erased from Firestore.
                </p>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100">
                <button
                  type="button"
                  disabled={deleteLoading}
                  onClick={() => {
                    setFileToDelete(null);
                    setDeleteError(null);
                  }}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deleteLoading}
                  onClick={handleConfirmDeleteFile}
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
                      <span>Delete File</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: UPGRADE YOUR PLAN (NO REAL PAYMENTS, UI ONLY) */}
      {/* ============================================================ */}
      {isUpgradeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in">
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 bg-[#0B192C] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-base font-serif">Upgrade your plan</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsUpgradeModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
                    Free Plan Limit
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-amber-200/80 text-amber-950 text-[11px] font-black">
                    {files.length} / {MAX_FREE_FILES} files used
                  </span>
                </div>
                <p className="text-xs text-amber-900 font-medium">
                  You’ve reached the free plan limit.
                </p>
              </div>

              <div className="space-y-3">
                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                  Upgrade to the Pro plan to unlock unlimited document uploads, extended cloud storage capacity, and priority syncing across all your devices.
                </p>
                <div className="space-y-2 pt-1">
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Unlimited files and folders</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>50 GB cloud storage in Firebase</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Priority multi-device synchronization</span>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <p className="text-[11px] text-slate-400 italic">
                  * Demo mode: no real payments or charges are processed.
                </p>
              </div>

              <div className="pt-3 flex items-center justify-end border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsUpgradeModalOpen(false)}
                  className="px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyFilesSection;
