import { Client, Account, Databases } from "appwrite";

const client = new Client()
    .setEndpoint("https://fra.cloud.appwrite.io/v1")
    .setProject("692932d700154b91c6cb");

const account = new Account(client);
const databases = new Databases(client);

export { client, account, databases };

