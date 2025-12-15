import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-http-bearer';
import { Client, Account } from 'node-appwrite';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppwriteStrategy extends PassportStrategy(Strategy, 'appwrite') {
    private client: Client;
    private account: Account;

    constructor(private configService: ConfigService) {
        super();

        const endpoint = this.configService.get<string>('APPWRITE_ENDPOINT') || 'https://fra.cloud.appwrite.io/v1';
        const projectId = this.configService.get<string>('APPWRITE_PROJECT_ID') || '692932d700154b91c6cb';

        this.client = new Client()
            .setEndpoint(endpoint)
            .setProject(projectId);

        // Optionally set a server API key for admin operations if present in env
        const apiKey = this.configService.get<string>('APPWRITE_API_KEY');
        if (apiKey) {
            // The setKey method is available on the Appwrite client in the server SDK
            // It gives the backend elevated privileges using the API key.
            // Use with caution and do not expose this key to browsers.
            this.client.setKey(apiKey);
        }

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
        } catch (error: any) {
            throw new UnauthorizedException('Invalid authentication token');
        }
    }
}
