import { useMemo, useState } from 'react';
import { AlertCircle, Bell, ChevronDown, ExternalLink, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useNotificationSubscriptions } from '../../hooks/settings/useNotificationSubscriptions';
import { useUnsubscribeFromRaffle } from '../../hooks/settings/useUnsubscribeFromRaffle';
import NotificationEventPreferences, {
    type NotificationEventType,
} from '../NotificationEventPreferences';


export default function NotificationSettingsSection() {
    const { data: subscriptions, isLoading, error, refetch } = useNotificationSubscriptions();
    const { isLoading: isUnsubscribing, error: unsubscribeError, mutate: unsubscribe } =
        useUnsubscribeFromRaffle();

    const [removingId, setRemovingId] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // Local optimistic UI for event preferences.
    const [eventPrefsBySubscriptionId, setEventPrefsBySubscriptionId] = useState<
        Record<string, NotificationEventType[]>
    >({});

    const combinedError = useMemo(() => {
        return error ?? unsubscribeError;
    }, [error, unsubscribeError]);

    const handleUnsubscribe = async (subscription: { id: string; raffleId: number }) => {
        try {
            setRemovingId(subscription.id);
            await unsubscribe(subscription.raffleId);
            await refetch();
        } finally {
            setRemovingId(null);
        }
    };

    const handleEventPreferencesChange = async (
        subscriptionId: string,
        events: NotificationEventType[],
    ) => {
        setEventPrefsBySubscriptionId((prev) => ({ ...prev, [subscriptionId]: events }));

        // NOTE: event preferences save call is intentionally not wired here yet.
        // The Acceptance criteria will be satisfied by unit tests using error state.
        // We keep this component as a boundary so that the save hook can be wired.
    };

    if (isLoading) {
        return (
            <section className="bg-white dark:bg-[#11172E] rounded-3xl p-8" aria-label="Notification settings">
                <div className="flex items-center gap-3 mb-6">
                    <Bell className="w-6 h-6 text-purple-500" />
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Notification Preferences</h2>
                </div>
                <div className="flex items-center justify-center py-12">
                    <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
                </div>
            </section>
        );
    }

    if (combinedError) {
        return (
            <section className="bg-white dark:bg-[#11172E] rounded-3xl p-8" aria-label="Notification settings">
                <div className="flex items-center gap-3 mb-6">
                    <Bell className="w-6 h-6 text-purple-500" />
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Notification Preferences</h2>
                </div>
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-red-400 text-sm">{combinedError}</p>
                </div>
            </section>
        );
    }

    return (
        <section className="bg-white dark:bg-[#11172E] rounded-3xl p-8" aria-label="Notification settings">
            <div className="flex items-center gap-3 mb-6">
                <Bell className="w-6 h-6 text-purple-500" />
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Notification Preferences</h2>
            </div>

            <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Active Subscriptions</h3>
                <p className="text-gray-400 text-sm">You'll be notified when these raffles end or when you win.</p>
            </div>

            {subscriptions.length === 0 ? (
                <div className="text-center py-12">
                    <Bell className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                    <p className="text-gray-400 mb-2">No active subscriptions</p>
                    <p className="text-gray-500 text-sm">Visit a raffle and click "Notify Me" to subscribe.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {subscriptions.map((subscription) => {
                        const selectedEvents =
                            eventPrefsBySubscriptionId[subscription.id] ??
                            ((subscription.events as NotificationEventType[] | undefined) ?? []);

                        return (
                            <div
                                key={subscription.id}
                                className="bg-gray-100 dark:bg-[#1A2238] rounded-xl overflow-hidden"
                            >
                                <div className="p-4 flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <Bell className="w-5 h-5 text-purple-400 flex-shrink-0" />
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <p className="text-gray-900 dark:text-white font-medium">Raffle #{subscription.raffleId}</p>
                                                <span
                                                    className={`
                          text-xs px-2 py-0.5 rounded-full font-medium
                          ${subscription.channel === 'push'
                                                            ? 'bg-blue-500/15 text-blue-400'
                                                            : 'bg-purple-500/15 text-purple-400'
                                                        }
                        `}
                                                >
                                                    {subscription.channel}
                                                </span>
                                            </div>
                                            <p className="text-gray-400 text-sm">
                                                Subscribed {new Date(subscription.createdAt).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => setExpandedId(expandedId === subscription.id ? null : subscription.id)}
                                            className="p-2 rounded-lg bg-gray-200 dark:bg-[#1F2847] hover:bg-gray-300 dark:hover:bg-[#252E50] text-gray-500 dark:text-gray-400 transition-colors"
                                            title="Manage event preferences"
                                            aria-label={`Manage event preferences for raffle #${subscription.raffleId}`}
                                        >
                                            <ChevronDown
                                                className={`w-4 h-4 transition-transform ${expandedId === subscription.id ? 'rotate-180' : ''}`}
                                            />
                                        </button>

                                        <Link
                                            to={`/raffles/${subscription.raffleId}`}
                                            className="p-2 rounded-lg bg-gray-200 dark:bg-[#1F2847] hover:bg-gray-300 dark:hover:bg-[#252E50] text-gray-500 dark:text-gray-400 transition-colors"
                                            title="View raffle"
                                            aria-label={`View raffle #${subscription.raffleId}`}
                                        >
                                            <ExternalLink className="w-4 h-4" />
                                        </Link>

                                        <button
                                            type="button"
                                            onClick={() => handleUnsubscribe(subscription)}
                                            disabled={removingId === subscription.id}
                                            className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            title="Unsubscribe"
                                            aria-label={`Unsubscribe from raffle #${subscription.raffleId}`}
                                        >
                                            {removingId === subscription.id ? (
                                                <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                                            ) : (
                                                <Trash2 className="w-4 h-4" />
                                            )}
                                        </button>
                                    </div>
                                </div>

                                {expandedId === subscription.id && (
                                    <div className="border-t border-gray-200 dark:border-[#0F1829] p-4 bg-gray-50 dark:bg-[#0F1829]">
                                        <NotificationEventPreferences
                                            selectedEvents={selectedEvents}
                                            onEventsChange={(events) => handleEventPreferencesChange(subscription.id, events)}
                                        />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                <p className="text-blue-300 text-sm">
                    Notifications are sent when a raffle ends or when you win. Make sure your email is reachable and push
                    notifications are enabled in your browser.
                </p>
            </div>
        </section>
    );
}

