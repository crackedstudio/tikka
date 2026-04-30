import React, { useEffect, useState } from "react";
import { fetchRaffles, mapListItemToCardProps } from "../../services/raffleService";
import { ApiRaffleListItem } from "../../types/types";
import RaffleCard from "../cards/RaffleCard";
import { Spinner } from "../ui/Spinner";

const FollowedCreatorsRaffles: React.FC = () => {
    const [followedAddresses, setFollowedAddresses] = useState<string[]>([]);
    
    useEffect(() => {
        const followed = JSON.parse(localStorage.getItem("followed_creators") || "[]");
        setFollowedAddresses(followed);
    }, []);

    if (followedAddresses.length === 0) return null;

    return <FollowedRafflesList addresses={followedAddresses} />;
};

const FollowedRafflesList: React.FC<{ addresses: string[] }> = ({ addresses }) => {
    const [allRaffles, setAllRaffles] = useState<ApiRaffleListItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAll = async () => {
            setLoading(true);
            try {
                // Fetch latest raffles for each creator (max 5 creators for performance)
                const promises = addresses.slice(0, 5).map(addr => 
                    fetchRaffles({ creator: addr, limit: 2, status: "open" })
                );
                const results = await Promise.all(promises);
                const combined = results.flatMap(r => r.raffles || []);
                
                // Sort by created_at desc
                combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                
                // Remove duplicates if any (though shouldn't be since creators are different)
                const unique = Array.from(new Map(combined.map(r => [r.id, r])).values());
                
                setAllRaffles(unique.slice(0, 4));
            } catch (err) {
                console.error("Failed to fetch followed creators raffles", err);
            } finally {
                setLoading(false);
            }
        };
        fetchAll();
    }, [addresses]);

    if (loading) return <div className="flex justify-center py-10"><Spinner /></div>;
    if (allRaffles.length === 0) return null;

    return (
        <div className="w-full mx-auto max-w-7xl px-6 md:px-12 lg:px-16 mb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-bold">Raffles from Creators You Follow</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {allRaffles.map(raffle => (
                    <RaffleCard 
                        key={raffle.id}
                        {...mapListItemToCardProps(raffle)}
                    />
                ))}
            </div>
        </div>
    );
};

export default FollowedCreatorsRaffles;
