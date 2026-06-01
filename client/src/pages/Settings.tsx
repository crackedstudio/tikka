/**
 * Settings Page
 *
 * User settings and preferences management
 * Includes notification preferences and account settings
 */

import { useState } from 'react';
import { Settings as SettingsIcon, Bell, User } from 'lucide-react';
import NotificationSettingsSection from '../components/settings/NotificationSettingsSection';
import ProfileSettingsSection from '../components/settings/ProfileSettingsSection';







import { useAuthContext } from '../providers/AuthProvider';
import { Breadcrumbs } from '../components/ui/Breadcrumbs';

type SettingsTab = 'notifications' | 'profile';

export default function Settings() {
  const { isAuthenticated } = useAuthContext();
  const [activeTab, setActiveTab] = useState<SettingsTab>('notifications');


  if (!isAuthenticated) {
    return (
      <div className="w-full mx-auto max-w-7xl px-6 md:px-12 lg:px-16 py-12">
        <div className="bg-white dark:bg-[#11172E] rounded-3xl p-8 text-center">
          <SettingsIcon className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Settings</h2>
          <p className="text-gray-400 mb-6">
            Please sign in to access your settings and preferences.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full mx-auto max-w-7xl px-6 md:px-12 lg:px-16 py-12">
      <div className="mb-2">
        <Breadcrumbs />
      </div>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-2">Settings</h1>
        <p className="text-gray-400">Manage your account and preferences</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-700">
        <button
          onClick={() => setActiveTab('notifications')}
          className={`
            flex items-center gap-2 px-6 py-3 font-medium transition-colors
            ${activeTab === 'notifications'
              ? 'text-purple-400 border-b-2 border-purple-400'
              : 'text-gray-400 hover:text-gray-700 dark:text-gray-300'
            }
          `}
        >
          <Bell className="w-5 h-5" />
          Notifications
        </button>
        <button
          onClick={() => setActiveTab('profile')}
          className={`
            flex items-center gap-2 px-6 py-3 font-medium transition-colors
            ${activeTab === 'profile'
              ? 'text-purple-400 border-b-2 border-purple-400'
              : 'text-gray-400 hover:text-gray-700 dark:text-gray-300'
            }
          `}
        >
          <User className="w-5 h-5" />
          Profile
        </button>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'notifications' && <NotificationSettingsSection />}
        {activeTab === 'profile' && <ProfileSettingsSection />}
      </div>
    </div>
  );
}
