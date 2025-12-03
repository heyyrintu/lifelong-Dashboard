import { Client, Account, Databases } from "appwrite";

// Sanitize endpoint URL - remove any escaped quotes that might be added by deployment platforms
const sanitizeUrl = (url: string | undefined): string => {
  if (!url) return 'https://fra.cloud.appwrite.io/v1';
  // Remove escaped quotes and regular quotes from the URL
  return url.replace(/\\"/g, '').replace(/"/g, '').trim();
};

const client = new Client()
  .setEndpoint(sanitizeUrl(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT))
  .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || '692932d700154b91c6cb');

const account = new Account(client);
const databases = new Databases(client);

export { client, account, databases };