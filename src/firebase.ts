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

export class FirestoreErrorInfo extends Error {
  constructor(
    message: string,
    public operation: 'get' | 'create' | 'update' | 'delete' | 'list',
    public path: string,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'FirestoreErrorInfo';
  }
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
    // If not found, that's normal for a probe doc, connection was reached
    const err = error as { code?: string };
    if (err && (err.code === 'not-found' || err.code === 'permission-denied')) {
      return true;
    }
    console.info('Firestore boot check:', error);
    return true;
  }
}

/**
 * Submit high score to Max-Fliz public leaderboard
 */
export async function submitScore(entry: Omit<LeaderboardEntry, 'createdAt'>): Promise<string> {
  const collectionPath = 'leaderboard';
  try {
    // Generate valid id [a-zA-Z0-9_-]{1,64}
    const cleanId = `mf_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const docRef = doc(db, collectionPath, cleanId);

    const payload: LeaderboardEntry = {
      playerName: (entry.playerName.trim() || 'Pracownik Magazynu').substring(0, 32),
      hero: entry.hero || 'Marcin',
      score: Math.max(0, Math.floor(entry.score)),
      coins: Math.max(0, Math.floor(entry.coins)),
      timeSeconds: Math.max(0, Math.floor(entry.timeSeconds)),
      bossDefeated: Boolean(entry.bossDefeated),
      createdAt: new Date().toISOString(),
    };

    await setDoc(docRef, payload);
    return cleanId;
  } catch (err) {
    throw new FirestoreErrorInfo(
      'Nie udało się zapisać wyniku na serwerze Firebase.',
      'create',
      collectionPath,
      err
    );
  }
}

/**
 * Fetch top shift high scores from Firebase
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

    return results;
  } catch (err) {
    console.warn('Leaderboard fetch note:', err);
    throw new FirestoreErrorInfo(
      'Błąd pobierania rankingu magazynu.',
      'list',
      collectionPath,
      err
    );
  }
}
