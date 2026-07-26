import React, { useState, useEffect } from "react";

// Mocking standard layout dependencies. 
// Replace these paths with your project's actual navigation or auth hook components if named differently.
const useAuth = () => {
  // Replace with your real authentication hook (e.g., wallet connection state or auth context)
  return { isAuthenticated: true, address: "0x1234...5678" };
};

const useNavigate = () => {
  return (path: string) => console.log(`Navigating to ${path}`);
};

interface ApiUserHistoryItem {
  id: string;
  title: string;
  ticketCount: number;
  status: "active" | "completed";
  didWin?: boolean;
}

interface CreatedRaffleItem {
  id: string;
  title: string;
  totalTicketsSold: number;
  status: "active" | "completed";
}

type TabState = "entered" | "created";

export const MyRaffles: React.FC = () => {
  const { isAuthenticated, address } = useAuth();
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState<TabState>("entered");
  const [enteredRaffles, setEnteredRaffles] = useState<ApiUserHistoryItem[]>([]);
  const [createdRaffles, setCreatedRaffles] = useState<CreatedRaffleItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // 1. Authentication Route Guard
  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/"); // Redirect to home if not signed in
    }
  }, [isAuthenticated, navigate]);

  // 2. Fetch User Raffle Data
  useEffect(() => {
    if (!isAuthenticated || !address) return;

    setLoading(true);
    
    // Simulating parallel API calls: GET /users/:address/history and GET /raffles?creator=:address
    const fetchData = async () => {
      try {
        // Replace these with your actual axios/fetch backend request calls
        const historyRes = await Promise.resolve([
          { id: "e1", title: "Premium Alpha Pass Raffle", ticketCount: 5, status: "completed", didWin: true },
          { id: "e2", title: "Genesis Land Raffle", ticketCount: 2, status: "active" }
        ] as ApiUserHistoryItem[]);

        const createdRes = await Promise.resolve([
          { id: "c1", title: "Community Token Drop", totalTicketsSold: 142, status: "active" }
        ] as CreatedRaffleItem[]);

        setEnteredRaffles(historyRes);
        setCreatedRaffles(createdRes);
      } catch (error) {
        console.error("Failed to load dashboard data", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isAuthenticated, address]);

  if (!isAuthenticated) return null;

  return (
    <div className="p-6 max-w-5xl mx-auto min-h-screen text-gray-900 dark:text-gray-100">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold">My Raffles Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your active entries and creations for wallet {address}</p>
      </div>

      {/* Segmented Tab Controls */}
      <div className="flex border-b border-gray-200 dark:border-gray-800 mb-6">
        <button
          onClick={() => setActiveTab("entered")}
          className={`px-5 py-3 text-sm font-semibold transition-all border-b-2 ${
            activeTab === "entered"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Entered Raffles ({enteredRaffles.length})
        </button>
        <button
          onClick={() => setActiveTab("created")}
          className={`px-5 py-3 text-sm font-semibold transition-all border-b-2 ${
            activeTab === "created"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Created Raffles ({createdRaffles.length})
        </button>
      </div>

      {/* Loading Skeleton Placeholder View */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-pulse">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-32 bg-gray-100 dark:bg-gray-800 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div>
          {/* 3. Entered Tab Panel View */}
          {activeTab === "entered" && (
            enteredRaffles.length === 0 ? (
              <div className="text-center py-12 border border-dashed rounded-2xl text-gray-500">
                You haven't entered any ticket sweeps yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {enteredRaffles.map((item) => (
                  <div key={item.id} className="p-5 border rounded-2xl bg-white dark:bg-gray-900 shadow-sm flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start gap-2 mb-2">
                        <h3 className="font-bold text-lg truncate">{item.title}</h3>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          item.status === "active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                        }`}>{item.status}</span>
                      </div>
                      <p className="text-sm text-gray-500">{item.ticketCount} tickets registered</p>
                    </div>
                    
                    {/* Win/Loss Status Indicators */}
                    {item.status === "completed" && (
                      <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 flex justify-end">
                        {item.didWin ? (
                          <span className="text-xs font-bold text-green-700 bg-green-50 px-3 py-1 rounded-lg">🎉 Winner</span>
                        ) : (
                          <span className="text-xs font-bold text-red-700 bg-red-50 px-3 py-1 rounded-lg">Better luck next time</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          )}

          {/* 4. Created Tab Panel View */}
          {activeTab === "created" && (
            createdRaffles.length === 0 ? (
              <div className="text-center py-12 border border-dashed rounded-2xl text-gray-500">
                You haven't launched any raffle contracts yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {createdRaffles.map((item) => (
                  <div key={item.id} className="p-5 border rounded-2xl bg-white dark:bg-gray-900 shadow-sm flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start gap-2 mb-2">
                        <h3 className="font-bold text-lg truncate">{item.title}</h3>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          item.status === "active" ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-800"
                        }`}>{item.status}</span>
                      </div>
                      <p className="text-sm text-gray-500">{item.totalTicketsSold} tickets sold total</p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 flex justify-end">
                      <button className="text-xs font-bold text-blue-600 hover:underline">Manage Raffle →</button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
};