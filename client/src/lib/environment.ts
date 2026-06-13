export type Environment = 'dev' | 'staging' | 'prod';

export interface EnvironmentConfig {
    name: Environment;
    displayName: string;
    baseUrl: string;
}

export const ENVIRONMENTS: Record<Environment, EnvironmentConfig> = {
    dev: {
        name: 'dev',
        displayName: 'Development',
        baseUrl: 'https://heron-selected-literally.ngrok-free.app'
    },
    staging: {
        name: 'staging',
        displayName: 'Staging',
        baseUrl: 'https://staging-calendar.witcc.dev'
    },
    prod: {
        name: 'prod',
        displayName: 'Production',
        baseUrl: 'https://server-calendar.witcc.dev'
    }
};

interface StoredEnvironmentData {
    current_environment: Environment;
    jwt_tokens: Partial<Record<Environment, string>>;
}

export class EnvironmentManager {
    private static readonly STORAGE_KEY = 'environment_data';

    public static async getEnvironmentData(): Promise<StoredEnvironmentData> {
        const result = await chrome.storage.local.get(this.STORAGE_KEY);
        return result[this.STORAGE_KEY] || {
            current_environment: 'dev',
            jwt_tokens: {}
        };
    }

    public static async getCurrentEnvironment(): Promise<Environment> {
        const data = await this.getEnvironmentData();
        return data.current_environment;
    }

    public static async getCurrentEnvironmentConfig(): Promise<EnvironmentConfig> {
        const env = await this.getCurrentEnvironment();
        return ENVIRONMENTS[env];
    }

    public static async getBaseUrl(): Promise<string> {
        const config = await this.getCurrentEnvironmentConfig();
        return config.baseUrl;
    }

    public static async getJwtToken(environment?: Environment): Promise<string | undefined> {
        const data = await this.getEnvironmentData();
        const env = environment || data.current_environment;
        return data.jwt_tokens[env];
    }

    public static async setJwtToken(token: string, environment?: Environment): Promise<void> {
        const data = await this.getEnvironmentData();
        const env = environment || data.current_environment;
        data.jwt_tokens[env] = token;
        await chrome.storage.local.set({ [this.STORAGE_KEY]: data });
    }

    public static async switchEnvironment(environment: Environment): Promise<boolean> {
        const data = await this.getEnvironmentData();
        data.current_environment = environment;
        await chrome.storage.local.set({ [this.STORAGE_KEY]: data });

        return !!data.jwt_tokens[environment];
    }

    public static async clearJwtToken(environment?: Environment): Promise<void> {
        const data = await this.getEnvironmentData();
        const env = environment || data.current_environment;
        delete data.jwt_tokens[env];
        await chrome.storage.local.set({ [this.STORAGE_KEY]: data });
    }

    public static async clearAllData(): Promise<void> {
        await chrome.storage.local.remove(this.STORAGE_KEY);
    }

    public static async getAuthenticatedEnvironments(): Promise<Environment[]> {
        const data = await this.getEnvironmentData();
        return Object.keys(data.jwt_tokens) as Environment[];
    }

    public static async migrateOldJwtToken(): Promise<void> {
        const result = await chrome.storage.local.get('jwt_token');
        if (result.jwt_token) {
            await this.setJwtToken(result.jwt_token, 'dev');
            await chrome.storage.local.remove('jwt_token');
        }
    }
}
