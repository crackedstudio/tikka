import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Search } from 'lucide-react';
import { faqData } from './FAQContent';
import React, { useMemo } from 'react';
import { faqContent } from './FAQContent';

const HighlightText = ({ text, highlight }: { text: string; highlight: string }) => {
  if (!highlight.trim()) {
    return <>{text}</>;
  }
  const escapedHighlight = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedHighlight})`, 'gi');
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-yellow-200 dark:bg-yellow-500/30 text-gray-900 dark:text-yellow-100 rounded-sm px-1">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
};

const FAQItem = ({
  question,
  answer,
  id,
  searchQuery,
  isOpen,
  onToggle,
}: {
  question: string;
  answer: string;
  id: string;
  searchQuery: string;
  isOpen: boolean;
  onToggle: () => void;
}) => {
  const itemRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  useEffect(() => {
    if (location.hash === `#${id}`) {
      setTimeout(() => {
        itemRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [location.hash, id]);

  return (
    <div className="border-b border-gray-200 dark:border-gray-700 last:border-0" id={id} ref={itemRef}>
      <h3>
        <button
          type="button"
          id={`accordion-control-${id}`}
          aria-expanded={isOpen}
          aria-controls={`accordion-section-${id}`}
          onClick={onToggle}
          className="flex w-full items-center justify-between py-5 text-left font-medium text-gray-900 dark:text-white transition-all hover:text-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800 rounded-lg"
        >
          <span>
            <HighlightText text={question} highlight={searchQuery} />
          </span>
          <svg
            className={`w-4 h-4 shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </h3>
      <div
        id={`accordion-section-${id}`}
        role="region"
        aria-labelledby={`accordion-control-${id}`}
        className={`grid transition-all duration-300 ease-in-out ${
          isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <p className="text-gray-600 dark:text-gray-400 leading-relaxed pb-5 pt-1">
            <HighlightText text={answer} highlight={searchQuery} />
          </p>
        </div>
      </div>
    </div>
  );
};

export const FAQPage: React.FC = () => {
  // Flatten array and format valid structural JSON-LD matching Schema.org expectations
  const jsonLdSchema = useMemo(() => {
    const mainEntities = faqContent.flatMap((category) =>
      category.items.map((item) => ({
        "@type": "Question",
        "name": item.question,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": item.answer
        }
      }))
    );

    return JSON.stringify({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": mainEntities
    });
  }, []);

  return (
    <div className="faq-page-container max-w-4xl mx-auto px-4 py-8">
      {/* Dynamic injection of schema structure into the head element */}
      <script 
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdSchema }}
      />

      <header className="mb-10 text-center">
        <h1 className="text-3xl font-bold mb-2">Frequently Asked Questions</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Everything you need to know about Stellar, Soroban Smart Contracts, and Tikka Raffles.
        </p>
      </header>

      <div className="faq-categories-wrapper space-y-8">
        {faqContent.map((category, catIdx) => (
          <section key={catIdx} className="faq-category-block">
            <h2 className="text-xl font-semibold border-b pb-2 mb-4 text-primary">
              {category.title}
            </h2>
            <div className="faq-items-list space-y-4">
              {category.items.map((item, itemIdx) => (
                <details 
                  key={itemIdx} 
                  className="group bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg p-4 transition-all duration-200 cursor-pointer"
                >
                  <summary className="flex justify-between items-center font-medium list-none focus:outline-none select-none">
                    <span className="text-gray-900 dark:text-gray-100 pr-4">
                      {item.question}
                    </span>
                    {/* Native pure-CSS accordion arrow indicator using group styles */}
                    <span className="transition-transform duration-200 transform group-open:rotate-180 text-gray-500">
                      ▼
                    </span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-400 border-t pt-3 border-gray-100 dark:border-zinc-800 pointer-events-none">
                    {item.answer}
                  </p>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

export default FAQPage;
