import React from "react";
import { useSearchParams } from "react-router-dom";
import { useSearch } from "../hooks/useSearch";
import { toRaffleCardViewModel } from "../components/cards/raffleCardViewModel";
import RaffleCard from "../components/cards/RaffleCard";
import RaffleCardSkeleton from "../components/ui/RaffleCardSkeleton";
import ErrorMessage from "../components/ui/ErrorMessage";
import { Breadcrumbs } from "../components/ui/Breadcrumbs";

const SearchPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const { results, isLoading, error } = useSearch(query);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Breadcrumbs
          items={[{ label: "Home", href: "/home" }, { label: "Explore" }]}
        />
      </div>

      <h1 className="text-2xl font-bold mb-6">
        {query ? `Search results for "${query}"` : "Search Raffles"}
      </h1>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }, (_, index) => (
            <RaffleCardSkeleton key={index} />
          ))}
        </div>
      )}

      {error && !isLoading && (
        <ErrorMessage title="Search failed" message={error.message} />
      )}

      {!isLoading && !error && results.length === 0 && query && (
        <div className="flex items-center justify-center py-20 animate-in fade-in duration-300">
          <p className="text-center text-lg text-gray-600 dark:text-gray-300">
            No raffles match "{query}". Try different keywords.
          </p>
        </div>
      )}

      {!isLoading && !error && results.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {results.map((raffle) => (
            <RaffleCard
              key={raffle.id}
              viewModel={toRaffleCardViewModel(raffle)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default SearchPage;
