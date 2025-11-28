'use client';

import { useEffect } from 'react';
import { client } from '@/lib/appwrite';

export function AppwritePing() {
  useEffect(() => {
    // Ping Appwrite backend server to verify the setup
    client.ping();
  }, []);

  return null;
}

