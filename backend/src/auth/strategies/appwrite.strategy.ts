import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-http-bearer';
import { Client, Account } from 'node-appwrite';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppwriteStrategy extends PassportStrategy(Strategy, 'appwrite') {
    private endpoint: string;
    private projectId: string;
    private apiKey: string | undefined;

    constructor(private configService: ConfigService) {
        super();

        this.endpoint = this.configService.get<string>('APPWRITE_ENDPOINT') 
            || this.configService.get<string>('NEXT_PUBLIC_APPWRITE_ENDPOINT') 
            || 'https://fra.cloud.appwrite.io/v1';
        this.projectId = this.configService.get<string>('APPWRITE_PROJECT_ID') 
            || this.configService.get<string>('NEXT_PUBLIC_APPWRITE_PROJECT_ID') 
            || '692932d700154b91c6cb';

        // Server API key for bypassing rate limits in dev/production
        this.apiKey = this.configService.get<string>('APPWRITE_API_KEY');
    }

    async validate(token: string): Promise<any> {
        try {
            // Create a fresh client per request to avoid state conflicts
            const client = new Client()
                .setEndpoint(this.endpoint)
                .setProject(this.projectId);

            // Use API key if available (bypasses rate limits)
            if (this.apiKey) {
                client.setKey(this.apiKey);
            }

            // Set the JWT for this specific request
            client.setJWT(token);

            const account = new Account(client);
            const user = await account.get();

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
