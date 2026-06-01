import { User } from 'lucide-react';
import { useAuthContext } from '../../providers/AuthProvider';

export default function ProfileSettingsSection() {
    const { address } = useAuthContext();

    return (
        <section className="bg-white dark:bg-[#11172E] rounded-3xl p-8" aria-label="Profile settings">
            <div className="flex items-center gap-3 mb-6">
                <User className="w-6 h-6 text-purple-500" />
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Profile</h2>
            </div>

            <div className="space-y-4">
                <div>
                    <label className="text-sm text-gray-400 block mb-2">Wallet Address</label>
                    <div className="bg-gray-100 dark:bg-[#1A2238] rounded-xl p-4">
                        <p className="text-gray-900 dark:text-white font-mono text-sm break-all">{address}</p>
                    </div>
                </div>

                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                    <p className="text-blue-300 text-sm">
                        Your profile is linked to your Stellar wallet address. Additional profile features coming soon!
                    </p>
                </div>
            </div>
        </section>
    );
}

