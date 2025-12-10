import { account } from './appwrite';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';

/**
 * Get the current Appwrite JWT token
 */
async function getAuthToken(): Promise<string> {
    try {
        const jwt = await account.createJWT();
        return jwt.jwt;
    } catch (error) {
        console.error('Failed to get auth token:', error);
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
