import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  orderBy,
  limit,
  getDocFromServer,
  DocumentData,
} from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged, User } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Firestore targeting the specific provisioned database ID
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Initialize Firebase Authentication
export const auth = getAuth(app);

export interface LeaderboardEntry {
  id?: string;
  playerName: string;
  hero: string;
  score: number;
  coins: number;
  timeSeconds: number;
  bossDefeated: boolean;
  createdAt: string;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): FirestoreErrorInfo {
  const errInfo: FirestoreErrorInfo = {
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
  console.warn('Firestore Error Handled:', JSON.stringify(errInfo));
  return errInfo;
}

let currentUser: User | null = null;
let isAuthInitialized = false;

// Ensure anonymous sign-in for seamless leaderboard attribution
export function initAuth(): Promise<User | null> {
  return new Promise((resolve) => {
    if (isAuthInitialized && currentUser) {
      resolve(currentUser);
      return;
    }

    onAuthStateChanged(auth, (user) => {
      currentUser = user;
      isAuthInitialized = true;
      if (!user) {
        signInAnonymously(auth)
          .then((cred) => {
            currentUser = cred.user;
            resolve(cred.user);
          })
          .catch((err) => {
            console.warn('Anonymous auth note (fallback to guest mode):', err);
            resolve(null);
          });
      } else {
        resolve(user);
      }
    });
  });
}

// Test connection on boot per guidelines
export async function testFirestoreConnection(): Promise<boolean> {
  try {
    const probeDoc = doc(db, 'leaderboard', 'probe-connection');
    await getDocFromServer(probeDoc);
    return true;
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err && (err.code === 'not-found' || err.code === 'permission-denied')) {
      return true;
    }
    if (err && err.message && err.message.includes('offline')) {
      console.warn('Firestore offline mode active.');
    } else {
      handleFirestoreError(error, OperationType.GET, 'leaderboard/probe-connection');
    }
    return false;
  }
}

/**
 * Submit high score to Max-Fliz public leaderboard
 */
export async function submitScore(entry: Omit<LeaderboardEntry, 'createdAt'>): Promise<string> {
  const collectionPath = 'leaderboard';
  const cleanId = `mf_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const payload: LeaderboardEntry = {
    playerName: (entry.playerName.trim() || 'Pracownik Magazynu').substring(0, 32),
    hero: entry.hero || 'Marcin',
    score: Math.max(0, Math.floor(entry.score)),
    coins: Math.max(0, Math.floor(entry.coins)),
    timeSeconds: Math.max(0, Math.floor(entry.timeSeconds)),
    bossDefeated: Boolean(entry.bossDefeated),
    createdAt: new Date().toISOString(),
  };

  // Cache locally immediately so result is never lost
  try {
    const raw = localStorage.getItem('maxfliz_cached_leaderboard');
    const list: LeaderboardEntry[] = raw ? JSON.parse(raw) : [];
    list.push({ ...payload, id: cleanId });
    list.sort((a, b) => b.score - a.score);
    localStorage.setItem('maxfliz_cached_leaderboard', JSON.stringify(list.slice(0, 20)));
  } catch {}

  try {
    const docRef = doc(db, collectionPath, cleanId);
    await setDoc(docRef, payload);
    return cleanId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `${collectionPath}/${cleanId}`);
    return `local_${Date.now()}`;
  }
}

/**
 * Fetch top shift high scores from Firebase with graceful local cache fallback
 */
export async function getTopLeaderboard(maxEntries = 10): Promise<LeaderboardEntry[]> {
  const collectionPath = 'leaderboard';
  try {
    const q = query(
      collection(db, collectionPath),
      orderBy('score', 'desc'),
      limit(maxEntries)
    );

    const snapshot = await getDocs(q);
    const results: LeaderboardEntry[] = [];
    snapshot.forEach((d) => {
      const data = d.data() as DocumentData;
      results.push({
        id: d.id,
        playerName: data.playerName || 'Magazynier',
        hero: data.hero || 'Marcin',
        score: Number(data.score) || 0,
        coins: Number(data.coins) || 0,
        timeSeconds: Number(data.timeSeconds) || 0,
        bossDefeated: Boolean(data.bossDefeated),
        createdAt: data.createdAt || '',
      });
    });

    if (results.length > 0) {
      try {
        localStorage.setItem('maxfliz_cached_leaderboard', JSON.stringify(results));
      } catch {}
      return results;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, collectionPath);
  }

  // Graceful fallback to cached high scores
  try {
    const raw = localStorage.getItem('maxfliz_cached_leaderboard');
    if (raw) {
      const cached = JSON.parse(raw) as LeaderboardEntry[];
      if (Array.isArray(cached) && cached.length > 0) {
        return cached;
      }
    }
  } catch {}

  return [];
}
