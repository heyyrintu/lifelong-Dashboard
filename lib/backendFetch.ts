'use client';

import { account } from './appwrite';

export async function backendFetch(input: RequestInfo | URL, init?: RequestInit) {
  // Attempt to create an Appwrite JWT to forward to backend
  // This JWT is short-lived (15 min) and will be invalidated on logout.
  try {
    const jwtResponse = await account.createJWT();
    const jwtToken = (jwtResponse as any)?.jwt as string | undefined;

    const headers = new Headers(init?.headers || {});
    if (jwtToken) {
      headers.set('Authorization', `Bearer ${jwtToken}`);
    }

    // merge headers back into init
    const mergedInit: RequestInit = {
      ...init,
      headers,
    };

    return fetch(input, mergedInit);
  } catch (err) {
    // If we can't create JWT (user not logged in), just do fetch without token
    // and let the backend handle 401
    return fetch(input, init);
  }
}
