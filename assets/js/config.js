/* Vaultline — which Firebase project this app talks to.
 *
 * These values are meant to be public. They name the project; they do not grant
 * access. What protects your data is the rule in `firestore.rules`, which lets a
 * signed-in person touch their own documents and nothing else.
 *
 * Empty values are fine too: Vaultline then runs without an account, saving to
 * the browser only, and never touches the network.
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyDGWMaEg6GDaN7MMkLnaTW9HJ6MQ37jDo8',
  authDomain: 'vaultline-5e3bd.firebaseapp.com',
  projectId: 'vaultline-5e3bd',
  storageBucket: 'vaultline-5e3bd.firebasestorage.app',
  messagingSenderId: '488497612274',
  appId: '1:488497612274:web:d6a98e72849c47329ad76b'
};

/* Version of the Firebase Web SDK to load from Google's CDN. If this one is not
 * published, the loader quietly tries the fallbacks below before giving up, so a
 * stale number here is an annoyance rather than a broken sign-in button.
 * Current versions: https://firebase.google.com/support/release-notes/js */
export const firebaseSdkVersion = '11.0.0';
export const firebaseSdkFallbacks = ['12.0.0', '10.14.1'];

export const isConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
