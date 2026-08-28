import React, { useMemo } from 'react';
import { faqData } from './FAQContent';

export const FAQPage: React.FC = () => {
  // Flatten array and format valid structural JSON-LD matching Schema.org expectations
  const jsonLdSchema = useMemo(() => {
    const mainEntities = faqData.flatMap((category: { title: string; items: { question: string; answer: string; id?: string }[] }) =>
      category.items.map((item: { question: string; answer: string; id?: string }) => ({
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
        {faqData.map((category: { title: string; items: { question: string; answer: string; id?: string }[] }, catIdx: number) => (
          <section key={catIdx} className="faq-category-block">
            <h2 className="text-xl font-semibold border-b pb-2 mb-4 text-primary">
              {category.title}
            </h2>
            <div className="faq-items-list space-y-4">
              {category.items.map((item: { question: string; answer: string; id?: string }, itemIdx: number) => (
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
