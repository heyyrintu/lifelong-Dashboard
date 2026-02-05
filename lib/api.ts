import { account } from './appwrite';

// Use proxy route in production (Docker), direct URL in development
const isServer = typeof window === 'undefined';
const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE_URL ||
  (isServer ? 'http://backend:3001' : '/api/backend');

// Cache JWT token to avoid creating new one for every request
let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Get the current Appwrite JWT token
 * Caches the token to avoid excessive Appwrite API calls
 * Token is refreshed if within 1 minute of expiration
 */
async function getAuthToken(): Promise<string> {
    const now = Date.now();
    
    // Return cached token if still valid (with 1 minute buffer)
    if (cachedToken && cachedToken.expiresAt > now + 60000) {
        return cachedToken.token;
    }
    
    try {
        const jwt = await account.createJWT();
        // JWT tokens typically expire after 15 minutes, cache with that assumption
        cachedToken = {
            token: jwt.jwt,
            expiresAt: now + (15 * 60 * 1000), // 15 minutes
        };
        return jwt.jwt;
    } catch (error) {
        console.error('Failed to get auth token:', error);
        // Clear cache on error to force fresh attempt on next request
        cachedToken = null;
        throw new Error('Authentication required. Please log in.');
    }
}

/**
 * Authenticated fetch wrapper that automatically adds Appwrite JWT token
 */
export async function authenticatedFetch(
    endpoint: string,
    options: RequestInit = {}
): Promise<Response> {
    const token = await getAuthToken();

    const headers = {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
    };

    const url = `${BACKEND_URL}${endpoint}`;

    return fetch(url, {
        ...options,
        headers,
    });
}

export { BACKEND_URL };
