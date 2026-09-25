import React from "react";
import type { ReactNode } from "react";

export interface EmptyStateAction {
    /** CTA label text */
    label: string;
    /** When provided, CTA renders as <a href={href}>. Takes precedence over onClick. */
    href?: string;
    /** When href is absent, CTA renders as <button onClick={onClick}>. */
    onClick?: () => void;
}

export interface EmptyStateProps {
    /** Icon or graphic displayed above the title. */
    icon: ReactNode;
    /** Heading text rendered as <h3>. */
    title: string;
    /** Optional secondary description. */
    hint?: string;
    /** Optional single call-to-action. */
    action?: EmptyStateAction;
}

const CTA_CLASSES =
    "bg-[#FF389C] hover:bg-[#FF389C]/90 text-white px-6 py-3 rounded-xl font-medium transition-colors " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF389C] focus-visible:ring-offset-2 " +
    "focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#11172E]";

const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, hint, action }) => {
    const renderCTA = () => {
        if (!action) return null;

        // href takes precedence over onClick when both are supplied
        if (action.href) {
            return (
                <a href={action.href} className={CTA_CLASSES}>
                    {action.label}
                </a>
            );
        }

        if (action.onClick) {
            return (
                <button type="button" onClick={action.onClick} className={CTA_CLASSES}>
                    {action.label}
                </button>
            );
        }

        return null;
    };

    return (
        <div className="text-center py-16">
            {/* Icon container */}
            <div className="w-16 h-16 bg-gray-100 dark:bg-[#2A264A] rounded-full flex items-center justify-center mx-auto mb-4">
                {icon}
            </div>

            {/* Title */}
            <h3 className="text-gray-900 dark:text-white font-semibold mb-2">
                {title}
            </h3>

            {/* Hint */}
            {hint && (
                <p className="text-gray-400 dark:text-gray-400 text-sm mb-6">
                    {hint}
                </p>
            )}

            {/* CTA */}
            {renderCTA()}
        </div>
    );
};

export default EmptyState;
