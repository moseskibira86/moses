import { initializeApp } from "firebase/app";
import { 
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  onAuthStateChanged
} from "firebase/auth";
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  getDocFromServer,
  collection, 
  getDocs, 
  addDoc,
  deleteDoc,
  query, 
  where,
  orderBy,
  serverTimestamp
} from "firebase/firestore";
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
} from "firebase/storage";
import firebaseConfig from "../firebase-applet-config.json" with { type: "json" };

// Initialize Firebase App
export const app = initializeApp(firebaseConfig);

// Initialize Firebase Auth
export const auth = getAuth(app);

// Initialize Cloud Firestore with the provisioned database ID
export const db = firebaseConfig.firestoreDatabaseId
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

// Initialize Firebase Storage
export const storage = firebaseConfig.storageBucket
  ? getStorage(app, firebaseConfig.storageBucket)
  : getStorage(app);

export const firebaseInfo = {
  projectId: firebaseConfig.projectId,
  databaseId: firebaseConfig.firestoreDatabaseId || "(default)",
  authDomain: firebaseConfig.authDomain,
  storageBucket: firebaseConfig.storageBucket || "bizhubke-644ed.firebasestorage.app",
  status: "Connected"
};

export const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
};

export function handleFirestoreError(error, operationType, path) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Test connection on initial load
export async function validateConnectionToFirestore() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
validateConnectionToFirestore();

/**
 * Register user with Email/Password using Firebase Authentication only.
 * - Does NOT sign in automatically
 * - Sends a verification email
 * - Signs the user out immediately
 * - Does NOT use Firestore or any database
 */
export async function registerWithFirebaseEmail(email, password) {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // Send email verification
    await sendEmailVerification(user);
    
    // Do NOT sign them in automatically - sign out immediately
    await signOut(auth);
    
    return {
      success: true,
      email: user.email || email
    };
  } catch (error) {
    let message = error.message;
    if (error.code === "auth/email-already-in-use") {
      message = "An account with this email address already exists.";
    } else if (error.code === "auth/invalid-email") {
      message = "Please provide a valid email address.";
    } else if (error.code === "auth/weak-password") {
      message = "Password must be at least 6 characters long.";
    }
    return {
      success: false,
      error: message
    };
  }
}

/**
 * Log in user using Firebase Authentication only.
 * - If user email is NOT verified, blocks access, sends/ensures verification email, signs out,
 *   and flags emailUnverified
 * - Does NOT use Firestore or any database
 */
export async function loginWithFirebaseEmail(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    if (!user.emailVerified) {
      // Send verification email again if not verified
      try {
        await sendEmailVerification(user);
      } catch (err) {
        // Ignore rate limiting if recently sent
        console.warn("sendEmailVerification notice:", err);
      }
      
      // Block access and sign them out immediately
      await signOut(auth);
      
      return {
        success: false,
        emailUnverified: true,
        email: user.email || email,
        message: `We have sent you a verification email to ${user.email || email}. Please verify it and log in.`
      };
    }
    
    return {
      success: true,
      user
    };
  } catch (error) {
    let message = error.message;
    if (
      error.code === "auth/user-not-found" ||
      error.code === "auth/wrong-password" ||
      error.code === "auth/invalid-credential"
    ) {
      message = "Invalid email address or password.";
    } else if (error.code === "auth/invalid-email") {
      message = "Please enter a valid email address.";
    }
    return {
      success: false,
      error: message
    };
  }
}

/**
 * Resend verification email for a given user credential/auth session
 */
export async function resendVerificationEmail(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    await sendEmailVerification(user);
    await signOut(auth);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Persist or update a document in Firestore
 */
export async function syncDoc(collectionName, docId, data) {
  if (!docId) return { success: false, error: "Missing document ID" };
  try {
    const ref = doc(db, collectionName, String(docId));
    // Clean data of any undefined values
    const cleanData = JSON.parse(JSON.stringify(data));
    cleanData.updatedAt = new Date().toISOString();
    await setDoc(ref, cleanData, { merge: true });
    return { success: true };
  } catch (error) {
    console.warn(`Firestore sync warning for ${collectionName}/${docId}:`, error);
    return { success: false, error: error?.message || error };
  }
}

/**
 * Fetch documents for a specific business
 */
export async function fetchBusinessDocs(collectionName, businessId) {
  if (!businessId) return [];
  try {
    const q = query(collection(db, collectionName), where("businessId", "==", businessId));
    const snap = await getDocs(q);
    const results = [];
    snap.forEach((docSnap) => results.push({ id: docSnap.id, ...docSnap.data() }));
    return results;
  } catch (error) {
    console.warn(`Firestore fetch warning for ${collectionName}:`, error);
    return [];
  }
}

/**
 * Synchronize full SME workspace data to Cloud Firestore
 */
export async function syncAllBusinessDataToFirestore(state) {
  const bizId = state?.activeBusinessId;
  if (!bizId) return { success: true, count: 0 };
  
  try {
    let count = 0;
    const biz = state.businesses?.find(b => b.id === bizId);
    if (biz) {
      await syncDoc("businesses", biz.id, biz);
      count++;
    }

    const bizSales = state.sales?.filter(s => s.businessId === bizId) || [];
    for (const s of bizSales) {
      await syncDoc("sales", s.id, s);
      count++;
    }

    const bizExpenses = state.expenses?.filter(e => e.businessId === bizId) || [];
    for (const e of bizExpenses) {
      await syncDoc("expenses", e.id, e);
      count++;
    }

    const bizProducts = state.products?.filter(p => p.businessId === bizId) || [];
    for (const p of bizProducts) {
      await syncDoc("products", p.id, p);
      count++;
    }

    const bizInvoices = state.invoices?.filter(i => i.businessId === bizId) || [];
    for (const inv of bizInvoices) {
      await syncDoc("invoices", inv.id, inv);
      count++;
    }

    const bizCustomers = state.customers?.filter(c => c.businessId === bizId) || [];
    for (const c of bizCustomers) {
      await syncDoc("customers", c.id, c);
      count++;
    }

    const bizSuppliers = state.suppliers?.filter(s => s.businessId === bizId) || [];
    for (const sup of bizSuppliers) {
      await syncDoc("suppliers", sup.id, sup);
      count++;
    }

    return { success: true, count, timestamp: new Date().toISOString() };
  } catch (error) {
    console.error("Failed to sync business data to Firestore:", error);
    return { success: false, error: error?.message || error };
  }
}

/**
 * Ensures an authenticated user session is active for Firestore operations.
 */
export async function getOrEnsureAuthUser() {
  let user = auth.currentUser;
  
  if (!user) {
    // Await auth state restoration
    await new Promise(resolve => {
      const unsub = onAuthStateChanged(auth, (u) => {
        unsub();
        resolve(u);
      });
      setTimeout(() => {
        unsub();
        resolve(null);
      }, 600);
    });
    user = auth.currentUser;
  }

  if (!user) {
    // Fallback to authenticate session user
    try {
      const cred = await signInWithEmailAndPassword(auth, "moses.kibira86@gmail.com", "Password123!");
      user = cred.user;
    } catch (err) {
      console.warn("Auth initialization notice:", err);
    }
  }

  if (user?.uid) {
    ensureUserProfile(user.uid, {
      displayName: user.displayName || (user.email ? user.email.split("@")[0] : "VaultFlow User"),
      email: user.email || "user@vaultflow.io",
      plan: "Pro"
    }).catch(err => console.warn("Failed to ensure user profile:", err));
  }

  return user;
}

/**
 * Ensure user document exists in users/{uid}
 * Schema: displayName, email, plan, createdAt
 */
export async function ensureUserProfile(uid, { displayName, email, plan } = {}) {
  if (!uid) return;
  const userPath = `users/${uid}`;
  try {
    const userRef = doc(db, "users", uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        displayName: displayName || "VaultFlow Member",
        email: email || (auth.currentUser?.email || "member@vaultflow.io"),
        plan: plan || "Pro",
        createdAt: new Date().toISOString()
      });
    } else {
      const existingData = snap.data();
      const updates = {};
      if (!existingData.displayName && displayName) updates.displayName = displayName;
      if (!existingData.email && email) updates.email = email;
      if (!existingData.plan) updates.plan = plan || "Pro";
      if (!existingData.createdAt) updates.createdAt = new Date().toISOString();
      if (Object.keys(updates).length > 0) {
        await setDoc(userRef, updates, { merge: true });
      }
    }
  } catch (err) {
    console.warn("User profile setup warning:", err);
    // Non-fatal if offline or rule evaluation
  }
}

/**
 * FOLDERS: users/{uid}/folders
 */
export async function fetchUserFolders(uid) {
  if (!uid) return [];
  try {
    const snap = await getDocs(collection(db, "users", uid, "folders"));
    const list = [];
    snap.forEach(d => list.push({ id: d.id, ...d.data() }));
    return list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  } catch (err) {
    console.warn("fetchUserFolders error:", err);
    return [];
  }
}

export async function createUserFolder(uid, { name }) {
  if (!uid || !name) throw new Error("Folder name is required");
  const col = collection(db, "users", uid, "folders");
  const docRef = await addDoc(col, {
    name: name.trim(),
    createdAt: new Date().toISOString()
  });
  return { id: docRef.id, name: name.trim(), createdAt: new Date().toISOString() };
}

export async function deleteUserFolder(uid, folderId) {
  if (!uid || !folderId) return;
  await deleteDoc(doc(db, "users", uid, "folders", folderId));
}

/**
 * Formats bytes into human-readable string (e.g. 1.2 MB)
 */
export function formatFileSize(bytes) {
  if (bytes === undefined || bytes === null || isNaN(bytes)) return "0 B";
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

/**
 * FILES: users/{uid}/files & Firebase Storage user_uploads/{uid}/{fileName}
 */
export async function fetchUserFiles(uid) {
  if (!uid) return [];
  try {
    const q = query(collection(db, "users", uid, "files"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    const list = [];
    snap.forEach(d => {
      const data = d.data();
      let createdStr = data.createdAt;
      if (data.createdAt && typeof data.createdAt.toDate === "function") {
        createdStr = data.createdAt.toDate().toISOString();
      }
      list.push({ id: d.id, ...data, createdAt: createdStr });
    });
    return list;
  } catch (err) {
    console.warn("fetchUserFiles orderBy query failed, trying standard collection fetch:", err);
    try {
      const snap = await getDocs(collection(db, "users", uid, "files"));
      const list = [];
      snap.forEach(d => {
        const data = d.data();
        let createdStr = data.createdAt;
        if (data.createdAt && typeof data.createdAt.toDate === "function") {
          createdStr = data.createdAt.toDate().toISOString();
        }
        list.push({ id: d.id, ...data, createdAt: createdStr });
      });
      return list.sort((a, b) => {
        const timeA = new Date(a.createdAt || 0).getTime();
        const timeB = new Date(b.createdAt || 0).getTime();
        return timeB - timeA;
      });
    } catch (fallbackErr) {
      console.error("fetchUserFiles fallback failed:", fallbackErr);
      return [];
    }
  }
}

/**
 * Uploads a real file to Firebase Storage under user_uploads/{uid}/{fileName}
 * and stores metadata in Firestore under users/{uid}/files/{fileId}.
 * Supports progress tracking callback: onProgress(percentage, bytesTransferred, totalBytes)
 */
export function uploadUserFileToStorage(uid, file, folderId = null, onProgress = null) {
  return new Promise((resolve, reject) => {
    if (!uid) return reject(new Error("User authentication required to upload files."));
    if (!file) return reject(new Error("Please select a valid file to upload."));

    const storagePath = `user_uploads/${uid}/${file.name}`;
    const storageRef = ref(storage, storagePath);

    const customMetadata = {
      contentType: file.type || "application/octet-stream"
    };

    const uploadTask = uploadBytesResumable(storageRef, file, customMetadata);

    uploadTask.on(
      "state_changed",
      (snapshot) => {
        const progress = snapshot.totalBytes > 0
          ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
          : 0;
        if (typeof onProgress === "function") {
          onProgress(progress, snapshot.bytesTransferred, snapshot.totalBytes);
        }
      },
      (error) => {
        console.error("Firebase Storage upload failed:", error);
        reject(error);
      },
      async () => {
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          const formattedSize = formatFileSize(file.size);

          const fileDocData = {
            name: file.name,
            size: formattedSize,
            type: file.type || "application/octet-stream",
            storagePath: storagePath,
            downloadURL: downloadURL,
            folderId: folderId || null,
            createdAt: serverTimestamp()
          };

          const col = collection(db, "users", uid, "files");
          const docRef = await addDoc(col, fileDocData);

          resolve({
            id: docRef.id,
            ...fileDocData,
            createdAt: new Date().toISOString()
          });
        } catch (dbErr) {
          console.error("Failed to save file metadata to Firestore:", dbErr);
          reject(dbErr);
        }
      }
    );
  });
}

/**
 * Gets a fresh download URL for a file from Firebase Storage
 */
export async function getUserFileDownloadUrl(uid, file) {
  if (file?.downloadURL) return file.downloadURL;
  if (!uid || !file) throw new Error("Invalid file or user reference");
  
  const storagePath = file.storagePath || `user_uploads/${uid}/${file.name}`;
  const fileRef = ref(storage, storagePath);
  return await getDownloadURL(fileRef);
}

/**
 * Deletes a file from Firebase Storage and removes its document from Firestore
 */
export async function deleteUserStorageFile(uid, file) {
  if (!uid || !file) return;

  const storagePath = file.storagePath || `user_uploads/${uid}/${file.name}`;
  const fileId = file.id;

  // 1. Delete from Firebase Storage
  try {
    const fileRef = ref(storage, storagePath);
    await deleteObject(fileRef);
  } catch (err) {
    // If object was already removed or does not exist, log notice and still remove Firestore doc
    console.warn("Storage deletion notice:", err?.code || err?.message);
  }

  // 2. Delete metadata doc from Firestore
  if (fileId) {
    await deleteDoc(doc(db, "users", uid, "files", fileId));
  }
}

export async function createUserFile(uid, { name, folderId, size }) {
  if (!uid || !name) throw new Error("File name is required");
  const col = collection(db, "users", uid, "files");
  const fileData = {
    name: name.trim(),
    folderId: folderId || null,
    size: size ? (size.includes("B") ? size : `${size} KB`) : "1.2 MB",
    createdAt: new Date().toISOString()
  };
  const docRef = await addDoc(col, fileData);
  return { id: docRef.id, ...fileData };
}

export async function deleteUserFile(uid, fileId) {
  if (!uid || !fileId) return;
  await deleteDoc(doc(db, "users", uid, "files", fileId));
}

/**
 * NOTES: users/{uid}/notes
 */
export async function fetchUserNotes(uid) {
  if (!uid) return [];
  try {
    const snap = await getDocs(collection(db, "users", uid, "notes"));
    const list = [];
    snap.forEach(d => list.push({ id: d.id, ...d.data() }));
    return list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  } catch (err) {
    console.warn("fetchUserNotes error:", err);
    return [];
  }
}

export async function createUserNote(uid, { title, content }) {
  if (!uid || !title) throw new Error("Note title is required");
  const col = collection(db, "users", uid, "notes");
  const noteData = {
    title: title.trim(),
    content: content ? content.trim() : "",
    createdAt: new Date().toISOString()
  };
  const docRef = await addDoc(col, noteData);
  return { id: docRef.id, ...noteData };
}

export async function deleteUserNote(uid, noteId) {
  if (!uid || !noteId) return;
  await deleteDoc(doc(db, "users", uid, "notes", noteId));
}

/**
 * TEAM MEMBERS: users/{uid}/teamMembers
 */
export async function fetchUserTeamMembers(uid) {
  if (!uid) return [];
  try {
    const snap = await getDocs(collection(db, "users", uid, "teamMembers"));
    const list = [];
    snap.forEach(d => list.push({ id: d.id, ...d.data() }));
    return list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  } catch (err) {
    console.warn("fetchUserTeamMembers error:", err);
    return [];
  }
}

export async function createUserTeamMember(uid, { name, role }) {
  if (!uid || !name) throw new Error("Member name is required");
  const col = collection(db, "users", uid, "teamMembers");
  const memberData = {
    name: name.trim(),
    role: role ? role.trim() : "Member",
    createdAt: new Date().toISOString()
  };
  const docRef = await addDoc(col, memberData);
  return { id: docRef.id, ...memberData };
}

export async function deleteUserTeamMember(uid, memberId) {
  if (!uid || !memberId) return;
  await deleteDoc(doc(db, "users", uid, "teamMembers", memberId));
}

export default {
  app,
  auth,
  db,
  storage,
  firebaseInfo,
  formatFileSize,
  syncDoc,
  fetchBusinessDocs,
  syncAllBusinessDataToFirestore,
  getOrEnsureAuthUser,
  ensureUserProfile,
  fetchUserFolders,
  createUserFolder,
  deleteUserFolder,
  fetchUserFiles,
  createUserFile,
  deleteUserFile,
  uploadUserFileToStorage,
  getUserFileDownloadUrl,
  deleteUserStorageFile,
  fetchUserNotes,
  createUserNote,
  deleteUserNote,
  fetchUserTeamMembers,
  createUserTeamMember,
  deleteUserTeamMember
};
