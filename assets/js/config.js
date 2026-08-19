/* Vaultline — which Firebase project this app talks to.
 *
 * Paste the config object Firebase gives you under
 *   Project settings -> General -> Your apps -> Web app -> SDK setup, Config
 *
 * These values are meant to be public. They name the project; they do not grant
 * access. What protects your data is the rule in `firestore.rules`, which lets a
 * signed-in person touch nothing except their own documents.
 *
 * Leave the values empty and Vaultline runs happily without an account, saving
 * to this browser only.
 */
export const firebaseConfig = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: ''
};

/* Version of the Firebase Web SDK to load from Google's CDN. If sign-in ever
 * reports that the SDK could not be loaded, put a version that exists here —
 * the list is at https://firebase.google.com/support/release-notes/js */
export const firebaseSdkVersion = '11.0.0';

export const isConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
