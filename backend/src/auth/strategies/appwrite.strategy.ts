import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-http-bearer';
import { Client, Account } from 'node-appwrite';

@Injectable()
export class AppwriteStrategy extends PassportStrategy(Strategy, 'appwrite') {
    private client: Client;
    private account: Account;

    constructor() {
        super();

        this.client = new Client()
            .setEndpoint(process.env.APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
            .setProject(process.env.APPWRITE_PROJECT_ID || '');

        this.account = new Account(this.client);
    }

    async validate(token: string): Promise<any> {
        try {
            // Set the JWT for this request
            this.client.setJWT(token);

            // Verify the token by fetching the user
            const user = await this.account.get();

            return {
                id: user.$id,
                email: user.email,
                name: user.name,
            };
        } catch (error) {
            throw new UnauthorizedException('Invalid authentication token');
        }
    }
}
