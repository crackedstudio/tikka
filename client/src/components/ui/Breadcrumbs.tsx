import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

export interface BreadcrumbItem {
    label: string;
    href?: string;
}

interface BreadcrumbsProps {
    /** 
     * Optional items to completely override the default path-based breadcrumbs.
     * Useful for deep pages that need custom names (like fetching a raffle title).
     */
    items?: BreadcrumbItem[];
    /**
     * Optional classname
     */
    className?: string;
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ items, className = '' }) => {
    const location = useLocation();

    // Auto-generate items from URL if none are provided
    const generateDefaultItems = (): BreadcrumbItem[] => {
        const pathnames = location.pathname.split('/').filter((x) => x);
        const defaultItems: BreadcrumbItem[] = [{ label: 'Home', href: '/home' }];

        let currentPath = '';
        pathnames.forEach((segment, index) => {
            currentPath += `/${segment}`;
            // Format the segment name: capitalize and replace dashes
            let formattedSegment = segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ');

            // Re-route 'raffles' to say 'Explore' for user familiarity
            if (segment.toLowerCase() === 'raffles') {
                formattedSegment = 'Explore';
            }
            // Re-route 'details' to say 'Explore' since it's the search/explore flow typically
            if (segment.toLowerCase() === 'details') {
                formattedSegment = 'Details';
            }

            defaultItems.push({
                label: formattedSegment,
                href: index === pathnames.length - 1 ? undefined : currentPath
            });
        });

        return defaultItems;
    };

    const breadcrumbItems = items || generateDefaultItems();

    return (
        <nav
            aria-label="Breadcrumb"
            className={`flex items-center text-sm font-medium text-gray-500 overflow-x-auto whitespace-nowrap [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] py-2 ${className}`}
        >
            <ol className="flex items-center space-x-1 sm:space-x-2">
                {breadcrumbItems.map((item, index) => {
                    const isLast = index === breadcrumbItems.length - 1;

                    return (
                        <li key={index} className="flex items-center">
                            {index === 0 && (
                                <Home className="w-4 h-4 mr-1.5 flex-shrink-0" />
                            )}
                            {isLast ? (
                                <span
                                    className="text-gray-900 dark:text-white truncate max-w-[150px] sm:max-w-[250px] md:max-w-[400px]"
                                    title={item.label}
                                >
                                    {item.label}
                                </span>
                            ) : (
                                <Link
                                    to={item.href || '#'}
                                    className="flex items-center hover:text-pink-600 dark:hover:text-[#FE3796] transition-colors"
                                >
                                    {item.label}
                                </Link>
                            )}

                            {!isLast && (
                                <ChevronRight className="w-4 h-4 mx-1 sm:mx-2 text-gray-400 flex-shrink-0" />
                            )}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
};
