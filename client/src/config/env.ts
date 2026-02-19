/**
 * Environment Configuration Validator
 * 
 * This module validates and exports all environment variables used in the application.
 * It provides helpful error messages when required variables are missing.
 */

interface EnvConfig {
    // Stellar Network
    stellar: {
        network: 'testnet' | 'mainnet';
        horizonUrl: string;
        networkPassphrase: string;
    };
    
    // Soroban Contract
    soroban: {
        rpcUrl: string;
        contractAddress?: string;
        deploymentHash?: string;
    };
    
    // Supabase
    supabase: {
        url: string;
        anonKey: string;
        table: string;
    };
    
    // Wallet
    wallet: {
        defaultProvider: string;
        autoConnect: boolean;
    };
    
    // Application
    app: {
        env: 'development' | 'staging' | 'production';
        debugMode: boolean;
        apiTimeout: number;
    };
    
    // Feature Flags
    features: {
        leaderboard: boolean;
        socialShare: boolean;
        emailNotifications: boolean;
    };
    
    // Development
    dev: {
        useDemoData: boolean;
        showDevTools: boolean;
    };
}

/**
 * Get environment variable with validation
 */
function getEnvVar(key: string, required: boolean = false, defaultValue?: string): string {
    const value = import.meta.env[key] || defaultValue;
    
    if (required && !value) {
        throw new Error(
            `Missing required environment variable: ${key}\n` +
            `Please check your .env file and ensure ${key} is set.\n` +
            `See .env.example for reference.`
        );
    }
    
    return value || '';
}

/**
 * Get boolean environment variable
 */
function getBoolEnvVar(key: string, defaultValue: boolean = false): boolean {
    const value = import.meta.env[key];
    if (value === undefined) return defaultValue;
    return value === 'true' || value === '1';
}

/**
 * Get number environment variable
 */
function getNumberEnvVar(key: string, defaultValue: number): number {
    const value = import.meta.env[key];
    if (value === undefined) return defaultValue;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Validate Stellar network configuration
 */
function validateStellarConfig() {
    const network = getEnvVar('VITE_STELLAR_NETWORK', false, 'testnet');
    
    if (network !== 'testnet' && network !== 'mainnet') {
        console.warn(
            `Invalid VITE_STELLAR_NETWORK: ${network}. Defaulting to 'testnet'.\n` +
            `Valid values are: 'testnet' or 'mainnet'`
        );
    }
    
    const horizonUrl = getEnvVar('VITE_STELLAR_HORIZON_URL', false, 'https://horizon-testnet.stellar.org');
    const networkPassphrase = getEnvVar(
        'VITE_STELLAR_NETWORK_PASSPHRASE',
        false,
        'Test SDF Network ; September 2015'
    );
    
    return {
        network: (network === 'mainnet' ? 'mainnet' : 'testnet') as 'testnet' | 'mainnet',
        horizonUrl,
        networkPassphrase,
    };
}

/**
 * Validate Soroban configuration
 */
function validateSorobanConfig() {
    const rpcUrl = getEnvVar('VITE_SOROBAN_RPC_URL', false, 'https://soroban-testnet.stellar.org');
    const contractAddress = getEnvVar('VITE_RAFFLE_CONTRACT_ADDRESS', false);
    const deploymentHash = getEnvVar('VITE_CONTRACT_DEPLOYMENT_HASH', false);
    
    if (!contractAddress) {
        console.warn(
            'VITE_RAFFLE_CONTRACT_ADDRESS is not set.\n' +
            'Contract interactions will not work until you deploy a contract and set this variable.'
        );
    }
    
    return {
        rpcUrl,
        contractAddress,
        deploymentHash,
    };
}

/**
 * Validate Supabase configuration
 */
function validateSupabaseConfig() {
    const url = getEnvVar('VITE_SUPABASE_URL', false);
    const anonKey = getEnvVar('VITE_SUPABASE_ANON_KEY', false);
    const table = getEnvVar('VITE_SUPABASE_TABLE', false, 'raffle_metadata');
    
    if (!url || !anonKey) {
        console.warn(
            'Supabase configuration incomplete.\n' +
            'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required for metadata storage.\n' +
            'See DEVELOPMENT.md for setup instructions.'
        );
    }
    
    return {
        url: url || 'https://your-project.supabase.co',
        anonKey: anonKey || 'your-anon-key',
        table,
    };
}

/**
 * Load and validate all environment variables
 */
function loadEnvConfig(): EnvConfig {
    return {
        stellar: validateStellarConfig(),
        soroban: validateSorobanConfig(),
        supabase: validateSupabaseConfig(),
        wallet: {
            defaultProvider: getEnvVar('VITE_DEFAULT_WALLET', false, 'freighter'),
            autoConnect: getBoolEnvVar('VITE_WALLET_AUTO_CONNECT', false),
        },
        app: {
            env: getEnvVar('VITE_APP_ENV', false, 'development') as 'development' | 'staging' | 'production',
            debugMode: getBoolEnvVar('VITE_DEBUG_MODE', true),
            apiTimeout: getNumberEnvVar('VITE_API_TIMEOUT', 30000),
        },
        features: {
            leaderboard: getBoolEnvVar('VITE_FEATURE_LEADERBOARD', true),
            socialShare: getBoolEnvVar('VITE_FEATURE_SOCIAL_SHARE', true),
            emailNotifications: getBoolEnvVar('VITE_FEATURE_EMAIL_NOTIFICATIONS', false),
        },
        dev: {
            useDemoData: getBoolEnvVar('VITE_USE_DEMO_DATA', true),
            showDevTools: getBoolEnvVar('VITE_SHOW_DEV_TOOLS', true),
        },
    };
}

// Export the validated configuration
export const env = loadEnvConfig();

// Log configuration in development mode
if (env.app.debugMode) {
    console.log('🔧 Environment Configuration Loaded:', {
        network: env.stellar.network,
        sorobanRpc: env.soroban.rpcUrl,
        contractConfigured: !!env.soroban.contractAddress,
        supabaseConfigured: env.supabase.url !== 'https://your-project.supabase.co',
        useDemoData: env.dev.useDemoData,
    });
}

export default env;
